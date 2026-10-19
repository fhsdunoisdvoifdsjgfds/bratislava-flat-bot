// API для Telegram Mini App. Публичные операции (лента, карточка, статистика)
// работают без авторизации; личные (настройки, избранное, напоминания) требуют
// подписанный Telegram initData.
import { DEFAULT_SETTINGS, isAdmin, logEvent, meta, MIN_PRICE, NO_LIMIT, settingsOf, sql } from "./db.ts";
import type { Settings } from "./db.ts";
import { asLang } from "./i18n.ts";
import * as G from "./geo.ts";
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
  regions?: string[];
  cities?: string[];
  districts?: string[];
  withPhone?: boolean;
  withPhoto?: boolean;
  onlyNew?: boolean;
  q?: string;
};

function where(f: Filters, user: User | null) {
  const kinds = f.kinds?.length ? f.kinds : DEFAULT_SETTINGS.kinds;
  const min = Number(f.minTotal ?? 0);
  const max = Number(f.maxTotal ?? NO_LIMIT) >= NO_LIMIT ? 1_000_000 : Number(f.maxTotal);
  const regions = f.regions ?? [], cities = f.cities ?? [], districts = f.districts ?? [];
  const anyLoc = regions.length || cities.length || districts.length;
  const q = (f.q ?? "").trim().slice(0, 60);
  return sql`
    l.kind is not null and l.posted_at > now() - interval '30 days'
    and l.kind = any(${kinds}::text[])
    and l.price >= ${MIN_PRICE}::int and l.total between ${min}::int and ${max}::int
    and not coalesce((l.data->>'shortTerm')::boolean, false)
    ${f.agency === "private" ? sql`and l.agency is false` : sql``}
    ${f.agency === "agency" ? sql`and l.agency is true` : sql``}
    ${anyLoc ? sql`and (l.region = any(${regions}::text[]) or l.city = any(${cities}::text[]) or l.district = any(${districts}::text[]))` : sql``}
    ${f.withPhone ? sql`and l.has_phone` : sql``}
    ${f.withPhoto ? sql`and l.has_photo` : sql``}
    ${f.onlyNew ? sql`and l.posted_at > now() - interval '24 hours'` : sql``}
    ${q ? sql`and (l.data->>'title' ilike ${"%" + q + "%"} or l.data->>'text' ilike ${"%" + q + "%"} or l.data->>'address' ilike ${"%" + q + "%"})` : sql``}
    ${user ? sql`and not exists (select 1 from flatbot.hidden h where h.chat_id = ${user.id} and h.key = l.key)` : sql``}`;
}

// медианы «итого» по типу и району за 30 дней — основа для «дешевле рынка на N%»
const MEDIANS = sql`
  med_d as (
    select kind, city, percentile_cont(0.5) within group (order by total) m, count(*) n
    from flatbot.listings where kind is not null and price >= 150 and total >= 150 and posted_at > now() - interval '30 days'
    group by kind, city),
  med_k as (
    select kind, percentile_cont(0.5) within group (order by total) m, count(*) n
    from flatbot.listings where kind is not null and price >= 150 and total >= 150 and posted_at > now() - interval '30 days'
    group by kind)`;

const COMPACT = sql`
  l.key, l.source, l.kind, l.region, l.city, l.data->>'cityName' as city_name, l.district, l.agency, l.price, l.total, l.area, l.lat, l.lng,
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

// подписка: без доступа отдаём только количество (для онбординга), но не сами объявления
async function locked(user: User | null) {
  const { cfg, accessOf } = await import("./stripe.ts");
  if (!(await cfg()).enabled) return false;
  return !user || !(await accessOf(user.id)).ok;
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
    left join med_d md on md.kind = l.kind and md.city is not distinct from l.city
    left join med_k mk on mk.kind = l.kind
    where ${where(f, user)}
    ${orderBy(body.sort ?? "new")}
    limit ${limit} offset ${offset}`;
  const total = Number(items[0]?.total_count ?? 0);
  if (await locked(user)) return { items: [], total, paywall: true };
  return { items, total };
}

async function mapPoints(body: any, user: User | null) {
  if (await locked(user)) return { points: [], paywall: true };
  const points = await sql`
    select l.key, l.lat, l.lng, coalesce(l.total, l.price) as total, l.kind
    from flatbot.listings l
    where ${where(body.filters ?? {}, user)} and l.lat is not null
    order by l.posted_at desc limit 600`;
  return { points };
}

async function listing(body: any, user: User | null) {
  const key = String(body.key ?? "");
  if (await locked(user)) return { error: "paywall" };
  if (user && !body.peek) await logEvent(user.id, "view", { key });
  const [l] = await sql`
    with ${MEDIANS}
    select l.data, l.posted_at, l.first_seen, l.total, l.seeded,
      coalesce(case when md.n >= 4 then md.m end, mk.m) as median,
      case when md.n >= 4 then md.n else mk.n end as median_n,
      case when md.n >= 4 then 'city' else 'kind' end as median_scope
      ${user ? sql`, exists (select 1 from flatbot.favorites v where v.chat_id = ${user.id} and v.key = l.key) as fav` : sql``}
    from flatbot.listings l
    left join med_d md on md.kind = l.kind and md.city is not distinct from l.city
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
    left join med_d md on md.kind = l.kind and md.city is not distinct from l.city
    left join med_k mk on mk.kind = l.kind
    where l.kind = ${l.data.kind} and l.key <> ${key} and l.posted_at > now() - interval '30 days'
      and ${l.data.district ? sql`l.district = ${l.data.district}` : l.data.city ? sql`l.city = ${l.data.city}` : sql`true`}
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
  const [byCity, byKind, bySource, perDay, [totals]] = await Promise.all([
    sql`select city, max(data->>'cityName') as city_name, percentile_cont(0.5) within group (order by total) as median, count(*)::int as n
        from flatbot.listings where kind is not null and price >= 150 and total >= 150 and posted_at > now() - interval '30 days'
          and kind in ('flat', 'studio') and city is not null
        group by city having count(*) >= 5 order by n desc limit 15`,
    sql`select kind, percentile_cont(0.5) within group (order by total) as median,
          min(total) as min, count(*)::int as n
        from flatbot.listings where kind is not null and price >= 150 and total >= 150 and posted_at > now() - interval '30 days'
        group by kind`,
    sql`select source, count(*)::int as n from flatbot.listings
        where kind is not null and price >= 150 and posted_at > now() - interval '30 days' group by source order by n desc`,
    sql`select (posted_at at time zone 'Europe/Bratislava')::date as day, count(*)::int as n
        from flatbot.listings where kind is not null and price >= 150 and posted_at > now() - interval '14 days'
          and not (seeded and published is null) -- у массово подгруженных без даты время неизвестно
        group by 1 order by 1`,
    sql`select count(*)::int as total,
          count(*) filter (where posted_at > now() - interval '24 hours')::int as new24,
          count(*) filter (where agency is false)::int as private,
          count(*) filter (where has_phone)::int as with_phone
        from flatbot.listings where kind is not null and price >= 150 and posted_at > now() - interval '30 days'`,
  ]);
  for (const c of byCity) c.city_name = G.townByKey.get(c.city)?.name ?? c.city_name ?? c.city;
  byCity.sort((a: any, b: any) => a.median - b.median);
  return { byCity, byKind, bySource, perDay, totals };
}

async function bootstrap(user: User | null, body: any = {}) {
  const [regionRows, cityRows, districtRows] = await Promise.all([
    sql`select region, count(*)::int as n from flatbot.listings
        where kind is not null and price >= 150 and posted_at > now() - interval '30 days' and region is not null group by region`,
    sql`select city, max(region) as region, max(data->>'cityName') as name, count(*)::int as n from flatbot.listings
        where kind is not null and price >= 150 and posted_at > now() - interval '30 days' and city is not null group by city`,
    sql`select district, count(*)::int as n from flatbot.listings
        where kind is not null and price >= 150 and posted_at > now() - interval '30 days' and district is not null group by district`,
  ]);
  const rc = Object.fromEntries(regionRows.map((r: any) => [r.region, r.n]));
  const dc = Object.fromEntries(districtRows.map((r: any) => [r.district, r.n]));
  // города: все известные из справочника + деревни, где сейчас есть объявления
  const cities = new Map<string, any>(G.TOWNS.map((t) => [t.key, { key: t.key, name: t.name, region: t.region, n: 0 }]));
  for (const r of cityRows) {
    const c = cities.get(r.city) ?? { key: r.city, name: r.name ?? r.city, region: r.region, n: 0 };
    c.n = r.n;
    cities.set(r.city, c);
  }
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
    const [recent] = await sql`select 1 from flatbot.events where chat_id = ${user.id} and type = 'app_open'
                               and created_at > now() - interval '30 minutes' limit 1`;
    if (!recent) await logEvent(user.id, "app_open", { platform: body?.platform ?? null });
    const { accessOf, priceInfo } = await import("./stripe.ts");
    me = {
      access: await accessOf(user.id),
      price: await priceInfo().catch(() => null),
      isAdmin: await isAdmin(user.id),
      id: user.id,
      name,
      settings: forApp(settingsOf(s.settings)),
      onboarded: s.onboarded,
      active: s.active,
      counts: c,
      favorites: favKeys.map((r: any) => r.key),
    };
  }
  return {
    me,
    defaults: DEFAULT_SETTINGS,
    regions: G.REGIONS.map((r) => ({ key: r.key, name: r.name, n: rc[r.key] ?? 0 })),
    cities: [...cities.values()].filter((c) => c.n > 0 || G.townByKey.has(c.key)).sort((a, b) => b.n - a.n),
    districts: G.DISTRICTS.map(([k, name, city]) => ({ key: k, name, city, n: dc[k] ?? 0 })),
    lastCheck: lastCheck ? { at: lastCheck.at, stats: lastCheck.stats } : null,
  };
}

// язык, определённый ботом по Telegram (langAuto), приложению не отдаём: иначе оно сочтёт его
// выбранным и пропустит экран выбора языка. Приложение само определит тот же язык по Telegram.
function forApp(s: Settings): Settings {
  if (!s.langAuto) return s;
  const { lang: _lang, langAuto: _auto, ...rest } = s;
  return rest;
}

function cleanSettings(raw: any) {
  const s = settingsOf(raw);
  const kinds = s.kinds.filter((k) => ["flat", "studio", "room", "hostel"].includes(k));
  const times = (s.notify.digestTimes ?? []).filter((t) => /^\d{2}:\d{2}$/.test(t)).slice(0, 6);
  return {
    ...s,
    kinds: kinds.length ? kinds : DEFAULT_SETTINGS.kinds,
    minTotal: Math.max(0, Math.min(2000, Number(s.minTotal) || 0)),
    maxTotal: Math.max(50, Math.min(NO_LIMIT, Number(s.maxTotal) || 650)),
    agency: ["any", "private", "agency"].includes(s.agency) ? s.agency : "any",
    lang: asLang((s as any).lang) ?? undefined,
    langAuto: undefined, // язык пришёл из приложения — значит, выбран пользователем
    regions: (s.regions ?? []).filter((r) => G.REGIONS.some((x) => x.key === r)),
    cities: (s.cities ?? []).filter((c) => /^[a-z0-9-]{2,60}$/.test(c)).slice(0, 60),
    districts: (s.districts ?? []).filter((d) => G.DISTRICTS.some((x) => x[0] === d)),
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
      return bootstrap(user, body);
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
      const [prev] = await sql`select settings, onboarded from flatbot.subscribers where chat_id = ${u.id}`;
      // старая версия приложения могла не прислать язык — оставляем сохранённый
      const prevS = settingsOf(prev?.settings);
      if (!s.lang && prevS.lang) Object.assign(s, { lang: prevS.lang, langAuto: prevS.langAuto });
      await sql`update flatbot.subscribers set settings = ${sql.json(s as any)}, active = true,
                onboarded = onboarded or ${!!body.onboarded} where chat_id = ${u.id}`;
      // сообщение в чат: после онбординга — подтверждение с примерами, потом — «фильтр обновлён»
      const { sendSetup, summaryKey } = await import("./notify.ts");
      const first = !!body.onboarded && !prev?.onboarded;
      await logEvent(u.id, first ? "onboarded" : "settings", {
        lang: s.lang ?? null, regions: s.regions, cities: s.cities, districts: s.districts, kinds: s.kinds,
        maxTotal: s.maxTotal, agency: s.agency, mode: s.notify.mode,
        langChanged: settingsOf(prev?.settings).lang !== s.lang ? true : undefined,
      });
      const changed = prev && summaryKey(settingsOf(prev.settings)) !== summaryKey(s);
      if (first || (changed && prev?.onboarded && s.notify.mode !== "off")) {
        // @ts-ignore EdgeRuntime есть в среде Supabase
        EdgeRuntime.waitUntil(sendSetup(u.id, s, first ? "welcome" : "updated").catch((e) => console.error("setup msg", e)));
      }
      return { ok: true, settings: forApp(s) };
    }
    case "fav": {
      const u = need();
      if (body.on) await sql`insert into flatbot.favorites (chat_id, key) values (${u.id}, ${body.key}) on conflict do nothing`;
      else await sql`delete from flatbot.favorites where chat_id = ${u.id} and key = ${body.key}`;
      await logEvent(u.id, body.on ? "fav_add" : "fav_remove", { key: body.key });
      return { ok: true };
    }
    case "hide": {
      const u = need();
      if (body.on === false) await sql`delete from flatbot.hidden where chat_id = ${u.id} and key = ${body.key}`;
      else await sql`insert into flatbot.hidden (chat_id, key) values (${u.id}, ${body.key}) on conflict do nothing`;
      await logEvent(u.id, body.on === false ? "unhide" : "hide", { key: body.key });
      return { ok: true };
    }
    case "favorites": {
      const u = need();
      const items = await sql`
        with ${MEDIANS}
        select ${COMPACT}, true as fav, v.created_at as faved_at
        from flatbot.favorites v join flatbot.listings l on l.key = v.key
        left join med_d md on md.kind = l.kind and md.city is not distinct from l.city
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
      await logEvent(u.id, "remind_add", { key: body.key ?? null, at: at.toISOString(), note: String(body.note ?? "").slice(0, 80) });
      return { ok: true, id: r.id };
    }
    case "remind_del": {
      const u = need();
      await sql`delete from flatbot.reminders where chat_id = ${u.id} and id = ${Number(body.id)}`;
      await logEvent(u.id, "remind_del", { id: Number(body.id) });
      return { ok: true };
    }
    case "notify_test": {
      const u = need();
      const [row] = await sql`select settings from flatbot.subscribers where chat_id = ${u.id}`;
      const { sendSetup } = await import("./notify.ts");
      await sendSetup(u.id, settingsOf(row?.settings), "test");
      await logEvent(u.id, "notify_test");
      return { ok: true };
    }
    case "pay": {
      const u = need();
      const { payLink, validEmail } = await import("./stripe.ts");
      if (body.email != null) {
        if (!validEmail(body.email)) return { error: "bad_email" };
        await sql`update flatbot.subscribers set email = ${String(body.email).trim().toLowerCase()} where chat_id = ${u.id}`;
      }
      return { url: await payLink(u.id) };
    }
    case "sub_check": {
      const u = need();
      const { syncSubscription } = await import("./stripe.ts");
      return { access: await syncSubscription(u.id) };
    }
    case "access": {
      const u = need();
      const { accessOf } = await import("./stripe.ts");
      return { access: await accessOf(u.id) };
    }
    case "admin_comp": {
      const u = need();
      if (!(await isAdmin(u.id))) throw new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
      await sql`update flatbot.subscribers set comp = ${!!body.on} where chat_id = ${Number(body.id)}`;
      await logEvent(Number(body.id), body.on ? "comp_on" : "comp_off", { by: u.id });
      return { ok: true };
    }
    case "admin_overview":
    case "admin_users":
    case "admin_user":
    case "admin_events": {
      const u = need();
      if (!(await isAdmin(u.id))) throw new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
      const A = await import("./admin.ts");
      if (body.op === "admin_overview") return A.adminOverview();
      if (body.op === "admin_users") return A.adminUsers();
      if (body.op === "admin_user") return A.adminUser(Number(body.id));
      return A.adminEvents(body);
    }
    default:
      return { error: "unknown_op" };
  }
}
