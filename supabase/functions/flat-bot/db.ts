import postgres from "npm:postgres@3.4.5";
import * as S from "./sources.ts";
import type { Kind, Listing } from "./sources.ts";

export const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 3 });

export async function meta(k: string): Promise<any> {
  const [row] = await sql`select v from flatbot.meta where k = ${k}`;
  return row?.v;
}
export async function setMeta(k: string, v: unknown) {
  await sql`insert into flatbot.meta (k, v) values (${k}, ${sql.json(v as any)})
            on conflict (k) do update set v = excluded.v`;
}

// ---------------------------------------------------------------- настройки пользователя
export type Settings = {
  kinds: Kind[];
  minTotal: number;
  maxTotal: number;
  agency: "any" | "private" | "agency";
  districts: string[]; // пусто — все
  withPhone: boolean;
  withPhoto: boolean;
  notify: {
    mode: "instant" | "digest" | "off";
    digestTimes: string[]; // "HH:MM"
    quiet: { on: boolean; from: string; to: string };
  };
};

export const DEFAULT_SETTINGS: Settings = {
  kinds: ["flat", "studio", "room", "hostel"],
  minTotal: 0,
  maxTotal: 650,
  agency: "any",
  districts: [],
  withPhone: false,
  withPhoto: false,
  notify: { mode: "instant", digestTimes: ["09:00", "13:00", "19:00"], quiet: { on: false, from: "23:00", to: "07:00" } },
};

export function settingsOf(raw: any): Settings {
  const s = raw ?? {};
  return {
    ...DEFAULT_SETTINGS,
    ...s,
    notify: {
      ...DEFAULT_SETTINGS.notify,
      ...(s.notify ?? {}),
      quiet: { ...DEFAULT_SETTINGS.notify.quiet, ...(s.notify?.quiet ?? {}) },
    },
  };
}

// проверка объявления против фильтров пользователя (для уведомлений)
export function matches(l: Listing, s: Settings): boolean {
  if (!s.kinds.includes(l.kind)) return false;
  const t = S.total(l);
  if (t != null && (t > s.maxTotal || t < s.minTotal)) return false;
  if (s.agency === "private" && l.agency === true) return false;
  if (s.agency === "agency" && l.agency !== true) return false;
  if (s.districts.length && !(l.district && s.districts.includes(l.district))) return false;
  if (s.withPhone && !l.phones.length) return false;
  if (s.withPhoto && !l.images.length) return false;
  return true;
}

// ---------------------------------------------------------------- запись объявлений
const DAY = 86_400_000;

export function row(l: Listing, seeded: boolean) {
  const today = S.bratislavaDate(new Date());
  // время публикации: дата с сайта, иначе «сейчас» (а для массовой подгрузки — «вчера»,
  // чтобы старые объявления без даты не выглядели свежими)
  let posted = new Date();
  if (l.published && l.published !== today) posted = new Date(`${l.published}T12:00:00+02:00`);
  else if (!l.published && seeded) posted = new Date(Date.now() - 1.5 * DAY);
  return {
    key: S.key(l),
    source: l.source,
    data: sql.json(l as any),
    published: l.published,
    fits: true,
    seeded,
    kind: l.kind,
    district: l.district,
    agency: l.agency,
    price: l.price,
    total: S.total(l),
    area: l.area,
    lat: l.lat,
    lng: l.lng,
    has_phone: l.phones.length > 0,
    has_photo: l.images.length > 0,
    posted_at: posted,
    detailed: l.detailed,
  };
}

// вставка новых; старые записи прежнего формата (kind is null) перезаписываются
export async function upsertListings(ls: Listing[], seeded: boolean) {
  if (!ls.length) return;
  const rows = ls.map((l) => row(l, seeded));
  for (let i = 0; i < rows.length; i += 200) {
    await sql`
      insert into flatbot.listings ${sql(rows.slice(i, i + 200) as any)}
      on conflict (key) do update set
        data = excluded.data, kind = excluded.kind, district = excluded.district, agency = excluded.agency,
        price = excluded.price, total = excluded.total, area = excluded.area, lat = excluded.lat, lng = excluded.lng,
        has_phone = excluded.has_phone, has_photo = excluded.has_photo, posted_at = excluded.posted_at,
        detailed = excluded.detailed, published = excluded.published, last_seen = now()
      where flatbot.listings.kind is null`;
  }
}

// обновить карточку после дочитывания
export async function saveDetailed(l: Listing) {
  await sql`
    update flatbot.listings set
      data = ${sql.json(l as any)}, kind = ${l.kind}, district = ${l.district}, agency = ${l.agency},
      price = ${l.price}, total = ${S.total(l)}, area = ${l.area}, lat = ${l.lat}, lng = ${l.lng},
      has_phone = ${l.phones.length > 0}, has_photo = ${l.images.length > 0}, detailed = true
    where key = ${S.key(l)}`;
}
