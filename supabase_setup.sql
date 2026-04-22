-- ================================================================
-- LeagueMan — Self-Hosted Supabase Setup Script
--
-- Run this entire script once in your Supabase SQL Editor:
--   Dashboard → SQL Editor → New query → paste → Run (F5)
--
-- All tables use "if not exists" so it is safe to re-run.
-- ================================================================


-- ── Config  (league settings, stored as key/value pairs) ──────
create table if not exists config (
  id        bigserial    primary key,
  league_id text         not null,
  key       text         not null,
  value     text
);
create index if not exists config_league_id on config (league_id);


-- ── Players ───────────────────────────────────────────────────
create table if not exists players (
  league_id           text    not null,
  name                text    not null,
  pin                 text,
  "group"             text    default 'M',
  active              text    default 'false',   -- 'true' | 'false' | 'pend'
  email               text,
  notify              boolean default false,
  can_score           boolean default false,
  initial_rank        numeric,
  role                text,
  avtoken             text,
  photo               text,                      -- base64 JPEG, stored as text
  full_name           text,
  phone               text,
  share_contact       boolean default false,
  player1_full_name   text,
  player2_full_name   text,
  stripe_paid         boolean default false,
  stripe_ref          text,
  stripe_payment_date text,
  primary key (league_id, name)
);


-- ── Attendance ────────────────────────────────────────────────
create table if not exists attendance (
  league_id text    not null,
  player    text    not null,
  week      integer not null,
  status    text    default 'tbd',               -- 'present' | 'absent' | 'tbd'
  primary key (league_id, player, week)
);


-- ── Pairings  (court assignments per week/round) ───────────────
create table if not exists pairings (
  id        bigserial primary key,
  league_id text      not null,
  week      integer   not null,
  round     integer,
  court     integer,
  p1        text,
  p2        text,
  p3        text,
  p4        text,
  type      text      default 'game'             -- 'game' | 'sit'
);
create index if not exists pairings_league_week on pairings (league_id, week);


-- ── Scores ────────────────────────────────────────────────────
create table if not exists scores (
  id        bigserial primary key,
  league_id text      not null,
  week      integer   not null,
  round     integer,
  court     integer,
  p1        text,
  p2        text,
  score1    integer,
  p3        text,
  p4        text,
  score2    integer
);
create index if not exists scores_league_week on scores (league_id, week);


-- ── Queue  (rotation queue for court assignment) ──────────────
create table if not exists queue (
  league_id   text    not null,
  week        integer not null,
  player      text    not null,
  wait_weight numeric default 0,
  stay_games  integer default 0,
  primary key (league_id, week, player)
);


-- ── Challenges ────────────────────────────────────────────────
create table if not exists challenges (
  id                 text        primary key,
  league_id          text        not null,
  challenger         text,
  partner            text,
  opponent1          text,
  opponent2          text,
  format             text        default 'doubles',
  status             text        default 'pending',
  partner_response   text,
  opponent1_response text,
  opponent2_response text,
  week_scheduled     text,
  created_at         timestamptz default now()
);
create index if not exists challenges_league_id on challenges (league_id);


-- ── Chat ──────────────────────────────────────────────────────
create table if not exists chat (
  id         bigserial   primary key,
  league_id  text        not null,
  sender     text,
  recipient  text,
  message    text,
  created_at timestamptz default now()
);
create index if not exists chat_league_id on chat (league_id);


-- ── Timers  (countdown timer state) ──────────────────────────
create table if not exists timers (
  league_id text primary key,
  data      text
);


-- ── Push Subscriptions  (web-push endpoints) ──────────────────
create table if not exists push_subscriptions (
  league_id text not null,
  player    text,
  endpoint  text not null,
  p256dh    text,
  auth      text,
  primary key (league_id, endpoint)
);


-- ── Score Audit Log  (data-loss protection) ───────────────────
create table if not exists score_audit_log (
  id          bigserial   primary key,
  league_id   text,
  week        integer,
  action      text,
  rows_before integer,
  rows_after  integer,
  lost_scores text,
  details     text,
  created_at  timestamptz default now()
);


-- ================================================================
-- Done!  All 11 tables are ready.
-- Return to the LeagueMan admin panel and click "Validate & Save".
-- ================================================================
