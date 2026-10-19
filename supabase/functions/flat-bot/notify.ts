// Сообщения бота о настройке уведомлений: подтверждение после онбординга,
// тестовое уведомление и короткое «фильтр обновлён».
import { matches, NO_LIMIT, sql } from "./db.ts";
import type { Settings } from "./db.ts";
import * as G from "./geo.ts";
import type { Listing } from "./sources.ts";
import { APP_URL, esc, say, sendListing, sleep } from "./tg.ts";
import { L, langOr, tr } from "./i18n.ts";
import type { Lang } from "./i18n.ts";

export function filterSummary(s: Settings, lang: Lang = langOr(s.lang)) {
  const t = L(lang);
  const where = [
    ...s.cities.map((c) => G.townByKey.get(c)?.name ?? c),
    ...s.districts.map((d) => `${G.townByKey.get(G.districtCity(d) ?? "")?.name ?? ""} · ${G.districtName(d)}`),
    ...s.regions.map((r) => G.regionName(r) ?? r),
  ];
  const what = s.kinds.length === 4 ? t("kinds.any") : s.kinds.map((k) => t(`kinds.${k}`)).join(", ");
  const budget = s.maxTotal >= NO_LIMIT ? t("f.budgetAny") : t("f.budgetMax", { n: s.maxTotal });
  const who = t(({ any: "f.whoAny", private: "f.whoPrivate", agency: "f.whoAgency" } as const)[s.agency] ?? "f.whoAny");
  const how = s.notify.mode === "instant"
    ? t("f.instant") + (s.notify.quiet.on ? t("f.quietExcept", { from: s.notify.quiet.from, to: s.notify.quiet.to }) : "")
    : s.notify.mode === "digest" ? t("f.digest", { times: s.notify.digestTimes.join(", ") }) : t("f.off");
  return [
    t("f.where", { v: esc(where.length ? where.join(", ") : t("f.allSlovakia")) }),
    t("f.what", { v: what }),
    t("f.budget", { v: budget }),
    t("f.who", { v: who }),
    t("f.notify", { v: how }),
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

const editButton = (lang: Lang) => ({ inline_keyboard: [[{ text: tr(lang, "btn.editFilters"), web_app: { url: APP_URL } }]] });

export async function sendSetup(chat: number, s: Settings, kind: "welcome" | "test" | "updated") {
  const lang = langOr(s.lang);
  const t = L(lang);
  if (kind === "updated") {
    await say(chat, `${t("setup.updated")}\n\n${filterSummary(s, lang)}`, { reply_markup: editButton(lang) });
    return;
  }
  const latest = await latestMatching(s, kind === "welcome" ? 3 : 1);
  const head = (kind === "welcome" ? t("setup.welcome") : t("setup.test")) + "\n\n";
  const tail = latest.length
    ? `\n\n${kind === "welcome" ? t("setup.latestMany") : t("setup.latestOne")}`
    : "\n\n" + t("setup.none");
  await say(chat, head + filterSummary(s, lang) + tail, { reply_markup: editButton(lang) });
  for (const l of latest.reverse()) {
    await sleep(400);
    await sendListing(chat, l, lang);
  }
}
