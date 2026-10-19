-- Схема бота в Supabase (применена в проекте через миграцию flatbot_init + flatbot_cron).
-- Хранится здесь для истории; секреты генерируются в базе и в репозиторий не попадают.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create schema if not exists flatbot;
revoke all on schema flatbot from public, anon, authenticated;

create table flatbot.subscribers (
  chat_id bigint primary key,
  name text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table flatbot.listings (
  key text primary key,
  source text not null,
  data jsonb not null,
  published date,
  fits boolean not null,
  seeded boolean not null default false,
  first_seen timestamptz not null default now()
);
create table flatbot.meta (k text primary key, v jsonb not null);

insert into flatbot.meta (k, v) values
  ('cron_secret', to_jsonb(encode(extensions.gen_random_bytes(24), 'hex'))),
  ('webhook_secret', to_jsonb(encode(extensions.gen_random_bytes(24), 'hex')));

-- проверка сайтов каждые 10 минут
select cron.schedule('flatbot-check', '*/10 * * * *', $$
  select net.http_post(
    url := 'https://nnkhlnzjkwtcjvzyubzc.supabase.co/functions/v1/flat-bot?action=check',
    headers := jsonb_build_object('x-cron-secret', (select v #>> '{}' from flatbot.meta where k = 'cron_secret')),
    timeout_milliseconds := 150000
  );
$$);

-- v2: мини-приложение (миграции flatbot_v2_app и flatbot_cron_v2)
alter table flatbot.listings
  add column kind text, add column district text, add column agency boolean,
  add column price int, add column total int, add column area numeric,
  add column lat double precision, add column lng double precision,
  add column has_phone boolean not null default false, add column has_photo boolean not null default false,
  add column posted_at timestamptz not null default now(), add column detailed boolean not null default false,
  add column last_seen timestamptz not null default now();
alter table flatbot.subscribers
  add column settings jsonb not null default '{}'::jsonb, add column onboarded boolean not null default false,
  add column last_digest_at timestamptz, add column username text;
create table flatbot.favorites (chat_id bigint references flatbot.subscribers on delete cascade, key text, created_at timestamptz default now(), primary key (chat_id, key));
create table flatbot.hidden (chat_id bigint references flatbot.subscribers on delete cascade, key text, primary key (chat_id, key));
create table flatbot.reminders (id bigserial primary key, chat_id bigint not null references flatbot.subscribers on delete cascade,
  key text, note text, remind_at timestamptz not null, sent boolean not null default false, created_at timestamptz not null default now());
create table flatbot.queue (chat_id bigint references flatbot.subscribers on delete cascade, key text, created_at timestamptz default now(), primary key (chat_id, key));

select cron.schedule('flatbot-tick', '* * * * *', $$ select net.http_post(
  url := 'https://nnkhlnzjkwtcjvzyubzc.supabase.co/functions/v1/flat-bot?action=tick',
  headers := jsonb_build_object('x-cron-secret', (select v #>> '{}' from flatbot.meta where k = 'cron_secret')),
  timeout_milliseconds := 60000); $$);
select cron.schedule('flatbot-backfill', '30 3 * * *', $$ select net.http_post(
  url := 'https://nnkhlnzjkwtcjvzyubzc.supabase.co/functions/v1/flat-bot?action=backfill&src=' || src,
  headers := jsonb_build_object('x-cron-secret', (select v #>> '{}' from flatbot.meta where k = 'cron_secret')),
  timeout_milliseconds := 150000) from unnest(array['bazos', 'nehnutelnosti', 'topreality', 'bezrealitky']) as src; $$);
select cron.schedule('flatbot-net-cleanup', '15 4 * * *', $$ delete from net._http_response where created < now() - interval '1 day'; $$);
