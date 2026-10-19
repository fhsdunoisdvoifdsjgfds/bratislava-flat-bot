// Сообщения бота о настройке уведомлений: подтверждение после онбординга,
// тестовое уведомление и короткое «фильтр обновлён».
import { matches, NO_LIMIT, sql } from "./db.ts";
import type { Settings } from "./db.ts";
import * as G from "./geo.ts";
import type { Listing } from "./sources.ts";
import { APP_URL, esc, say, sendListing, sleep } from "./tg.ts";

const KINDS: Record<string, string> = { room: "комнаты", studio: "студии", flat: "квартиры", hostel: "общежития" };

export function filterSummary(s: Settings) {
  const where = [
    ...s.cities.map((c) => G.townByKey.get(c)?.name ?? c),
    ...s.districts.map((d) => `${G.townByKey.get(G.districtCity(d) ?? "")?.name ?? ""} · ${G.districtName(d)}`),
    ...s.regions.map((r) => G.regionName(r) ?? r),
  ];
  const what = s.kinds.length === 4 ? "любое жильё" : s.kinds.map((k) => KINDS[k]).join(", ");
  const budget = s.maxTotal >= NO_LIMIT ? "любой" : `до ${s.maxTotal} € с энергиями`;
  const who = { any: "все", private: "только частники", agency: "только агентства" }[s.agency];
  const how = s.notify.mode === "instant"
    ? "сразу, как появится" + (s.notify.quiet.on ? ` (кроме ${s.notify.quiet.from}–${s.notify.quiet.to})` : "")
    : s.notify.mode === "digest" ? `подборкой в ${s.notify.digestTimes.join(", ")}` : "выключены";
  return [
    `📍 <b>Где:</b> ${esc(where.length ? where.join(", ") : "вся Словакия")}`,
    `🏠 <b>Что:</b> ${what}`,
    `💶 <b>Бюджет:</b> ${budget}`,
    `🤝 <b>Кто сдаёт:</b> ${who}`,
    `🔔 <b>Уведомления:</b> ${how}`,
  ].join("\n");
}

// summary-ключ, чтобы не писать «обновлён», если фильтр по сути не поменялся
export const summaryKey = (s: Settings) =>
  JSON.stringify([s.kinds, s.maxTotal, s.agency, s.regions, s.cities, s.districts, s.withPhone, s.withPhoto, s.notify]);

async function latestMatching(s: Settings, n: number): Promise<Listing[]> {
  const rows = await sql`
    select data from flatbot.listings
    where kind is not null and price >= 150 and posted_at > now() - interval '3 days'
    order by posted_at desc limit 400`;
  return rows.map((r: any) => r.data as Listing).filter((l) => matches(l, s)).slice(0, n);
}

const editButton = { inline_keyboard: [[{ text: "⚙️ Изменить фильтры", web_app: { url: APP_URL } }]] };

export async function sendSetup(chat: number, s: Settings, kind: "welcome" | "test" | "updated") {
  if (kind === "updated") {
    await say(chat, `✅ <b>Фильтр уведомлений обновлён</b>\n\n${filterSummary(s)}`, { reply_markup: editButton });
    return;
  }
  const latest = await latestMatching(s, kind === "welcome" ? 3 : 1);
  const head = kind === "welcome"
    ? "✅ <b>Готово, уведомления включены!</b>\n\n" +
      "Как только на bazos, nehnutelnosti, topreality или bezrealitky появится подходящее объявление — " +
      "пришлю его сюда, обычно в течение 10 минут после публикации. Хорошие варианты разбирают за часы, " +
      "так что вы будете звонить одним из первых.\n\n"
    : "🔔 <b>Так выглядит уведомление.</b>\n\n";
  const tail = latest.length
    ? `\n\n${kind === "welcome" ? "Последние подходящие объявления" : "Последнее подходящее объявление"} 👇`
    : "\n\nПрямо сейчас подходящих объявлений нет — как только появятся, сразу напишу.";
  await say(chat, head + filterSummary(s) + tail, { reply_markup: editButton });
  for (const l of latest.reverse()) {
    await sleep(400);
    await sendListing(chat, l);
  }
}
