// Telegram-бот и API мини-приложения: квартиры и комнаты по всей Словакии.
//
//  POST + X-Telegram-Bot-Api-Secret-Token   — вебхук Telegram (/start, /today, /app, /status, /stop)
//  POST ?action=api                          — API мини-приложения (см. api.ts)
//  POST ?action=check     + x-cron-secret    — проверка сайтов и рассылка (pg_cron каждые 10 минут)
//  POST ?action=tick      + x-cron-secret    — напоминания, дайджесты, дочитывание карточек (каждую минуту)
//  POST ?action=backfill&src=… + x-cron-secret — глубокая подгрузка старых объявлений (без рассылки)
//  POST ?action=configure + x-cron-secret    — кнопка меню, команды и описание бота
//  POST ?action=setup     + x-bot-token      — сохранить токен и подключить вебхук
//  GET  ?action=call&n=+421…                 — редирект на tel: для кнопки «Позвонить»
import { handleApi } from "./api.ts";
import { logEvent, matches, meta, saveDetailed, setMeta, settingsOf, sql, upsertListings } from "./db.ts";
import type { Settings } from "./db.ts";
import * as G from "./geo.ts";
import * as S from "./sources.ts";
import type { Listing } from "./sources.ts";
import { APP_URL, esc, say, SELF_URL, sendDigest, sendListing, setToken, sleep, tg, token } from "./tg.ts";
import { asLang, fmtDateTime, L, langFromCode, langOr } from "./i18n.ts";
import type { Lang } from "./i18n.ts";
import { accessFilter, accessOf, cfg as stripeCfg, handleWebhook, nagTick, payLink, priceInfo, paywallText, setup as stripeSetup } from "./stripe.ts";


// ---------------------------------------------------------------- время по Братиславе
const hm = (d = new Date()) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Bratislava", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .format(d);
const minutes = (t: string) => +t.slice(0, 2) * 60 + +t.slice(3, 5);

function isQuiet(s: Settings, now = new Date()) {
  const q = s.notify.quiet;
  if (!q.on) return false;
  const n = minutes(hm(now)), from = minutes(q.from), to = minutes(q.to);
  return from < to ? n >= from && n < to : n >= from || n < to;
}

function digestDue(s: Settings, last: Date | null, now = new Date()) {
  const n = minutes(hm(now));
  return s.notify.digestTimes.some((t) => {
    const since = n - minutes(t); // минут прошло после времени дайджеста
    return since >= 0 && since < 15 && (!last || +now - +last > (since + 1) * 60_000);
  });
}

// ---------------------------------------------------------------- сбор объявлений
async function collect(jobs: Record<string, () => Promise<Listing[]>>) {
  const names = Object.keys(jobs);
  const res = await Promise.allSettled(names.map((n) => jobs[n]()));
  const listings: Listing[] = [];
  const stats: Record<string, string> = {};
  res.forEach((r, i) => {
    if (r.status === "fulfilled") {
      listings.push(...r.value);
      stats[names[i]] = String(r.value.length);
    } else {
      stats[names[i]] = "ошибка: " + String(r.reason?.message ?? r.reason).slice(0, 120);
      console.error(names[i], r.reason);
    }
  });
  return { listings: [...new Map(listings.map((l) => [S.key(l), l])).values()], stats };
}

async function enrich(ls: Listing[], limit: number, workers = 4) {
  const queue = ls.slice(0, limit);
  const run = async () => {
    for (let l = queue.shift(); l; l = queue.shift()) {
      try {
        await S.detail(l);
      } catch (e) {
        console.error("detail", l.url, e);
      }
    }
  };
  await Promise.all(Array.from({ length: workers }, run));
}

async function check() {
  // вся Словакия: свежие страницы каждого сайта (у nehnutelnosti — по каждому краю)
  const { listings, stats } = await collect({
    "bazos (квартиры)": () => S.bazos("byt", [0, 20, 40]),
    "bazos (комнаты)": () => S.bazos("podnajom", [0, 20]),
    "nehnutelnosti.sk": async () =>
      (await Promise.all(G.REGIONS.map((r) => S.nehnutelnosti(r.key).catch(() => [] as Listing[])))).flat(),
    "topreality.sk": () => S.topreality([1, 2]),
    "bezrealitky.sk": () => S.bezrealitky([1, 2]),
  });
  const keys = listings.map(S.key);
  const existing = new Map<string, string | null>(
    (await sql`select key, kind from flatbot.listings where key = any(${keys}::text[])`).map((r: any) => [r.key, r.kind]),
  );
  await sql`update flatbot.listings set last_seen = now() where key = any(${keys}::text[])`;
  // посуточное/отпуск/спа и цены ниже 150 € не сохраняем и не рассылаем
  const fresh = listings.filter((l) => !existing.has(S.key(l)) && !l.shortTerm);
  const legacy = listings.filter((l) => existing.has(S.key(l)) && existing.get(S.key(l)) == null);
  const ready = !!(await meta("v2_ready"));

  // новые дочитываем сразу: фото, полный текст, телефон — до рассылки
  await enrich(fresh, 30, 6);
  await upsertListings(fresh, !ready);
  await upsertListings(legacy, true);

  let sent = 0, queued = 0;
  if (ready && fresh.length) {
    const subs = await sql`select chat_id, settings, comp, sub_status from flatbot.subscribers where active`;
    const allowed = await accessFilter(); // подписка: trialing/active, comp или админ
    for (const l of fresh) {
      for (const sub of subs) {
        if (!allowed(sub)) continue;
        const s = settingsOf(sub.settings);
        if (s.notify.mode === "off" || !matches(l, s)) continue;
        const chat = Number(sub.chat_id);
        if (s.notify.mode === "digest" || isQuiet(s)) {
          await sql`insert into flatbot.queue (chat_id, key) values (${chat}, ${S.key(l)}) on conflict do nothing`;
          queued++;
          continue;
        }
        try {
          await sendListing(chat, l, langOr(s.lang));
          sent++;
          await logEvent(chat, "notified", { key: S.key(l) });
        } catch (e) {
          console.error("send", chat, e);
          await logEvent(chat, "notify_failed", { key: S.key(l), error: String(e).slice(0, 120) });
        }
        await sleep(60);
      }
    }
  }
  await setMeta("last_check", { at: new Date().toISOString(), stats, fresh: fresh.length, sent, queued });
  return { stats, fresh: fresh.length, legacy: legacy.length, sent, queued, ready };
}

// глубокая подгрузка: несколько страниц каждого сайта, без рассылки
async function backfill(src: string) {
  const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
  const jobs: Record<string, () => Promise<Listing[]>> = {
    bazos: async () => [
      ...(await S.bazos("byt", range(0, 9).map((i) => i * 20))),
      ...(await S.bazos("podnajom", range(0, 5).map((i) => i * 20))),
    ],
    topreality: () => S.topreality(range(1, 8)),
    bezrealitky: () => S.bezrealitky(range(1, 6)),
  };
  // nehnutelnosti — отдельным вызовом на каждый край: ?src=nehnutelnosti-KE
  for (const r of G.REGIONS) jobs[`nehnutelnosti-${r.key}`] = () => S.nehnutelnosti(r.key, range(1, 5));
  if (!jobs[src]) return { error: "unknown src" };
  const { listings, stats } = await collect({ [src]: jobs[src] });
  await upsertListings(listings, true);
  await setMeta("v2_ready", true);
  return { stats };
}

// ---------------------------------------------------------------- ежеминутные задачи
async function tick() {
  const out = { reminders: 0, digests: 0, enriched: 0 };

  // 1) напоминания
  const due = await sql`
    select r.id, r.chat_id, r.note, l.data, s.settings->>'lang' as lang
    from flatbot.reminders r left join flatbot.listings l on l.key = r.key
    left join flatbot.subscribers s on s.chat_id = r.chat_id
    where not r.sent and r.remind_at <= now() order by r.remind_at limit 30`;
  for (const r of due) {
    await sql`update flatbot.reminders set sent = true where id = ${r.id}`;
    const note = r.note ? `\n📝 ${esc(r.note)}` : "";
    const t = L(langOr(r.lang));
    try {
      if (r.data) await sendListing(Number(r.chat_id), r.data, langOr(r.lang), `${t("reminder.title")}${note}\n\n`);
      else await say(Number(r.chat_id), `${t("reminder.title")}${note || "\n" + t("reminder.default")}`);
      out.reminders++;
      await logEvent(Number(r.chat_id), "reminder_sent", { id: Number(r.id) });
    } catch (e) {
      console.error("reminder", r.id, e);
    }
  }

  // 2) очередь: дайджесты и то, что накопилось в «тихие часы»
  const waiting = await sql`
    select s.chat_id, s.settings, s.last_digest_at, s.comp, s.sub_status, count(q.key)::int as n
    from flatbot.queue q join flatbot.subscribers s on s.chat_id = q.chat_id
    where s.active group by s.chat_id`;
  const allowedQ = await accessFilter();
  for (const w of waiting) {
    if (!allowedQ(w)) {
      await sql`delete from flatbot.queue where chat_id = ${w.chat_id}`;
      continue;
    }
    const s = settingsOf(w.settings);
    const chat = Number(w.chat_id);
    const lang = langOr(s.lang);
    const mode = s.notify.mode;
    const flush =
      mode === "off" ? "drop"
      : mode === "instant" ? (isQuiet(s) ? null : "instant")
      : digestDue(s, w.last_digest_at) ? "digest" : null;
    if (!flush) continue;
    const items = await sql`
      select l.key, l.data from flatbot.queue q join flatbot.listings l on l.key = q.key
      where q.chat_id = ${chat} order by l.posted_at desc`;
    await sql`delete from flatbot.queue where chat_id = ${chat} and key = any(${items.map((i: any) => i.key)}::text[])`;
    if (flush === "drop" || !items.length) continue;
    try {
      if (flush === "instant" && items.length <= 4) {
        for (const i of items) await sendListing(chat, i.data, lang);
      } else {
        const t = L(lang);
        const what = t("n.newListings", { n: items.length });
        const title = flush === "digest" ? t("digest.title", { what }) : t("digest.quiet", { what });
        await sendDigest(chat, items.map((i: any) => i.data), title, lang);
      }
      await sql`update flatbot.subscribers set last_digest_at = now() where chat_id = ${chat}`;
      out.digests++;
      await logEvent(chat, "digest", { n: items.length, kind: flush });
    } catch (e) {
      console.error("digest", chat, e);
    }
  }

  // напоминания об оплате (повторно, не чаще раза в сутки, максимум 3 раза)
  await nagTick().catch((e) => console.error("nag", e));

  // 3) продавец на Bazoši с 3+ разными объявлениями и «фирменным» именем — агентство
  await sql`
    update flatbot.listings set agency = true, data = jsonb_set(data, '{agency}', 'true')
    where source = 'bazos' and agency is not true and data->>'seller' in (
      select data->>'seller' from flatbot.listings
      where source = 'bazos' and data->>'seller' is not null and length(data->>'seller') >= 6
        and data->>'seller' !~ '^[[:upper:]][[:lower:]]+( [[:upper:]][[:lower:]]+)?$'
      group by 1 having count(distinct data->>'title') >= 3)`;

  // 4) потихоньку дочитываем карточки, которые ещё не открывали
  const todo = await sql`
    select data from flatbot.listings where not detailed and kind is not null
    order by posted_at desc limit 10`;
  const ls = todo.map((r: any) => r.data as Listing);
  await enrich(ls, 10, 5);
  for (const l of ls) {
    l.detailed = true; // даже если сайт не ответил — не пытаемся бесконечно
    await saveDetailed(l);
    out.enriched++;
  }
  return out;
}

// ---------------------------------------------------------------- команды бота
const appButton = (lang: Lang, text = L(lang)("btn.openApp")) => ({ inline_keyboard: [[{ text, web_app: { url: APP_URL } }]] });

async function sendToday(chat_id: number, limit: number, lang: Lang) {
  const t = L(lang);
  const [sub] = await sql`select settings from flatbot.subscribers where chat_id = ${chat_id}`;
  const s = settingsOf(sub?.settings);
  const rows = await sql`
    select data from flatbot.listings
    where kind is not null and posted_at > now() - interval '24 hours' order by posted_at desc limit 200`;
  const list = rows.map((r: any) => r.data as Listing).filter((l) => matches(l, s));
  if (!list.length) {
    await say(chat_id, t("today.none"), {
      reply_markup: appButton(lang, t("btn.editFilters")),
    });
    return;
  }
  await say(chat_id, t("today.count", { n: list.length }) +
    (list.length > limit ? t("today.more", { limit }) : ""));
  for (const l of list.slice(0, limit).reverse()) {
    await sendListing(chat_id, l, lang);
    await sleep(300);
  }
}

// /status: ключи статистики хранятся как есть («bazos (квартиры)», «ошибка: …») — переводим при показе
const statusLine = (t: ReturnType<typeof L>, k: string, v: unknown) =>
  `• ${k.replace("(квартиры)", `(${t("status.flats")})`).replace("(комнаты)", `(${t("status.rooms")})`)}: ${
    String(v).replace(/^ошибка:/, `${t("status.error")}:`)
  }`;

async function handleUpdate(u: any) {
  if (u.my_chat_member?.new_chat_member?.status === "kicked") {
    await sql`update flatbot.subscribers set active = false where chat_id = ${u.my_chat_member.chat.id}`;
    await logEvent(u.my_chat_member.chat.id, "blocked");
    return;
  }
  const msg = u.message;
  if (!msg?.chat) return;
  const chat_id: number = msg.chat.id;
  const name = msg.chat.title ?? [msg.chat.first_name, msg.chat.last_name].filter(Boolean).join(" ");
  const cmd = String(msg.text ?? "").trim().split(/[\s@]/)[0].toLowerCase();

  // язык: выбранный в настройках → язык Telegram → английский
  const [prev] = await sql`select active, settings->>'lang' as lang from flatbot.subscribers where chat_id = ${chat_id}`;
  const tgLang = langFromCode(msg.from?.language_code);
  const lang: Lang = asLang(prev?.lang) ?? tgLang ?? "en";
  const t = L(lang);
  // языка в настройках ещё нет — запоминаем язык Telegram, чтобы рассылки шли на нём же
  // (langAuto: пользователь его не выбирал — приложение всё равно покажет выбор языка)
  const rememberLang = () =>
    !asLang(prev?.lang) && tgLang
      ? sql`update flatbot.subscribers
            set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object('lang', ${tgLang}::text, 'langAuto', true)
            where chat_id = ${chat_id} and coalesce(settings->>'lang', '') = ''`
      : null;

  // «/admin КОД» — одноразовая выдача прав админа владельцу бота
  if (cmd === "/admin") {
    const code = String(msg.text ?? "").trim().split(/\s+/)[1] ?? "";
    const expected = await meta("admin_code");
    if (expected && code === expected) {
      const admins = ((await meta("admins")) ?? []) as number[];
      await setMeta("admins", [...new Set([...admins.map(Number), chat_id])]);
      await setMeta("admin_code", null);
      await logEvent(chat_id, "admin_granted");
      await say(chat_id, "🛡 <b>Готово, вы админ.</b> Админ-панель — в приложении: Настройки → «Админ-панель».", { reply_markup: appButton(lang) });
    } else {
      await say(chat_id, t("unknownCommand"));
    }
    return;
  }
  if (cmd === "/stop") {
    await logEvent(chat_id, "stop");
    await sql`update flatbot.subscribers set active = false where chat_id = ${chat_id}`;
    await rememberLang();
    await say(chat_id, t("stop.done"));
    return;
  }
  // любой, кто написал боту, становится подписчиком
  await sql`insert into flatbot.subscribers (chat_id, name, username, active) values (${chat_id}, ${name}, ${msg.chat.username ?? null}, true)
            on conflict (chat_id) do update set active = true, name = excluded.name, username = excluded.username`;
  await rememberLang();
  const isNew = !prev || !prev.active;
  await logEvent(chat_id, cmd.startsWith("/") ? "command" : "message", {
    cmd: cmd.startsWith("/") ? cmd : undefined, isNew: isNew || undefined,
    text: cmd.startsWith("/") ? undefined : String(msg.text ?? "").slice(0, 120),
  });

  const acc = await accessOf(chat_id);
  const payButton = async (text: string) => ({ inline_keyboard: [[{ text, url: await payLink(chat_id) }]] });
  if (cmd === "/pay" || cmd === "/subscribe" || (cmd === "/start" && String(msg.text).includes("pay_cancel"))) {
    if (!acc.enabled) await say(chat_id, t("pay.free"));
    else if (acc.ok && acc.reason !== "trialing" && acc.reason !== "active") await say(chat_id, t("pay.comp"));
    else {
      const p = await priceInfo().catch(() => null);
      await say(chat_id, acc.ok
        ? t("pay.manage")
        : t("pay.offer", { trial: acc.trialAvailable ? t("pay.trialPrefix") : "", price: paywallText(p, lang) }),
        { reply_markup: await payButton(acc.ok ? t("btn.manageSub") : acc.trialAvailable ? t("btn.startTrial") : t("btn.subscribe")) });
    }
    return;
  }
  if (cmd === "/start" && String(msg.text).includes("paid")) {
    await say(chat_id, acc.ok ? t("paid.ok") : t("paid.wait"), { reply_markup: appButton(lang) });
    return;
  }
  if (cmd === "/status") {
    const lc = await meta("last_check");
    const lines = lc ? Object.entries(lc.stats).map(([k, v]) => statusLine(t, k, v)).join("\n") : t("status.never");
    const at = lc ? fmtDateTime(lang, new Date(lc.at)) : "";
    await say(chat_id, t("status.title", { at, lines: esc(lines) }));
  } else if (isNew || cmd === "/start") {
    const [me] = await sql`select onboarded from flatbot.subscribers where chat_id = ${chat_id}`;
    if (!me?.onboarded) {
      // сначала — настроить фильтр, иначе пришлось бы слать объявления со всей Словакии
      await say(chat_id, t("start.welcome"), { reply_markup: appButton(lang, t("btn.setup")) });
    } else if (!acc.ok) {
      await say(chat_id, t("start.backPay"), {
        reply_markup: await payButton(acc.trialAvailable ? t("btn.startTrial") : t("btn.subscribe")),
      });
    } else {
      await say(chat_id, t("start.back") + " " + t("help"), { reply_markup: appButton(lang) });
      await sendToday(chat_id, 8, lang);
    }
  } else if (cmd === "/today") {
    if (!acc.ok) await say(chat_id, t("today.locked"), { reply_markup: await payButton(acc.trialAvailable ? t("btn.trialShort") : t("btn.subscribe")) });
    else await sendToday(chat_id, 15, lang);
  } else {
    await say(chat_id, t("help"), { reply_markup: appButton(lang) });
  }
}

// команды и описание: по умолчанию (без language_code) — английский, плюс отдельно для ru/uk/be/sk (и cs → sk)
const BOT_LANGS: [string | null, Lang][] = [[null, "en"], ["ru", "ru"], ["uk", "uk"], ["be", "be"], ["sk", "sk"], ["cs", "sk"]];

async function configure() {
  // текст кнопки меню общий для всех языков — короткий и нейтральный
  await tg("setChatMenuButton", { menu_button: { type: "web_app", text: "🏠 App", web_app: { url: APP_URL } } });
  for (const [code, lang] of BOT_LANGS) {
    const t = L(lang);
    const lc = code ? { language_code: code } : {};
    await tg("setMyCommands", {
      commands: [
        { command: "app", description: t("cmd.app") },
        { command: "today", description: t("cmd.today") },
        { command: "status", description: t("cmd.status") },
        { command: "stop", description: t("cmd.stop") },
      ],
      ...lc,
    });
    await tg("setMyShortDescription", { short_description: t("bot.short"), ...lc });
    await tg("setMyDescription", { description: t("bot.description"), ...lc });
  }
  return { ok: true };
}

async function setup() {
  await tg("setWebhook", { url: SELF_URL, secret_token: await meta("webhook_secret"), allowed_updates: ["message", "my_chat_member"] });
  return await configure();
}

// ---------------------------------------------------------------- роутер
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  if (req.method === "GET" && action === "call") {
    const n = (url.searchParams.get("n") ?? "").replace(/[^\d+]/g, "");
    if (!/^\+\d{9,15}$/.test(n)) return new Response("bad number", { status: 400 });
    return new Response(null, { status: 302, headers: { location: `tel:${n}` } });
  }
  if (req.method !== "POST") return new Response("ok");

  if (action === "api") {
    try {
      const body = JSON.parse(await req.text());
      return Response.json(await handleApi(body), { headers: CORS });
    } catch (e) {
      if (e instanceof Response) return new Response(e.body, { status: e.status, headers: CORS });
      console.error("api", e);
      return Response.json({ error: String(e) }, { status: 500, headers: CORS });
    }
  }

  // вебхук Stripe: подпись проверяется внутри
  if (action === "stripe") {
    return await handleWebhook(req);
  }
  // настройка Stripe: из GitHub Actions (заголовок с токеном бота) или с cron-секретом
  if (action === "stripe_setup") {
    const cronOk = req.headers.get("x-cron-secret") === (await meta("cron_secret"));
    const botOk = !!(await token()) && req.headers.get("x-bot-token") === (await token());
    if (!cronOk && !botOk) return new Response("forbidden", { status: 403 });
    try {
      return Response.json(await stripeSetup(req.headers.get("x-stripe-key"), req.headers.get("x-stripe-price")));
    } catch (e) {
      return Response.json({ error: String(e) }, { status: 500 });
    }
  }

  if (action && action !== "webhook") {
    const cronOk = req.headers.get("x-cron-secret") === (await meta("cron_secret"));
    const given = req.headers.get("x-bot-token");
    if (action === "setup" && given && (cronOk || !(await token()))) {
      const me = await (await fetch(`https://api.telegram.org/bot${given}/getMe`)).json();
      if (!me.ok) return new Response("bad token", { status: 400 });
      await setMeta("bot_token", given);
      setToken(given);
    } else if (!cronOk) {
      return new Response("forbidden", { status: 403 });
    }
    if (!(await token())) return new Response("TELEGRAM_BOT_TOKEN не задан", { status: 500 });
    try {
      const out =
        action === "check" ? await check()
        : action === "tick" ? await tick()
        : action === "backfill" ? await backfill(url.searchParams.get("src") ?? "")
        : action === "configure" ? await configure()
        : action === "setup" ? await setup()
        : { error: "unknown action" };
      return Response.json(out);
    } catch (e) {
      console.error(action, e);
      return Response.json({ error: String(e) }, { status: 500 });
    }
  }

  // вебхук Telegram
  if (req.headers.get("x-telegram-bot-api-secret-token") !== (await meta("webhook_secret"))) {
    return new Response("forbidden", { status: 403 });
  }
  const update = await req.json();
  await token();
  // отвечаем Telegram сразу, сообщения досылаем в фоне
  // @ts-ignore EdgeRuntime есть в среде Supabase
  EdgeRuntime.waitUntil(handleUpdate(update).catch((e) => console.error("update", e)));
  return new Response("ok");
});
