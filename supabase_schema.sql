-- ============================================================
-- LeagueMan — Supabase Schema
--
-- Run this in the Supabase SQL Editor to create all tables
-- needed for leagues stored in Supabase (storage = 'supabase').
--
-- All tables are league-scoped via league_id TEXT.
-- Row-Level Security is disabled — access is controlled by
-- GAS using the service role key (stored in Script Properties).
-- ============================================================

-- ── Config ────────────────────────────────────────────────────
-- Key/value config store (replaces the Config sheet tab).
CREATE TABLE IF NOT EXISTS config (
  league_id  TEXT    NOT NULL,
  key        TEXT    NOT NULL,
  value      TEXT    NOT NULL DEFAULT '',
  PRIMARY KEY (league_id, key)
);

-- ── Players ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS players (
  league_id    TEXT    NOT NULL,
  name         TEXT    NOT NULL,
  pin          TEXT    NOT NULL DEFAULT '',
  "group"      TEXT    NOT NULL DEFAULT 'M',
  active       TEXT    NOT NULL DEFAULT 'true',  -- 'true' | 'false' | 'pend'
  email        TEXT    NOT NULL DEFAULT '',
  notify       BOOLEAN NOT NULL DEFAULT FALSE,
  can_score    BOOLEAN NOT NULL DEFAULT FALSE,
  initial_rank INTEGER,
  role         TEXT,                              -- 'admin' | NULL
  avtoken      TEXT    NOT NULL DEFAULT '',
  photo        TEXT    NOT NULL DEFAULT '',       -- base64 data URI or URL
  full_name           TEXT    NOT NULL DEFAULT '',
  phone               TEXT    NOT NULL DEFAULT '',
  share_contact       BOOLEAN NOT NULL DEFAULT FALSE,
  stripe_paid         BOOLEAN NOT NULL DEFAULT FALSE,
  stripe_ref          TEXT    NOT NULL DEFAULT '',
  stripe_payment_date TEXT    NOT NULL DEFAULT '',
  PRIMARY KEY (league_id, name)
);

-- ── Attendance ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS attendance (
  league_id  TEXT    NOT NULL,
  player     TEXT    NOT NULL,
  week       INTEGER NOT NULL,
  status     TEXT    NOT NULL DEFAULT 'tbd',  -- 'in' | 'out' | 'maybe' | 'tbd'
  PRIMARY KEY (league_id, player, week)
);

-- ── Pairings ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pairings (
  id         BIGSERIAL PRIMARY KEY,
  league_id  TEXT    NOT NULL,
  week       INTEGER NOT NULL,
  round      INTEGER NOT NULL,
  court      TEXT    NOT NULL,  -- TEXT not INTEGER: bye rows use court='bye'
  p1         TEXT    NOT NULL DEFAULT '',
  p2         TEXT    NOT NULL DEFAULT '',
  p3         TEXT    NOT NULL DEFAULT '',
  p4         TEXT    NOT NULL DEFAULT '',
  type       TEXT    NOT NULL DEFAULT 'game'  -- 'game' | 'bye' | 'practice'
);

CREATE INDEX IF NOT EXISTS pairings_league_week ON pairings (league_id, week);

-- ── Scores ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scores (
  id         BIGSERIAL PRIMARY KEY,
  league_id  TEXT    NOT NULL,
  week       INTEGER NOT NULL,
  round      INTEGER NOT NULL,
  court      INTEGER NOT NULL,
  p1         TEXT    NOT NULL DEFAULT '',
  p2         TEXT    NOT NULL DEFAULT '',
  score1     INTEGER,
  p3         TEXT    NOT NULL DEFAULT '',
  p4         TEXT    NOT NULL DEFAULT '',
  score2     INTEGER
);

CREATE INDEX IF NOT EXISTS scores_league_week ON scores (league_id, week);

-- ── Score audit log (data-loss protection) ────────────────────
CREATE TABLE IF NOT EXISTS score_audit_log (
  id          BIGSERIAL PRIMARY KEY,
  league_id   TEXT    NOT NULL,
  week        INTEGER NOT NULL,
  action      TEXT    NOT NULL,       -- 'RESCUED'
  rows_before INTEGER,
  rows_after  INTEGER,
  lost_scores TEXT,
  details     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Queue ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS queue (
  id          BIGSERIAL PRIMARY KEY,
  league_id   TEXT    NOT NULL,
  week        INTEGER NOT NULL,
  player      TEXT    NOT NULL,
  wait_weight NUMERIC NOT NULL DEFAULT 0,
  stay_games  INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS queue_league_week ON queue (league_id, week);

-- ── Timers ────────────────────────────────────────────────────
-- One row per league; data is a JSON blob.
CREATE TABLE IF NOT EXISTS timers (
  league_id  TEXT    PRIMARY KEY,
  data       JSONB
);

-- ── Push Subscriptions ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS push_subscriptions (
  league_id  TEXT    NOT NULL,
  player     TEXT    NOT NULL DEFAULT '',
  endpoint   TEXT    NOT NULL,
  p256dh     TEXT    NOT NULL DEFAULT '',
  auth       TEXT    NOT NULL DEFAULT '',
  PRIMARY KEY (league_id, endpoint)
);

-- ── Challenges ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS challenges (
  id                  TEXT    PRIMARY KEY,   -- generated timestamp+random in GAS
  league_id           TEXT    NOT NULL,
  challenger          TEXT    NOT NULL DEFAULT '',
  partner             TEXT    NOT NULL DEFAULT '',
  opponent1           TEXT    NOT NULL DEFAULT '',
  opponent2           TEXT    NOT NULL DEFAULT '',
  format              TEXT    NOT NULL DEFAULT 'doubles',  -- 'singles' | 'doubles'
  status              TEXT    NOT NULL DEFAULT 'pending',  -- 'pending' | 'accepted' | 'rejected' | 'scheduled' | 'scored'
  partner_response    TEXT    NOT NULL DEFAULT '',         -- 'pending' | 'accepted' | 'rejected' | ''
  opponent1_response  TEXT    NOT NULL DEFAULT '',
  opponent2_response  TEXT    NOT NULL DEFAULT '',
  week_scheduled      TEXT    NOT NULL DEFAULT '',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS challenges_league ON challenges (league_id, created_at);

-- ── Chat ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat (
  id          BIGSERIAL PRIMARY KEY,
  league_id   TEXT    NOT NULL,
  sender      TEXT    NOT NULL DEFAULT '',
  recipient   TEXT    NOT NULL DEFAULT '',   -- '' = broadcast
  message     TEXT    NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS chat_league_id ON chat (league_id, id);

-- ============================================================
-- Row Level Security
-- Disabled — GAS accesses via the service role key which
-- bypasses RLS entirely. Enable and add policies here if you
-- ever expose these tables to the Supabase client-side SDK.
-- ============================================================
ALTER TABLE config              DISABLE ROW LEVEL SECURITY;
ALTER TABLE players             DISABLE ROW LEVEL SECURITY;
ALTER TABLE attendance          DISABLE ROW LEVEL SECURITY;
ALTER TABLE pairings            DISABLE ROW LEVEL SECURITY;
ALTER TABLE scores              DISABLE ROW LEVEL SECURITY;
ALTER TABLE score_audit_log     DISABLE ROW LEVEL SECURITY;
ALTER TABLE queue               DISABLE ROW LEVEL SECURITY;
ALTER TABLE timers              DISABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions  DISABLE ROW LEVEL SECURITY;
ALTER TABLE challenges          DISABLE ROW LEVEL SECURITY;
ALTER TABLE chat                DISABLE ROW LEVEL SECURITY;
