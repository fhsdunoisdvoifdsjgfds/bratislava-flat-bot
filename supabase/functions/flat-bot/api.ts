// API для Telegram Mini App. Публичные операции (лента, карточка, статистика)
// работают без авторизации; личные (настройки, избранное, напоминания) требуют
// подписанный Telegram initData.
import { DEFAULT_SETTINGS, meta, settingsOf, sql } from "./db.ts";
import * as S from "./sources.ts";
import { token } from "./tg.ts";

type User = { id: number; first_name?: string; last_name?: string; username?: string };

const enc = new TextEncoder();
async function hmac(key: Uint8Array, data: string) {
  const k = await crypto.subtle.importKey("raw", key as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(data)));
}
const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");

// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
export async function verifyInitData(initData: string | undefined): Promise<User | null> {
  if (!initData) return null;
  const p = new URLSearchParams(initData);
  const hash = p.get("hash");
  if (!hash) return null;
  p.delete("hash");
  const check = [...p.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join("\n");
  const secret = await hmac(enc.encode("WebAppData"), await token());
  if (hex(await hmac(secret, check)) !== hash) return null;
  if (Date.now() / 1000 - Number(p.get("auth_date") ?? 0) > 30 * 86400) return null;
  try {
    return JSON.parse(p.get("user") ?? "null");
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- фильтры ленты
type Filters = {
  kinds?: string[];
  minTotal?: number;
  maxTotal?: number;
  agency?: "any" | "private" | "agency";
  districts?: string[];
  withPhone?: boolean;
  withPhoto?: boolean;
  onlyNew?: boolean;
  q?: string;
};

function where(f: Filters, user: User | null) {
  const kinds = f.kinds?.length ? f.kinds : DEFAULT_SETTINGS.kinds;
  const min = Number(f.minTotal ?? 0);
  const max = Number(f.maxTotal ?? 2000);
  const q = (f.q ?? "").trim().slice(0, 60);
  return sql`
    l.kind is not null and l.posted_at > now() - interval '30 days'
    and l.kind = any(${kinds}::text[])
    and (coalesce(l.total, l.price) is null or coalesce(l.total, l.price) between ${min}::int and ${max}::int)
    ${f.agency === "private" ? sql`and l.agency is distinct from true` : sql``}
    ${f.agency === "agency" ? sql`and l.agency is true` : sql``}
    ${f.districts?.length ? sql`and l.district = any(${f.districts}::text[])` : sql``}
    ${f.withPhone ? sql`and l.has_phone` : sql``}
    ${f.withPhoto ? sql`and l.has_photo` : sql``}
    ${f.onlyNew ? sql`and l.posted_at > now() - interval '24 hours'` : sql``}
    ${q ? sql`and (l.data->>'title' ilike ${"%" + q + "%"} or l.data->>'text' ilike ${"%" + q + "%"} or l.data->>'address' ilike ${"%" + q + "%"})` : sql``}
    ${user ? sql`and not exists (select 1 from flatbot.hidden h where h.chat_id = ${user.id} and h.key = l.key)` : sql``}`;
}

// медианы «итого» по типу и району за 30 дней — основа для «дешевле рынка на N%»
const MEDIANS = sql`
  med_d as (
    select kind, district, percentile_cont(0.5) within group (order by total) m, count(*) n
    from flatbot.listings where kind is not null and total >= 80 and posted_at > now() - interval '30 days'
    group by kind, district),
  med_k as (
    select kind, percentile_cont(0.5) within group (order by total) m, count(*) n
    from flatbot.listings where kind is not null and total >= 80 and posted_at > now() - interval '30 days'
    group by kind)`;

const COMPACT = sql`
  l.key, l.source, l.kind, l.district, l.agency, l.price, l.total, l.area, l.lat, l.lng,
  l.has_phone, l.posted_at, l.detailed, l.seeded, l.published,
  l.data->>'title' as title, l.data->>'utilities' as utilities, (l.data->>'charges')::int as charges,
  (l.data->>'rooms')::float as rooms, l.data->>'seller' as seller, (l.data->>'commission')::boolean as commission,
  l.data->'images'->>0 as img, jsonb_array_length(coalesce(l.data->'images', '[]')) as img_count,
  l.data->'tags' as tags,
  case when l.total is not null then round((l.total / nullif(coalesce(case when md.n >= 4 then md.m end, mk.m), 0) - 1) * 100)
  end as deal`;

function orderBy(sort: string) {
  switch (sort) {
    case "cheap":
      return sql`order by coalesce(l.total, l.price) asc nulls last, l.posted_at desc`;
    case "m2":
      return sql`order by coalesce(l.total, l.price)::float / nullif(l.area, 0) asc nulls last, l.posted_at desc`;
    case "deal":
      return sql`order by deal asc nulls last, l.posted_at desc`;
    default:
      return sql`order by l.posted_at desc, l.first_seen desc`;
  }
}

async function feed(body: any, user: User | null) {
  const f: Filters = body.filters ?? {};
  const limit = Math.min(Number(body.limit ?? 24), 60);
  const offset = Math.max(Number(body.offset ?? 0), 0);
  const items = await sql`
    with ${MEDIANS}
    select ${COMPACT}, count(*) over () as total_count
      ${user ? sql`, exists (select 1 from flatbot.favorites v where v.chat_id = ${user.id} and v.key = l.key) as fav` : sql``}
    from flatbot.listings l
    left join med_d md on md.kind = l.kind and md.district is not distinct from l.district
    left join med_k mk on mk.kind = l.kind
    where ${where(f, user)}
    ${orderBy(body.sort ?? "new")}
    limit ${limit} offset ${offset}`;
  return { items, total: Number(items[0]?.total_count ?? 0) };
}

async function mapPoints(body: any, user: User | null) {
  const points = await sql`
    select l.key, l.lat, l.lng, coalesce(l.total, l.price) as total, l.kind
    from flatbot.listings l
    where ${where(body.filters ?? {}, user)} and l.lat is not null
    order by l.posted_at desc limit 600`;
  return { points };
}

async function listing(body: any, user: User | null) {
  const key = String(body.key ?? "");
  const [l] = await sql`
    with ${MEDIANS}
    select l.data, l.posted_at, l.first_seen, l.total, l.seeded,
      coalesce(case when md.n >= 4 then md.m end, mk.m) as median,
      case when md.n >= 4 then md.n else mk.n end as median_n,
      case when md.n >= 4 then 'district' else 'kind' end as median_scope
      ${user ? sql`, exists (select 1 from flatbot.favorites v where v.chat_id = ${user.id} and v.key = l.key) as fav` : sql``}
    from flatbot.listings l
    left join med_d md on md.kind = l.kind and md.district is not distinct from l.district
    left join med_k mk on mk.kind = l.kind
    where l.key = ${key}`;
  if (!l) return { error: "not_found" };
  // карточка ещё не дочитана — дочитываем прямо сейчас (фото, описание, контакты)
  if (!l.data.detailed) {
    try {
      await S.detail(l.data);
      const { saveDetailed } = await import("./db.ts");
      await saveDetailed(l.data);
    } catch (e) {
      console.error("detail on open", key, e);
    }
  }
  const similar = await sql`
    with ${MEDIANS}
    select ${COMPACT}
    from flatbot.listings l
    left join med_d md on md.kind = l.kind and md.district is not distinct from l.district
    left join med_k mk on mk.kind = l.kind
    where l.kind = ${l.data.kind} and l.key <> ${key} and l.posted_at > now() - interval '30 days'
      and ${l.data.district ? sql`l.district = ${l.data.district}` : sql`true`}
      and abs(coalesce(l.total, l.price, 0) - ${Number(l.total ?? l.data.price ?? 0)}::int) < 150
    order by l.posted_at desc limit 6`;
  const reminders = user
    ? await sql`select id, remind_at, note, sent from flatbot.reminders where chat_id = ${user.id} and key = ${key} order by remind_at`
    : [];
  return {
    item: { ...l.data, key, total: S.total(l.data), posted_at: l.posted_at, first_seen: l.first_seen, seeded: l.seeded },
    median: l.median ? Math.round(l.median) : null,
    medianN: Number(l.median_n ?? 0),
    medianScope: l.median_scope,
    fav: !!l.fav,
    reminders,
    similar,
  };
}

async function stats() {
  const [byDistrict, byKind, bySource, perDay, [totals]] = await Promise.all([
    sql`select district, percentile_cont(0.5) within group (order by total) as median, count(*)::int as n
        from flatbot.listings where kind is not null and total >= 80 and posted_at > now() - interval '30 days'
          and kind in ('flat', 'studio') and district is not null
        group by district having count(*) >= 3 order by median`,
    sql`select kind, percentile_cont(0.5) within group (order by total) as median,
          min(total) as min, count(*)::int as n
        from flatbot.listings where kind is not null and total >= 80 and posted_at > now() - interval '30 days'
        group by kind`,
    sql`select source, count(*)::int as n from flatbot.listings
        where kind is not null and posted_at > now() - interval '30 days' group by source order by n desc`,
    sql`select (posted_at at time zone 'Europe/Bratislava')::date as day, count(*)::int as n
        from flatbot.listings where kind is not null and posted_at > now() - interval '14 days'
          and not (seeded and published is null) -- у массово подгруженных без даты время неизвестно
        group by 1 order by 1`,
    sql`select count(*)::int as total,
          count(*) filter (where posted_at > now() - interval '24 hours')::int as new24,
          count(*) filter (where agency is false)::int as private,
          count(*) filter (where has_phone)::int as with_phone
        from flatbot.listings where kind is not null and posted_at > now() - interval '30 days'`,
  ]);
  return { byDistrict, byKind, bySource, perDay, totals };
}

async function bootstrap(user: User | null) {
  const districtCounts = await sql`
    select district, count(*)::int as n from flatbot.listings
    where kind is not null and posted_at > now() - interval '30 days' group by district`;
  const counts = Object.fromEntries(districtCounts.map((r: any) => [r.district ?? "", r.n]));
  const lastCheck = await meta("last_check");
  let me: any = null;
  if (user) {
    const name = [user.first_name, user.last_name].filter(Boolean).join(" ");
    await sql`insert into flatbot.subscribers (chat_id, name, username) values (${user.id}, ${name}, ${user.username ?? null})
              on conflict (chat_id) do update set name = excluded.name, username = excluded.username`;
    const [s] = await sql`select settings, onboarded, active from flatbot.subscribers where chat_id = ${user.id}`;
    const [c] = await sql`select
        (select count(*)::int from flatbot.favorites where chat_id = ${user.id}) as favorites,
        (select count(*)::int from flatbot.reminders where chat_id = ${user.id} and not sent) as reminders`;
    const favKeys = await sql`select key from flatbot.favorites where chat_id = ${user.id}`;
    me = {
      id: user.id,
      name,
      settings: settingsOf(s.settings),
      onboarded: s.onboarded,
      active: s.active,
      counts: c,
      favorites: favKeys.map((r: any) => r.key),
    };
  }
  return {
    me,
    defaults: DEFAULT_SETTINGS,
    districts: S.DISTRICTS.map(([k, name, group]) => ({ key: k, name, group, n: counts[k] ?? 0 })),
    lastCheck: lastCheck ? { at: lastCheck.at, stats: lastCheck.stats } : null,
  };
}

function cleanSettings(raw: any) {
  const s = settingsOf(raw);
  const kinds = s.kinds.filter((k) => ["flat", "studio", "room", "hostel"].includes(k));
  const times = (s.notify.digestTimes ?? []).filter((t) => /^\d{2}:\d{2}$/.test(t)).slice(0, 6);
  return {
    ...s,
    kinds: kinds.length ? kinds : DEFAULT_SETTINGS.kinds,
    minTotal: Math.max(0, Math.min(2000, Number(s.minTotal) || 0)),
    maxTotal: Math.max(50, Math.min(2000, Number(s.maxTotal) || 650)),
    agency: ["any", "private", "agency"].includes(s.agency) ? s.agency : "any",
    districts: s.districts.filter((d) => S.DISTRICTS.some((x) => x[0] === d)),
    notify: { ...s.notify, digestTimes: times.length ? times : DEFAULT_SETTINGS.notify.digestTimes },
  };
}

export async function handleApi(body: any) {
  const user = await verifyInitData(body.initData);
  const need = () => {
    if (!user) throw new Response(JSON.stringify({ error: "auth" }), { status: 401 });
    return user;
  };
  switch (body.op) {
    case "bootstrap":
      return bootstrap(user);
    case "feed":
      return feed(body, user);
    case "map":
      return mapPoints(body, user);
    case "listing":
      return listing(body, user);
    case "stats":
      return stats();
    case "settings": {
      const u = need();
      const s = cleanSettings(body.settings);
      await sql`update flatbot.subscribers set settings = ${sql.json(s as any)}, active = true,
                onboarded = onboarded or ${!!body.onboarded} where chat_id = ${u.id}`;
      return { ok: true, settings: s };
    }
    case "fav": {
      const u = need();
      if (body.on) await sql`insert into flatbot.favorites (chat_id, key) values (${u.id}, ${body.key}) on conflict do nothing`;
      else await sql`delete from flatbot.favorites where chat_id = ${u.id} and key = ${body.key}`;
      return { ok: true };
    }
    case "hide": {
      const u = need();
      if (body.on === false) await sql`delete from flatbot.hidden where chat_id = ${u.id} and key = ${body.key}`;
      else await sql`insert into flatbot.hidden (chat_id, key) values (${u.id}, ${body.key}) on conflict do nothing`;
      return { ok: true };
    }
    case "favorites": {
      const u = need();
      const items = await sql`
        with ${MEDIANS}
        select ${COMPACT}, true as fav, v.created_at as faved_at
        from flatbot.favorites v join flatbot.listings l on l.key = v.key
        left join med_d md on md.kind = l.kind and md.district is not distinct from l.district
        left join med_k mk on mk.kind = l.kind
        where v.chat_id = ${u.id} order by v.created_at desc`;
      return { items };
    }
    case "reminders": {
      const u = need();
      const items = await sql`
        select r.id, r.key, r.note, r.remind_at, r.sent, r.created_at,
          l.data->>'title' as title, l.data->'images'->>0 as img, coalesce(l.total, l.price) as total, l.kind, l.district
        from flatbot.reminders r left join flatbot.listings l on l.key = r.key
        where r.chat_id = ${u.id} order by r.sent, r.remind_at`;
      return { items };
    }
    case "remind": {
      const u = need();
      const at = new Date(body.at);
      if (isNaN(+at) || +at < Date.now() - 60_000 || +at > Date.now() + 90 * 86400_000) return { error: "bad_time" };
      const [r] = await sql`insert into flatbot.reminders (chat_id, key, note, remind_at)
        values (${u.id}, ${body.key ?? null}, ${String(body.note ?? "").slice(0, 300)}, ${at}) returning id`;
      return { ok: true, id: r.id };
    }
    case "remind_del": {
      const u = need();
      await sql`delete from flatbot.reminders where chat_id = ${u.id} and id = ${Number(body.id)}`;
      return { ok: true };
    }
    case "notify_test": {
      const u = need();
      const { say } = await import("./tg.ts");
      await say(u.id, "🔔 Тестовое уведомление: всё работает! Новые объявления будут приходить сюда.");
      return { ok: true };
    }
    default:
      return { error: "unknown_op" };
  }
}
