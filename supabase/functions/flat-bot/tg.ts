import { meta, sql } from "./db.ts";
import { L, tr } from "./i18n.ts";
import type { Lang } from "./i18n.ts";
import * as S from "./sources.ts";
import type { Listing } from "./sources.ts";

// токен берём из секрета функции, а если его нет — из закрытой таблицы flatbot.meta
let TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
export async function token() {
  if (!TOKEN) TOKEN = (await meta("bot_token")) ?? "";
  return TOKEN;
}
export function setToken(t: string) {
  TOKEN = t;
}

export const APP_URL = "https://fhsdunoisdvoifdsjgfds.github.io/bratislava-flat-bot/";
export const SELF_URL = `${Deno.env.get("SUPABASE_URL")}/functions/v1/flat-bot`;
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function tg(method: string, params: Record<string, unknown>): Promise<any> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(`https://api.telegram.org/bot${await token()}/${method}`, {
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

export const say = (chat_id: number, text: string, extra: Record<string, unknown> = {}) =>
  tg("sendMessage", { chat_id, text, parse_mode: "HTML", link_preview_options: { is_disabled: true }, ...extra });

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ---------------------------------------------------------------- подписи
const KINDS = ["flat", "studio", "room", "hostel"] as const;
export const kindLabel = (lang: Lang, k: string) =>
  (KINDS as readonly string[]).includes(k) ? tr(lang, `kind.${k as (typeof KINDS)[number]}`) : null;
export const SOURCE_LABEL: Record<string, string> = {
  bazos: "Bazoš",
  nehnutelnosti: "Nehnuteľnosti.sk",
  topreality: "TopReality",
  bezrealitky: "Bezrealitky",
};
export const districtName = (k: string | null) => S.DISTRICTS.find((d) => d[0] === k)?.[1] ?? null;
// «Bratislava · Ružinov», «Košice», «Nová Dedinka»
export const placeName = (l: Pick<Listing, "cityName" | "district">) =>
  [l.cityName, districtName(l.district)].filter(Boolean).join(" · ") || null;

export function priceLine(l: Listing, lang: Lang): string {
  const t = S.total(l);
  if (l.price == null) return tr(lang, "price.negotiable");
  if (l.utilities === "extra" && l.charges) return tr(lang, "price.split", { total: t ?? l.price, price: l.price, charges: l.charges });
  if (l.utilities === "included") return tr(lang, "price.included", { price: l.price });
  if (l.utilities === "extra") return tr(lang, "price.extra", { price: l.price });
  return tr(lang, "price.unknown", { price: l.price });
}

export const appLink = (key?: string) => APP_URL + (key ? `#l=${encodeURIComponent(key)}` : "");

export function render(l: Listing, lang: Lang) {
  const t = L(lang);
  const lines = [`🏠 <b>${esc(l.title.slice(0, 180))}</b>`, "💶 " + priceLine(l, lang)];
  // этаж: у старых записей Bezrealitky — «3 из 8», теперь хранится «3/8»
  const floor = l.floor ? String(l.floor).replace(/\s+из\s+/, "/") : null;
  const where = [placeName(l), kindLabel(lang, l.kind), l.area ? t("area", { n: l.area }) : null, floor ? t("floor", { f: floor }) : null]
    .filter(Boolean).join(" · ");
  if (where) lines.push("📍 " + esc(where));
  if (l.agency === true) lines.push(`${t("agency")}${l.seller ? `: ${esc(l.seller.slice(0, 60))}` : ""}${l.commission ? t("agency.commission") : ""}`);
  else if (l.agency === false) lines.push(t("agency.private"));
  if (l.deposit) lines.push(t("deposit", { n: l.deposit }));
  if (l.phones.length) lines.push(`☎️ ${l.phones.map(S.prettyPhone).join(", ")}`);
  lines.push(`🌐 ${SOURCE_LABEL[l.source] ?? l.source}${l.published ? ` · ${l.published.split("-").reverse().slice(0, 2).join(".")}` : ""}`);

  const keyboard: any[][] = [];
  if (l.phones.length) {
    keyboard.push([
      { text: t("btn.call"), url: `${SELF_URL}?action=call&n=${encodeURIComponent(l.phones[0])}` },
      { text: t("btn.copyNumber"), copy_text: { text: l.phones[0] } },
    ]);
  }
  keyboard.push([
    { text: t("btn.details"), web_app: { url: appLink(S.key(l)) } },
    { text: t("btn.onSite"), url: l.url },
  ]);
  return { text: lines.join("\n"), reply_markup: { inline_keyboard: keyboard } };
}

export async function sendListing(chat_id: number, l: Listing, lang: Lang, prefix = "") {
  const { text, reply_markup } = render(l, lang);
  try {
    await say(chat_id, prefix + text, { reply_markup });
  } catch (e) {
    // если клиент не поддерживает какие-то кнопки — оставляем только ссылки
    if (/button|copy_text|web_app/i.test(String(e))) {
      const plain = { inline_keyboard: [[{ text: tr(lang, "btn.openListing"), url: l.url }]] };
      await say(chat_id, prefix + text, { reply_markup: plain });
    } else throw e;
  }
}

// подборка: короткие строки + кнопка в приложение
export async function sendDigest(chat_id: number, ls: Listing[], title: string, lang: Lang) {
  const lines = ls.slice(0, 12).map((l) => {
    const t = S.total(l) ?? l.price;
    const d = placeName(l) ?? "";
    const k = kindLabel(lang, l.kind);
    return `• <b>${t ?? "?"} €</b>${k ? " · " + esc(k) : ""}${d ? " · " + esc(d) : ""}\n  <a href="${esc(l.url)}">${esc(l.title.slice(0, 70))}</a>`;
  });
  const more = ls.length > 12 ? "\n" + tr(lang, "digest.more", { n: ls.length - 12 }) : "";
  await say(chat_id, `${title}\n\n${lines.join("\n")}${more}`, {
    reply_markup: { inline_keyboard: [[{ text: tr(lang, "btn.openAll"), web_app: { url: APP_URL } }]] },
  });
}
