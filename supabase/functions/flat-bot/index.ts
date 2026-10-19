// Telegram-бот: новые квартиры и комнаты в Братиславе до 650 €.
//
//  POST + X-Telegram-Bot-Api-Secret-Token  — вебхук Telegram (/start, /today, /stop, /status)
//  POST ?action=check  + x-cron-secret      — проверка сайтов (pg_cron каждые 10 минут)
//  POST ?action=setup  + x-bot-token        — сохранить токен, подключить вебхук, перенести подписчиков
//                                             (без x-cron-secret — только пока токен ещё не сохранён)
//  GET  ?action=call&n=+421…                 — редирект на tel: для кнопки «Позвонить»
import postgres from "npm:postgres@3.4.5";
import * as S from "./sources.ts";
import type { Listing } from "./sources.ts";

// токен берём из секрета функции, а если его нет — из закрытой таблицы flatbot.meta
let TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const MAX_PRICE = 650;
const RADIUS_KM = 15;
const TODAY_LIMIT = 25; // сколько сегодняшних объявлений присылать новому подписчику
const DETAIL_LIMIT = 30; // сколько карточек за один прогон дочитываем ради телефона
const SELF_URL = `${Deno.env.get("SUPABASE_URL")}/functions/v1/flat-bot`;

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 2 });

async function meta(k: string): Promise<any> {
  const [row] = await sql`select v from flatbot.meta where k = ${k}`;
  return row?.v;
}
async function setMeta(k: string, v: unknown) {
  await sql`insert into flatbot.meta (k, v) values (${k}, ${sql.json(v as any)})
            on conflict (k) do update set v = excluded.v`;
}

// ------------------------------------------------------------- Telegram
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function tg(method: string, params: Record<string, unknown>): Promise<any> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(params),
    });
    const j = await r.json();
    if (j.ok) return j.result;
    if (r.status === 429) {
      await sleep(((j.parameters?.retry_after ?? 3) + 1) * 1000);
      continue;
    }
    // пользователь заблокировал бота — больше ему не пишем
    if (r.status === 403 && params.chat_id) {
      await sql`update flatbot.subscribers set active = false where chat_id = ${params.chat_id as number}`;
    }
    throw new Error(`${method}: ${j.description}`);
  }
}

const say = (chat_id: number, text: string, extra: Record<string, unknown> = {}) =>
  tg("sendMessage", { chat_id, text, parse_mode: "HTML", link_preview_options: { is_disabled: true }, ...extra });

// ------------------------------------------------------- формат объявления
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const INCLUDED =
  /vr[aá]tane\s+(energi|poplatk|služ|sluz)|s\s+energiami|energie\s+v\s+cene|v\s+cene\s+(s[uú]\s+)?(aj\s+)?energi|v[sš]etko\s+v\s+cene|all\s+(bills|utilities)\s+included|including\s+(bills|utilities)|cena\s+je\s+kone[cč]n|\bkomplet\b/i;
const EXCLUDED =
  /\+\s*energi|plus\s+energi|\+\s*poplatk|plus\s+poplatk|bez\s+energi|\+\s*služby|\+\s*sluzby|\+\s*utilities|\+\s*bills|energie\s+(navyše|navyse|zvl[aá][sš]ť)/i;

function priceLine(l: Listing): string {
  if (l.charges) return `аренда ${l.price} € + энергии ${l.charges} € = <b>${S.total(l)} €</b>`;
  if (l.price == null) return "цена: договорная / не указана";
  if (INCLUDED.test(l.text)) return `<b>${l.price} €</b> ✅ похоже, с энергиями`;
  if (EXCLUDED.test(l.text)) return `<b>${l.price} €</b> ⚠️ похоже, энергии сверху`;
  return `<b>${l.price} €</b> (про энергии уточнить)`;
}

const SOURCE_NAMES: Record<string, string> = {
  bazos: "Bazoš",
  nehnutelnosti: "Nehnuteľnosti.sk",
  topreality: "TopReality",
  bezrealitky: "Bezrealitky (без агентства)",
};

function render(l: Listing) {
  const lines = [`🏠 <b>${esc(l.title.slice(0, 200))}</b>`, "💶 " + priceLine(l)];
  const metaLine = [l.kind, l.location, ...l.extra].filter(Boolean).join(" · ");
  if (metaLine) lines.push("📍 " + esc(metaLine.slice(0, 250)));
  if (l.phone) lines.push(`☎️ ${S.prettyPhone(l.phone)}`);
  lines.push(`🌐 ${SOURCE_NAMES[l.source] ?? l.source}${l.published ? ` · ${l.published.split("-").reverse().join(".")}` : ""}`);

  const keyboard: any[][] = [];
  if (l.phone) {
    keyboard.push([
      { text: `📞 Позвонить`, url: `${SELF_URL}?action=call&n=${encodeURIComponent(l.phone)}` },
      { text: "📋 Скопировать номер", copy_text: { text: l.phone } },
    ]);
  }
  keyboard.push([{ text: "🔗 Открыть объявление", url: l.url }]);
  return { text: lines.join("\n"), reply_markup: { inline_keyboard: keyboard } };
}

async function sendListing(chat_id: number, l: Listing) {
  const { text, reply_markup } = render(l);
  try {
    await say(chat_id, text, { reply_markup });
  } catch (e) {
    // старый клиент/ошибка кнопок — пробуем без кнопки копирования
    if (String(e).includes("copy_text") || String(e).includes("BUTTON")) {
      reply_markup.inline_keyboard = reply_markup.inline_keyboard.map((row) => row.filter((b: any) => !b.copy_text));
      await say(chat_id, text, { reply_markup });
    } else throw e;
  }
}

// ------------------------------------------------------------ проверка сайтов
async function fetchAll() {
  const jobs: Record<string, () => Promise<Listing[]>> = {
    "bazos (квартиры)": () => S.bazos("byt", "квартира", MAX_PRICE, RADIUS_KM),
    "bazos (комнаты)": () => S.bazos("podnajom", "комната / подназем", MAX_PRICE, RADIUS_KM),
    "nehnutelnosti.sk": () => S.nehnutelnosti(MAX_PRICE),
    "topreality.sk": () => S.topreality(MAX_PRICE),
    "bezrealitky.sk": () => S.bezrealitky(),
  };
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
  return { listings, stats };
}

const fits = (l: Listing) => {
  const t = S.total(l);
  return t == null || t <= MAX_PRICE;
};

// дочитать карточку (полное описание) и вытащить телефон
async function enrich(ls: Listing[]) {
  const queue = ls.slice(0, DETAIL_LIMIT);
  const worker = async () => {
    for (let l = queue.shift(); l; l = queue.shift()) {
      try {
        if (l.source === "bazos") await S.bazosDetail(l);
        if (l.source === "topreality") await S.toprealityDetail(l);
      } catch (e) {
        console.error("detail", l.url, e);
      }
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  for (const l of ls) l.phone = S.findPhone(`${l.text}\n${l.title}`);
}

async function check() {
  const { listings, stats } = await fetchAll();
  const unique = new Map(listings.map((l) => [S.key(l), l]));
  const keys = [...unique.keys()];
  const known = new Set(
    (await sql`select key from flatbot.listings where key = any(${keys}::text[])`).map((r: any) => r.key),
  );
  const fresh = [...unique.values()].filter((l) => !known.has(S.key(l)));
  const [{ n }] = await sql`select count(*)::int as n from flatbot.listings`;
  const seeding = n === 0;
  const today = S.bratislavaDate(new Date());

  // при первом запуске дочитываем только сегодняшние (их покажем по /start)
  const toEnrich = fresh.filter((l) => fits(l) && (!seeding || l.published === today));
  await enrich(toEnrich);

  if (fresh.length) {
    const rows = fresh.map((l) => ({
      key: S.key(l),
      source: l.source,
      data: sql.json(l as any),
      published: l.published,
      fits: fits(l),
      seeded: seeding,
    }));
    await sql`insert into flatbot.listings ${sql(rows as any)} on conflict (key) do nothing`;
  }

  let sent = 0;
  if (!seeding) {
    const subs = await sql`select chat_id from flatbot.subscribers where active`;
    for (const l of toEnrich) {
      for (const s of subs) {
        try {
          await sendListing(Number(s.chat_id), l);
          sent++;
        } catch (e) {
          console.error("send", s.chat_id, e);
        }
        await sleep(60);
      }
    }
  }
  await setMeta("last_check", { at: new Date().toISOString(), stats, fresh: fresh.length, sent });
  return { stats, fresh: fresh.length, matching: toEnrich.length, sent, seeding };
}

// -------------------------------------------------------------- команды бота
async function sendToday(chat_id: number) {
  const today = S.bratislavaDate(new Date());
  const rows = await sql`
    select data from flatbot.listings
    where fits and (published = ${today}::date
          or (not seeded and (first_seen at time zone 'Europe/Bratislava')::date = ${today}::date))
    order by first_seen desc, published desc nulls last`;
  if (!rows.length) {
    await say(chat_id, "Сегодня новых подходящих объявлений пока нет. Как только появятся — пришлю.");
    return;
  }
  const shown = rows.slice(0, TODAY_LIMIT);
  await say(
    chat_id,
    `📅 Объявления за сегодня: <b>${rows.length}</b>` +
      (rows.length > shown.length ? ` (показываю ${shown.length} самых свежих)` : ""),
  );
  for (const r of shown.reverse()) {
    await sendListing(chat_id, r.data as Listing);
    await sleep(350);
  }
}

const HELP =
  `Я присылаю новые объявления об аренде квартир и комнат в Братиславе до ${MAX_PRICE} € ` +
  `с bazos.sk, nehnutelnosti.sk (+reality.sk, byty.sk), topreality.sk и bezrealitky.sk. Проверяю каждые 10 минут.\n\n` +
  `/today — объявления за сегодня\n/status — когда была последняя проверка\n/stop — отписаться`;

async function handleUpdate(u: any) {
  const msg = u.message;
  if (u.my_chat_member?.new_chat_member?.status === "kicked") {
    await sql`update flatbot.subscribers set active = false where chat_id = ${u.my_chat_member.chat.id}`;
    return;
  }
  if (!msg?.chat) return;
  const chat_id: number = msg.chat.id;
  const name = msg.chat.title ?? [msg.chat.first_name, msg.chat.last_name].filter(Boolean).join(" ") ?? "";
  const cmd = String(msg.text ?? "").trim().split(/[\s@]/)[0].toLowerCase();

  if (cmd === "/stop") {
    await sql`update flatbot.subscribers set active = false where chat_id = ${chat_id}`;
    await say(chat_id, "Отписал. Чтобы снова получать объявления — /start");
    return;
  }

  // любой, кто написал боту, становится подписчиком
  const [prev] = await sql`select active from flatbot.subscribers where chat_id = ${chat_id}`;
  await sql`insert into flatbot.subscribers (chat_id, name, active) values (${chat_id}, ${name}, true)
            on conflict (chat_id) do update set active = true, name = excluded.name`;
  const isNew = !prev || !prev.active;

  if (cmd === "/status") {
    const lc = await meta("last_check");
    const lines = lc
      ? Object.entries(lc.stats).map(([k, v]) => `• ${k}: ${v}`).join("\n")
      : "ещё не было";
    const at = lc ? new Date(lc.at).toLocaleString("ru-RU", { timeZone: "Europe/Bratislava" }) : "";
    await say(chat_id, `🕒 Последняя проверка: ${at}\n${esc(lines)}`);
    return;
  }
  if (isNew || cmd === "/start") {
    await say(chat_id, (isNew ? "✅ Вы подписаны!\n\n" : "") + HELP);
    await sendToday(chat_id);
    return;
  }
  if (cmd === "/today") {
    await sendToday(chat_id);
    return;
  }
  await say(chat_id, HELP);
}

// ---------------------------------------------------------------- setup
async function setup() {
  // подписчики, которые писали боту до переезда (пока работал getUpdates)
  let imported = 0;
  try {
    const updates = await tg("getUpdates", {});
    const chats = new Map<number, string>();
    for (const u of updates) {
      const c = (u.message ?? u.my_chat_member)?.chat;
      if (c) chats.set(c.id, c.title ?? c.first_name ?? "");
    }
    for (const [id, name] of chats) {
      await sql`insert into flatbot.subscribers (chat_id, name) values (${id}, ${name}) on conflict do nothing`;
      imported++;
    }
  } catch (e) {
    console.error("getUpdates", e); // уже стоит вебхук — значит импорт не нужен
  }
  const secret = await meta("webhook_secret");
  await tg("setWebhook", {
    url: SELF_URL,
    secret_token: secret,
    allowed_updates: ["message", "my_chat_member"],
  });
  await tg("setMyCommands", {
    commands: [
      { command: "today", description: "Объявления за сегодня" },
      { command: "status", description: "Последняя проверка сайтов" },
      { command: "stop", description: "Отписаться" },
    ],
  });
  const result = await check();
  const subs = await sql`select chat_id from flatbot.subscribers where active`;
  for (const s of subs) {
    try {
      await say(
        Number(s.chat_id),
        "🚀 Бот переехал в облако и теперь работает 24/7: отвечает сразу, проверяет сайты каждые 10 минут.\n" +
          "У объявлений появились кнопки «Позвонить» и «Скопировать номер», если телефон указан.\n\n/today — объявления за сегодня",
      );
    } catch (e) {
      console.error(e);
    }
  }
  return { imported, subscribers: subs.length, ...result };
}

// ---------------------------------------------------------------- роутер
Deno.serve(async (req) => {
  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  if (req.method === "GET" && action === "call") {
    const n = (url.searchParams.get("n") ?? "").replace(/[^\d+]/g, "");
    if (!/^\+\d{9,15}$/.test(n)) return new Response("bad number", { status: 400 });
    return new Response(null, { status: 302, headers: { location: `tel:${n}` } });
  }

  if (req.method !== "POST") return new Response("ok");

  if (!TOKEN) TOKEN = (await meta("bot_token")) ?? "";

  if (action === "check" || action === "setup") {
    const cronOk = req.headers.get("x-cron-secret") === (await meta("cron_secret"));
    const given = req.headers.get("x-bot-token");
    if (action === "setup" && given && (cronOk || !TOKEN)) {
      const me = await (await fetch(`https://api.telegram.org/bot${given}/getMe`)).json();
      if (!me.ok) return new Response("bad token", { status: 400 });
      await setMeta("bot_token", given);
      TOKEN = given;
    } else if (!cronOk) {
      return new Response("forbidden", { status: 403 });
    }
    if (!TOKEN) return new Response("TELEGRAM_BOT_TOKEN не задан", { status: 500 });
    try {
      const out = action === "setup" ? await setup() : await check();
      return Response.json(out);
    } catch (e) {
      console.error(e);
      return Response.json({ error: String(e) }, { status: 500 });
    }
  }

  // вебхук Telegram
  if (req.headers.get("x-telegram-bot-api-secret-token") !== (await meta("webhook_secret"))) {
    return new Response("forbidden", { status: 403 });
  }
  const update = await req.json();
  // отвечаем Telegram сразу, а сообщения досылаем в фоне
  // @ts-ignore EdgeRuntime есть в среде Supabase
  EdgeRuntime.waitUntil(handleUpdate(update).catch((e) => console.error("update", e)));
  return new Response("ok");
});
