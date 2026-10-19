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
