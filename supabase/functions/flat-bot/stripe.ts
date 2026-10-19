// Подписка через Stripe: 7 дней бесплатно, затем ежемесячная оплата.
// Доступ (уведомления + приложение) — пока подписка trialing/active, у админа и у тех, кому выдан comp.
// Пока Stripe не настроен (нет ключа или цены) — доступ у всех.
import { isAdmin, langOf, logEvent, meta, setMeta, sql } from "./db.ts";
import { fmtDate, intlLocale, L, langOr, tr } from "./i18n.ts";
import type { Lang } from "./i18n.ts";
import { esc, say, SELF_URL, tg, token } from "./tg.ts";

export const ACCESS_STATUSES = ["trialing", "active"];
const BLOCKED_STATUSES = ["past_due", "unpaid", "canceled", "incomplete_expired", "paused"];
const TRIAL_DAYS = 7;
export const FREE_VIEWS = 10; // столько объявлений можно открыть без подписки

// почта для проверки «триал уже был»: регистр, точки и +метки у Gmail не делают её новой
export function normEmail(e: string) {
  let [user, domain] = e.trim().toLowerCase().split("@");
  if (!domain) return e.trim().toLowerCase();
  user = user.split("+")[0];
  if (domain === "gmail.com" || domain === "googlemail.com") {
    user = user.replace(/\./g, "");
    domain = "gmail.com";
  }
  return `${user}@${domain}`;
}

// триал с этой почтой уже брали на другом аккаунте Telegram
async function trialTakenByEmail(chat: number) {
  const [me] = await sql`select email_norm from flatbot.subscribers where chat_id = ${chat}`;
  if (!me?.email_norm) return false;
  const [other] = await sql`select 1 from flatbot.subscribers
                            where email_norm = ${me.email_norm} and chat_id <> ${chat} and trial_used limit 1`;
  return !!other;
}

export async function cfg() {
  const key = Deno.env.get("STRIPE_SECRET_KEY") || (await meta("stripe_secret_key")) || "";
  const price = Deno.env.get("STRIPE_PRICE_ID") || (await meta("stripe_price_id")) || "";
  const whsec = Deno.env.get("STRIPE_WEBHOOK_SECRET") || (await meta("stripe_webhook_secret")) || "";
  return { key, price, whsec, enabled: !!(key && price) };
}

// form-urlencoded с вложенными ключами: { line_items: [{ price: "x" }] } → line_items[0][price]=x
function form(obj: Record<string, unknown>, prefix = "", out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v == null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((x, i) => (typeof x === "object" ? form(x as any, `${key}[${i}]`, out) : out.append(`${key}[${i}]`, String(x))));
    else if (typeof v === "object") form(v as any, key, out);
    else out.append(key, String(v));
  }
  return out;
}

export async function stripe(path: string, params?: Record<string, unknown>, method = "POST"): Promise<any> {
  const { key } = await cfg();
  const r = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/x-www-form-urlencoded",
      // одинаковый запрос (повтор после сбоя сети) Stripe выполнит один раз
      ...(method === "POST" && params?.__idem ? { "idempotency-key": String(params.__idem) } : {}),
    },
    body: method === "POST" ? form(Object.fromEntries(Object.entries(params ?? {}).filter(([k]) => k !== "__idem"))) : undefined,
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`stripe ${path}: ${j.error?.message ?? r.status}`);
  return j;
}

// цена для экрана подписки (кешируем на сутки)
export async function priceInfo() {
  const c = await cfg();
  if (!c.enabled) return null;
  const cached = await meta("stripe_price");
  if (cached && cached.id === c.price && Date.now() - cached.at < 86400_000) return cached;
  const p = await stripe(`prices/${c.price}`, undefined, "GET");
  const info = {
    id: p.id, amount: p.unit_amount / 100, currency: String(p.currency).toUpperCase(),
    interval: p.recurring?.interval ?? "month", intervalCount: p.recurring?.interval_count ?? 1, at: Date.now(),
  };
  await setMeta("stripe_price", info);
  return info;
}

export async function accessOf(chat: number) {
  const c = await cfg();
  const [s] = await sql`select sub_status, trial_end, period_end, comp, trial_used, cancel_at_period_end, stripe_customer, email,
                          retention_used, (select count(*)::int from flatbot.free_views f where f.chat_id = ${chat}) as free_used
                        from flatbot.subscribers where chat_id = ${chat}`;
  const admin = await isAdmin(chat);
  const ok = !c.enabled || admin || !!s?.comp || ACCESS_STATUSES.includes(s?.sub_status);
  const trialBlocked = await trialTakenByEmail(chat);
  return {
    ok,
    enabled: c.enabled,
    reason: !c.enabled ? "free" : admin ? "admin" : s?.comp ? "comp" : s?.sub_status ?? "none",
    status: s?.sub_status ?? null,
    trialEnd: s?.trial_end ?? null,
    periodEnd: s?.period_end ?? null,
    cancelAtPeriodEnd: !!s?.cancel_at_period_end,
    trialAvailable: !s?.trial_used && !trialBlocked,
    retentionUsed: !!s?.retention_used,
    // бесплатный просмотр до подписки: сколько объявлений уже открыто из FREE_VIEWS
    preview: { used: s?.free_used ?? 0, limit: FREE_VIEWS },
    hasCustomer: !!s?.stripe_customer,
    email: s?.email ?? null,
  };
}

// SQL-условие «у подписчика есть доступ» для рассылок
export async function accessFilter() {
  const c = await cfg();
  if (!c.enabled) return () => true;
  const admins = ((await meta("admins")) ?? []).map(Number);
  return (row: any) =>
    admins.includes(Number(row.chat_id)) || !!row.comp || ACCESS_STATUSES.includes(row.sub_status ?? "");
}

let botName = "";
async function botLink(start: string) {
  if (!botName) botName = (await tg("getMe", {})).username;
  return `https://t.me/${botName}?start=${start}`;
}

export const validEmail = (e: unknown) =>
  typeof e === "string" && e.length <= 200 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e.trim());

async function ensureCustomer(chat: number) {
  const [s] = await sql`select stripe_customer, name, username, email from flatbot.subscribers where chat_id = ${chat}`;
  if (s?.stripe_customer) {
    // почту могли поменять — обновляем, чтобы чеки шли на актуальную
    if (s.email) await stripe(`customers/${s.stripe_customer}`, { email: s.email }).catch((e) => console.error("customer email", e));
    return s.stripe_customer as string;
  }
  const cu = await stripe("customers", {
    email: s?.email || undefined,
    name: s?.name || undefined,
    description: s?.username ? `Telegram @${s.username}` : `Telegram ${chat}`,
    metadata: { chat_id: chat, username: s?.username ?? "" },
    __idem: `customer-${chat}-${s?.email ?? ""}`,
  });
  await sql`update flatbot.subscribers set stripe_customer = ${cu.id} where chat_id = ${chat}`;
  return cu.id as string;
}

// Ссылка на оплату: новый Checkout (с триалом, если ещё не был) или портал, если подписка уже есть
export async function payLink(chat: number): Promise<string> {
  const c = await cfg();
  const [s] = await sql`select stripe_sub, sub_status, trial_used from flatbot.subscribers where chat_id = ${chat}`;
  const noTrial = !!s?.trial_used || (await trialTakenByEmail(chat));
  const customer = await ensureCustomer(chat);
  // есть подписка, которую можно оплатить/восстановить — через портал клиента
  if (s?.stripe_sub && ["past_due", "unpaid", "active", "trialing"].includes(s.sub_status)) {
    try {
      const p = await stripe("billing_portal/sessions", { customer, return_url: await botLink("paid") });
      return p.url;
    } catch (e) {
      console.error("portal", e); // портал не настроен в Stripe — дальше обычный Checkout
    }
  }
  const session = await stripe("checkout/sessions", {
    mode: "subscription",
    customer,
    client_reference_id: chat,
    line_items: [{ price: c.price, quantity: 1 }],
    subscription_data: {
      metadata: { chat_id: chat },
      trial_period_days: noTrial ? undefined : TRIAL_DAYS,
    },
    metadata: { chat_id: chat },
    allow_promotion_codes: true,
    success_url: await botLink("paid"),
    cancel_url: await botLink("pay_cancel"),
  });
  await logEvent(chat, "checkout_open", { trial: !noTrial });
  return session.url;
}

// «Проверить подписку»: берём актуальное состояние из Stripe, не дожидаясь вебхука.
// Ищем по клиенту этого чата, а если его нет — по почте, но только среди клиентов,
// созданных для этого же Telegram-аккаунта (metadata.chat_id), чтобы нельзя было
// «присвоить» чужую подписку, просто зная почту.
export async function syncSubscription(chat: number) {
  const c = await cfg();
  if (!c.enabled) return accessOf(chat);
  const [s] = await sql`select stripe_customer, email from flatbot.subscribers where chat_id = ${chat}`;
  const customers: string[] = [];
  if (s?.stripe_customer) customers.push(s.stripe_customer);
  if (s?.email) {
    const found = await stripe(`customers?email=${encodeURIComponent(s.email)}&limit=10`, undefined, "GET").catch(() => ({ data: [] }));
    for (const cu of found.data) if (Number(cu.metadata?.chat_id) === chat && !customers.includes(cu.id)) customers.push(cu.id);
  }
  let best: any = null;
  const rank = (st: string) => (st === "active" ? 3 : st === "trialing" ? 2 : st === "past_due" ? 1 : 0);
  for (const cu of customers) {
    const subs = await stripe(`subscriptions?customer=${cu}&status=all&limit=10`, undefined, "GET").catch(() => ({ data: [] }));
    for (const sub of subs.data) if (!best || rank(sub.status) > rank(best.status) || (rank(sub.status) === rank(best.status) && sub.created > best.created)) best = sub;
  }
  if (best) {
    if (!best.metadata?.chat_id) best.metadata = { ...(best.metadata ?? {}), chat_id: String(chat) };
    await applySubscription(best);
  }
  await logEvent(chat, "sub_check", { found: best?.status ?? null });
  return accessOf(chat);
}

// ---------------------------------------------------------------- вебхук
const enc = new TextEncoder();
async function hmacHex(secret: string, data: string) {
  const k = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return [...new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(data)))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// https://docs.stripe.com/webhooks#verify-manually
async function verify(payload: string, header: string | null, secret: string) {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]).filter((p) => p.length === 2).map(([k, v]) => [k, v]));
  const sigs = header.split(",").filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
  const t = Number(parts.t);
  if (!t || Math.abs(Date.now() / 1000 - t) > 300) return false;
  const expected = await hmacHex(secret, `${t}.${payload}`);
  return sigs.some((s) => s.length === expected.length && timingSafe(s, expected));
}
function timingSafe(a: string, b: string) {
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function chatFor(obj: { metadata?: Record<string, string>; customer?: string; id?: string }) {
  const m = Number(obj.metadata?.chat_id);
  if (m) return m;
  if (obj.customer) {
    const [s] = await sql`select chat_id from flatbot.subscribers where stripe_customer = ${obj.customer}`;
    if (s) return Number(s.chat_id);
    // клиент мог быть создан в Stripe до нас — смотрим его metadata
    const cu = await stripe(`customers/${obj.customer}`, undefined, "GET").catch(() => null);
    if (Number(cu?.metadata?.chat_id)) return Number(cu.metadata.chat_id);
  }
  return null;
}

const ts = (x: number | null | undefined) => (x ? new Date(x * 1000) : null);

async function applySubscription(sub: any) {
  const chat = await chatFor(sub);
  if (!chat) return console.error("stripe: не нашёл пользователя для подписки", sub.id);
  const [prev] = await sql`select sub_status, stripe_sub, settings->>'lang' as lang from flatbot.subscribers where chat_id = ${chat}`;
  if (!prev) return console.error("stripe: нет подписчика", chat);
  // у пользователя может быть несколько подписок — не даём старой отменённой затереть живую
  if (prev.stripe_sub && prev.stripe_sub !== sub.id && ACCESS_STATUSES.includes(prev.sub_status) && !ACCESS_STATUSES.includes(sub.status)) return;
  const periodEnd = sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end;
  await sql`
    update flatbot.subscribers set
      stripe_customer = coalesce(stripe_customer, ${sub.customer}), stripe_sub = ${sub.id}, sub_status = ${sub.status},
      trial_end = ${ts(sub.trial_end)}, period_end = ${ts(periodEnd)}, cancel_at_period_end = ${!!sub.cancel_at_period_end},
      trial_used = trial_used or ${!!sub.trial_start}, sub_updated_at = now(),
      pay_nag_count = case when ${ACCESS_STATUSES.includes(sub.status)} then 0 else pay_nag_count end
    where chat_id = ${chat}`;
  await logEvent(chat, "subscription", { status: sub.status, prev: prev.sub_status ?? null });

  if (sub.status === "trialing" && !prev.sub_status && (await cardAlreadyTrialed(sub, chat))) {
    await stripe(`subscriptions/${sub.id}`, { trial_end: "now", proration_behavior: "none" }).catch((e) => console.error("trial_end", e));
    await logEvent(chat, "trial_abuse", { sub: sub.id });
    return; // придёт новое событие (active или past_due) — его и обработаем
  }
  const wasOk = ACCESS_STATUSES.includes(prev.sub_status ?? "");
  const lang = langOr(prev.lang);
  const t = L(lang);
  if (sub.status === "trialing" && !prev.sub_status) {
    const endAt = ts(sub.trial_end);
    const end = endAt ? fmtDate(lang, endAt, { day: "numeric", month: "long" }) : null;
    await say(chat, t("sub.trial", { until: end ? t("sub.until", { date: end }) : "" }));
  } else if (sub.status === "active" && !prev.sub_status) {
    await say(chat, t("sub.active"));
  } else if (BLOCKED_STATUSES.includes(sub.status) && (wasOk || !prev.sub_status)) {
    await nag(chat, sub.status, lang);
  }
}

// отпечаток карты: если с этой картой уже брали триал на другом аккаунте — повторный триал не даём
async function cardAlreadyTrialed(sub: any, chat: number) {
  try {
    const pmId = sub.default_payment_method ??
      (await stripe(`customers/${sub.customer}`, undefined, "GET")).invoice_settings?.default_payment_method;
    if (!pmId) return false;
    const pm = typeof pmId === "string" ? await stripe(`payment_methods/${pmId}`, undefined, "GET") : pmId;
    const fp = pm?.card?.fingerprint;
    if (!fp) return false;
    const [seen] = await sql`select chat_id from flatbot.trial_cards where fingerprint = ${fp}`;
    if (seen && Number(seen.chat_id) !== chat) return true;
    await sql`insert into flatbot.trial_cards (fingerprint, chat_id) values (${fp}, ${chat}) on conflict do nothing`;
    return false;
  } catch (e) {
    console.error("card fingerprint", e); // нет прав на PaymentMethods — просто не проверяем
    return false;
  }
}

// «Нужно оплатить»: сразу при неудачном списании, потом ещё до двух раз раз в сутки (из tick)
export async function nag(chat: number, status: string, lang?: Lang) {
  try {
    lang ??= await langOf(chat);
    const text = tr(lang, status === "canceled" ? "nag.canceled" : "nag.failed");
    const url = await payLink(chat);
    await say(chat, text, { reply_markup: { inline_keyboard: [[{ text: tr(lang, "btn.pay"), url }]] } });
    await sql`update flatbot.subscribers set pay_nag_at = now(), pay_nag_count = pay_nag_count + 1 where chat_id = ${chat}`;
    await logEvent(chat, "pay_nag", { status });
  } catch (e) {
    console.error("nag", chat, e);
  }
}

export async function nagTick() {
  if (!(await cfg()).enabled) return 0;
  const due = await sql`
    select chat_id, sub_status, settings->>'lang' as lang from flatbot.subscribers
    where active and not comp and sub_status = any(${BLOCKED_STATUSES}::text[])
      and pay_nag_count between 1 and 2 and pay_nag_at < now() - interval '24 hours'`;
  for (const d of due) if (!(await isAdmin(Number(d.chat_id)))) await nag(Number(d.chat_id), d.sub_status, langOr(d.lang));
  return due.length;
}

export async function handleWebhook(req: Request) {
  const c = await cfg();
  const payload = await req.text();
  if (!(await verify(payload, req.headers.get("stripe-signature"), c.whsec))) {
    return new Response("bad signature", { status: 400 });
  }
  const event = JSON.parse(payload);
  // уже обрабатывали (Stripe доставляет повторно) — просто подтверждаем
  const fresh = await sql`insert into flatbot.stripe_events (id, type) values (${event.id}, ${event.type})
                          on conflict do nothing returning id`;
  if (!fresh.length) return Response.json({ ok: true, duplicate: true });
  await token();
  try {
    const o = event.data.object;
    switch (event.type) {
      case "checkout.session.completed": {
        const chat = Number(o.client_reference_id) || (await chatFor(o));
        if (chat && o.customer) await sql`update flatbot.subscribers set stripe_customer = ${o.customer} where chat_id = ${chat}`;
        if (o.subscription) await applySubscription(await stripe(`subscriptions/${o.subscription}`, undefined, "GET"));
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
      case "customer.subscription.paused":
      case "customer.subscription.resumed":
        // берём актуальное состояние из API: события могут прийти не по порядку
        await applySubscription(await stripe(`subscriptions/${o.id}`, undefined, "GET").catch(() => o));
        break;
      case "invoice.payment_failed":
      case "invoice.paid":
      case "invoice.payment_succeeded": {
        const subId = o.subscription ?? o.parent?.subscription_details?.subscription;
        if (subId) await applySubscription(await stripe(`subscriptions/${subId}`, undefined, "GET"));
        break;
      }
    }
  } catch (e) {
    // отдаём 500 и убираем отметку — Stripe повторит доставку
    console.error("stripe webhook", event.type, e);
    await sql`delete from flatbot.stripe_events where id = ${event.id}`;
    return new Response("error", { status: 500 });
  }
  return Response.json({ ok: true });
}

// ---------------------------------------------------------------- настройка
// Сохраняет ключ и цену, создаёт вебхук в Stripe и запоминает его секрет.
export async function setup(key: string | null, price: string | null) {
  if (key) await setMeta("stripe_secret_key", key);
  if (price) await setMeta("stripe_price_id", price);
  const c = await cfg();
  if (!c.key) return { error: "нет STRIPE_SECRET_KEY" };
  const url = `${SELF_URL}?action=stripe`;
  const existing = await stripe("webhook_endpoints?limit=100", undefined, "GET");
  for (const w of existing.data ?? []) if (w.url === url) await stripe(`webhook_endpoints/${w.id}`, undefined, "DELETE");
  const wh = await stripe("webhook_endpoints", {
    url,
    description: "Telegram flat bot",
    enabled_events: [
      "checkout.session.completed",
      "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted",
      "customer.subscription.paused", "customer.subscription.resumed",
      "invoice.paid", "invoice.payment_succeeded", "invoice.payment_failed",
    ],
  });
  await setMeta("stripe_webhook_secret", wh.secret);
  const info = c.price ? await priceInfo().catch((e) => ({ error: String(e) })) : null;
  return { ok: true, webhook: wh.id, livemode: wh.livemode, price: info };
}

// «4,99 €/мес», «4.99 €/month»
export const paywallText = (p: any, lang: Lang = "en") =>
  p
    ? `${esc(Number(p.amount).toLocaleString(intlLocale(lang), { maximumFractionDigits: 2, useGrouping: false }))} ${p.currency === "EUR" ? "€" : esc(String(p.currency))}/${tr(lang, p.interval === "year" ? "price.year" : "price.month")}`
    : "";

// ---------------------------------------------------------------- отмена и удержание
async function subOf(chat: number) {
  const [s] = await sql`select stripe_sub, sub_status, retention_used, settings, name, username from flatbot.subscribers where chat_id = ${chat}`;
  return s;
}

async function tellAdmins(text: string) {
  const admins = ((await meta("admins")) ?? []).map(Number);
  for (const a of admins) await say(a, text).catch((e) => console.error("admin msg", e));
}

// «Дорого» → скидка 50% на следующий счёт, один раз на пользователя
export async function retentionDiscount(chat: number) {
  const s = await subOf(chat);
  if (!s?.stripe_sub || !ACCESS_STATUSES.includes(s.sub_status)) return { error: "no_subscription" };
  if (s.retention_used) return { error: "already_used" };
  const COUPON = "byt-radar-retention-50";
  await stripe(`coupons/${COUPON}`, undefined, "GET").catch(() =>
    stripe("coupons", { id: COUPON, percent_off: 50, duration: "once", name: "Retention −50%" })
  );
  await stripe(`subscriptions/${s.stripe_sub}`, { discounts: [{ coupon: COUPON }] });
  await sql`update flatbot.subscribers set retention_used = true where chat_id = ${chat}`;
  await logEvent(chat, "retention_discount");
  const lang = (s.settings?.lang ?? "en") as Lang;
  await say(chat, L(lang)("retention.discountDone")).catch(() => {});
  await tellAdmins(`🎁 ${esc(s.name || String(chat))}${s.username ? ` (@${esc(s.username)})` : ""} хотел отменить подписку, но взял скидку 50%.`);
  return { ok: true };
}

// Отмена сразу: доступ и уведомления закрываются немедленно, приложение — на экране подписки
export async function cancelNow(chat: number, reason: string, comment: string) {
  const s = await subOf(chat);
  if (!s?.stripe_sub) return { error: "no_subscription" };
  // сначала помечаем у себя — чтобы вебхук не прислал «подписка закончилась, оплатите»
  await sql`update flatbot.subscribers set sub_status = 'canceled', pay_nag_count = 99, cancel_reason = ${reason.slice(0, 40)},
            canceled_at = now(), sub_updated_at = now() where chat_id = ${chat}`;
  await sql`delete from flatbot.queue where chat_id = ${chat}`;
  try {
    await stripe(`subscriptions/${s.stripe_sub}`, undefined, "DELETE");
  } catch (e) {
    // не получилось в Stripe — возвращаем как было, чтобы не списать деньги с «отменённого»
    await sql`update flatbot.subscribers set sub_status = ${s.sub_status}, pay_nag_count = 0, canceled_at = null where chat_id = ${chat}`;
    throw e;
  }
  await logEvent(chat, "cancel", { reason, comment: comment.slice(0, 200) });
  const lang = (s.settings?.lang ?? "en") as Lang;
  const t = L(lang);
  await say(chat, t("cancel.done"), { reply_markup: { inline_keyboard: [[{ text: t("cancel.back"), url: await payLink(chat) }]] } }).catch(() => {});
  await tellAdmins(`❌ <b>${esc(s.name || String(chat))}</b>${s.username ? ` (@${esc(s.username)})` : ""} отменил подписку.\nПричина: ${esc(reason)}${comment ? `\n«${esc(comment.slice(0, 300))}»` : ""}`);
  return { ok: true };
}
