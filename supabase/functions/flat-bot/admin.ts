// Админ-панель: пользователи, их настройки и действия. Доступ только у chat_id из flatbot.meta.admins.
import { settingsOf, sql } from "./db.ts";

export async function adminOverview() {
  const [[k], perDay, types] = await Promise.all([
    sql`select
        (select count(*)::int from flatbot.subscribers where chat_id <> 1000001) as users,
        (select count(*)::int from flatbot.subscribers where active and chat_id <> 1000001) as active,
        (select count(*)::int from flatbot.subscribers where onboarded and chat_id <> 1000001) as onboarded,
        (select count(*)::int from flatbot.subscribers where created_at > now() - interval '24 hours') as new24,
        (select count(distinct chat_id)::int from flatbot.events where created_at > now() - interval '24 hours'
           and type not in ('notified', 'digest', 'reminder_sent')) as dau,
        (select count(distinct chat_id)::int from flatbot.events where created_at > now() - interval '7 days'
           and type not in ('notified', 'digest', 'reminder_sent')) as wau,
        (select count(*)::int from flatbot.events where type = 'notified' and created_at > now() - interval '24 hours') as notified24,
        (select count(*)::int from flatbot.listings where first_seen > now() - interval '24 hours' and not seeded) as listings24`,
    sql`select (created_at at time zone 'Europe/Bratislava')::date as day,
          count(distinct chat_id) filter (where type not in ('notified', 'digest', 'reminder_sent'))::int as users,
          count(*) filter (where type = 'notified')::int as notified
        from flatbot.events where created_at > now() - interval '14 days' group by 1 order by 1`,
    sql`select type, count(*)::int as n from flatbot.events where created_at > now() - interval '7 days'
        group by type order by n desc`,
  ]);
  return { kpi: k, perDay, types };
}

export async function adminUsers() {
  const users = await sql`
    select s.chat_id, s.name, s.username, s.active, s.onboarded, s.created_at, s.last_seen_at, s.settings,
      (select count(*)::int from flatbot.favorites f where f.chat_id = s.chat_id) as favs,
      (select count(*)::int from flatbot.reminders r where r.chat_id = s.chat_id and not r.sent) as reminders,
      (select count(*)::int from flatbot.events e where e.chat_id = s.chat_id and e.type = 'notified') as notified,
      (select count(*)::int from flatbot.events e where e.chat_id = s.chat_id and e.type = 'view') as views
    from flatbot.subscribers s where s.chat_id <> 1000001
    order by coalesce(s.last_seen_at, s.created_at) desc`;
  return { users: users.map((u: any) => ({ ...u, settings: settingsOf(u.settings) })) };
}

export async function adminUser(chat: number) {
  const [user] = (await adminUsers()).users.filter((u: any) => Number(u.chat_id) === chat);
  const events = await sql`
    select e.id, e.type, e.data, e.created_at, l.data->>'title' as title
    from flatbot.events e left join flatbot.listings l on l.key = e.data->>'key'
    where e.chat_id = ${chat} order by e.created_at desc limit 200`;
  return { user, events };
}

export async function adminEvents(body: any) {
  const type = typeof body.type === "string" && body.type ? body.type : null;
  const before = Number(body.before) || null;
  const events = await sql`
    select e.id, e.chat_id, e.type, e.data, e.created_at, s.name, s.username, l.data->>'title' as title
    from flatbot.events e
    left join flatbot.subscribers s on s.chat_id = e.chat_id
    left join flatbot.listings l on l.key = e.data->>'key'
    where e.chat_id <> 1000001
      ${type ? sql`and e.type = ${type}` : sql``}
      ${body.hideSystem ? sql`and e.type not in ('notified', 'digest', 'reminder_sent')` : sql``}
      ${before ? sql`and e.id < ${before}` : sql``}
    order by e.id desc limit 80`;
  return { events };
}
