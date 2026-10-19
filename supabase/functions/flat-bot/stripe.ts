// Подписка через Stripe: 7 дней бесплатно, затем ежемесячная оплата.
// Доступ (уведомления + приложение) — пока подписка trialing/active, у админа и у тех, кому выдан comp.
// Пока Stripe не настроен (нет ключа или цены) — доступ у всех.
import { isAdmin, logEvent, meta, setMeta, sql } from "./db.ts";
import { esc, say, SELF_URL, tg, token } from "./tg.ts";

export const ACCESS_STATUSES = ["trialing", "active"];
const BLOCKED_STATUSES = ["past_due", "unpaid", "canceled", "incomplete_expired", "paused"];
const TRIAL_DAYS = 7;

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
  const [s] = await sql`select sub_status, trial_end, period_end, comp, trial_used, cancel_at_period_end, stripe_customer, email
                        from flatbot.subscribers where chat_id = ${chat}`;
  const admin = await isAdmin(chat);
  const ok = !c.enabled || admin || !!s?.comp || ACCESS_STATUSES.includes(s?.sub_status);
  return {
    ok,
    enabled: c.enabled,
    reason: !c.enabled ? "free" : admin ? "admin" : s?.comp ? "comp" : s?.sub_status ?? "none",
    status: s?.sub_status ?? null,
    trialEnd: s?.trial_end ?? null,
    periodEnd: s?.period_end ?? null,
    cancelAtPeriodEnd: !!s?.cancel_at_period_end,
    trialAvailable: !s?.trial_used,
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
      trial_period_days: s?.trial_used ? undefined : TRIAL_DAYS,
    },
    metadata: { chat_id: chat },
    allow_promotion_codes: true,
    success_url: await botLink("paid"),
    cancel_url: await botLink("pay_cancel"),
  });
  await logEvent(chat, "checkout_open", { trial: !s?.trial_used });
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
  const [prev] = await sql`select sub_status, stripe_sub from flatbot.subscribers where chat_id = ${chat}`;
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

  const wasOk = ACCESS_STATUSES.includes(prev.sub_status ?? "");
  if (sub.status === "trialing" && !prev.sub_status) {
    const end = ts(sub.trial_end)?.toLocaleDateString("ru-RU", { day: "numeric", month: "long", timeZone: "Europe/Bratislava" });
    await say(chat, `✅ <b>Пробный период активирован!</b>\n\n7 дней всё бесплатно${end ? ` — до ${end}` : ""}. Новые объявления будут приходить сюда. Отменить подписку можно в любой момент.`);
  } else if (sub.status === "active" && !prev.sub_status) {
    await say(chat, "✅ <b>Подписка оформлена.</b> Новые объявления будут приходить сюда.");
  } else if (BLOCKED_STATUSES.includes(sub.status) && (wasOk || !prev.sub_status)) {
    await nag(chat, sub.status);
  }
}

// «Нужно оплатить»: сразу при неудачном списании, потом ещё до двух раз раз в сутки (из tick)
export async function nag(chat: number, status: string) {
  const text = status === "canceled"
    ? "⛔️ <b>Подписка закончилась.</b>\n\nНовые объявления больше не приходят. Оформите подписку, чтобы снова узнавать о квартирах первыми."
    : "⚠️ <b>Не удалось списать оплату за подписку.</b>\n\nДоступ к новым объявлениям приостановлен. Оплатите — и уведомления сразу продолжат приходить.";
  try {
    const url = await payLink(chat);
    await say(chat, text, { reply_markup: { inline_keyboard: [[{ text: "💳 Оплатить подписку", url }]] } });
    await sql`update flatbot.subscribers set pay_nag_at = now(), pay_nag_count = pay_nag_count + 1 where chat_id = ${chat}`;
    await logEvent(chat, "pay_nag", { status });
  } catch (e) {
    console.error("nag", chat, e);
  }
}

export async function nagTick() {
  if (!(await cfg()).enabled) return 0;
  const due = await sql`
    select chat_id, sub_status from flatbot.subscribers
    where active and not comp and sub_status = any(${BLOCKED_STATUSES}::text[])
      and pay_nag_count between 1 and 2 and pay_nag_at < now() - interval '24 hours'`;
  for (const d of due) if (!(await isAdmin(Number(d.chat_id)))) await nag(Number(d.chat_id), d.sub_status);
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

export const paywallText = (p: any) =>
  p ? `${esc(String(p.amount).replace(".", ","))} ${p.currency === "EUR" ? "€" : p.currency}/${p.interval === "year" ? "год" : "мес"}` : "";
