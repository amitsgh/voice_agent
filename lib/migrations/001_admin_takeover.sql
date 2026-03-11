-- Run this once in your Supabase SQL editor (or psql)
-- Creates tables needed for human takeover relay

CREATE TABLE IF NOT EXISTS admin_takeovers (
  conversation_id TEXT PRIMARY KEY,
  is_active       BOOLEAN NOT NULL DEFAULT FALSE,
  activated_by    TEXT    DEFAULT 'John',
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_messages (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id TEXT        NOT NULL,
  sender          TEXT        NOT NULL DEFAULT 'John',
  text            TEXT        NOT NULL,
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS admin_messages_conv_time
  ON admin_messages (conversation_id, sent_at);
