-- ==========================================
-- HANGOUT PRO - SUPABASE SCHEMA (FIXED)
-- ==========================================
-- 1. Run this in your Supabase SQL Editor
-- 2. Ensure "Realtime" is enabled for all tables listed below
-- ==========================================

-- EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- MESSAGES TABLE (With real-time and cleanup logic)
CREATE TABLE IF NOT EXISTS public.messages (
  id text PRIMARY KEY,
  sender text NOT NULL,
  content text,
  image text,
  type text CHECK (type IN ('text', 'image', 'voice')),
  timestamp bigint NOT NULL,
  "expiresAt" bigint NOT NULL,
  reactions jsonb DEFAULT '{}'::jsonb
);

-- Index for performance on expiry checks
CREATE INDEX IF NOT EXISTS idx_messages_expiry ON public.messages ("expiresAt");
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON public.messages (timestamp DESC);

-- SYNC STATE (Persistence for Music/Theme/Accents)
-- FIXED: Now properly stores music position and state
CREATE TABLE IF NOT EXISTS public.sync_state (
  key text PRIMARY KEY,
  data jsonb NOT NULL,
  updated_at timestamp WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Index for faster sync state queries
CREATE INDEX IF NOT EXISTS idx_sync_state_updated ON public.sync_state (updated_at DESC);

-- PRESENCE (Real-time Online Status)
CREATE TABLE IF NOT EXISTS public.presence (
  user_id text PRIMARY KEY,
  is_online boolean DEFAULT false,
  status text DEFAULT 'offline', -- 'online', 'away', 'offline'
  last_seen bigint,
  mood text,
  updated_at timestamp WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- CANVAS STROKES (Persistence for Multi-user Drawing)
CREATE TABLE IF NOT EXISTS public.canvas_strokes (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  type text NOT NULL, -- 'draw', 'stamp', 'clear'
  user_id text NOT NULL,
  data jsonb NOT NULL, -- Contains coordinates, color, size
  timestamp bigint NOT NULL
);

-- Index for faster canvas queries
CREATE INDEX IF NOT EXISTS idx_canvas_timestamp ON public.canvas_strokes (timestamp DESC);

-- NOTIFICATIONS (Used for "Miss You" signals and persistence)
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  sender text NOT NULL,
  recipient text NOT NULL,
  type text NOT NULL,
  content text,
  timestamp bigint NOT NULL,
  read boolean DEFAULT false
);

-- SHAKE EVENTS (NEW - For shake feature)
CREATE TABLE IF NOT EXISTS public.shake_events (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  sender text NOT NULL,
  recipient text NOT NULL,
  timestamp bigint NOT NULL,
  acknowledged boolean DEFAULT false
);

-- Index for faster shake queries
CREATE INDEX IF NOT EXISTS idx_shake_timestamp ON public.shake_events (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_shake_recipient ON public.shake_events (recipient, acknowledged);

-- SCORES (Arcade Scoreboard - Resets every 24h)
CREATE TABLE IF NOT EXISTS public.scores (
  user_id text PRIMARY KEY,
  score int DEFAULT 0,
  updated_at bigint NOT NULL
);

-- ==========================================
-- ROW LEVEL SECURITY (RLS) - PUBLIC ACCESS
-- ==========================================
-- These policies allow the app to work without complex auth for your private use.

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public Access" ON public.messages;
CREATE POLICY "Public Access" ON public.messages FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.sync_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public Access" ON public.sync_state;
CREATE POLICY "Public Access" ON public.sync_state FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.presence ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public Access" ON public.presence;
CREATE POLICY "Public Access" ON public.presence FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public Access" ON public.notifications;
CREATE POLICY "Public Access" ON public.notifications FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.shake_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public Access" ON public.shake_events;
CREATE POLICY "Public Access" ON public.shake_events FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.scores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public Access" ON public.scores;
CREATE POLICY "Public Access" ON public.scores FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.canvas_strokes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public Access" ON public.canvas_strokes;
CREATE POLICY "Public Access" ON public.canvas_strokes FOR ALL USING (true) WITH CHECK (true);

-- ==========================================
-- AUTOMATED CLEANUP (The Cron part)
-- ==========================================
-- Logic:
-- 1. Keep a safety buffer of 50 messages.
-- 2. Delete messages older than 24 hours.
-- 3. Trim total messages to 100,000 for performance.
-- 4. Auto-reset scores and notifications.
-- 5. Clean up old shake events.

CREATE OR REPLACE FUNCTION clean_expired_data() 
RETURNS TRIGGER AS $$
DECLARE
  twenty_four_hours_ago bigint;
BEGIN
  twenty_four_hours_ago := (EXTRACT(EPOCH FROM NOW()) * 1000) - (24 * 60 * 60 * 1000);

  -- 1. Delete messages older than 24h (except the last 50 safety buffer)
  DELETE FROM public.messages 
  WHERE timestamp < twenty_four_hours_ago
  AND id NOT IN (
    SELECT id FROM public.messages 
    ORDER BY timestamp DESC 
    LIMIT 50
  );

  -- 2. Limit total capacity to 100,000 messages
  DELETE FROM public.messages 
  WHERE id NOT IN (
    SELECT id FROM public.messages 
    ORDER BY timestamp DESC 
    LIMIT 100000
  );
  
  -- 3. Delete notifications older than 48 hours
  DELETE FROM public.notifications 
  WHERE timestamp < ((EXTRACT(EPOCH FROM NOW()) * 1000) - (48 * 60 * 60 * 1000));
  
  -- 4. Delete shake events older than 24 hours
  DELETE FROM public.shake_events 
  WHERE timestamp < ((EXTRACT(EPOCH FROM NOW()) * 1000) - (24 * 60 * 60 * 1000));
  
  -- 5. Reset scores older than 24 hours
  UPDATE public.scores SET score = 0, updated_at = (EXTRACT(EPOCH FROM NOW()) * 1000) 
  WHERE updated_at < ((EXTRACT(EPOCH FROM NOW()) * 1000) - (24 * 60 * 60 * 1000));
  
  -- 6. Cleanup old canvas strokes (older than 7 days to keep it clean)
  DELETE FROM public.canvas_strokes 
  WHERE timestamp < ((EXTRACT(EPOCH FROM NOW()) * 1000) - (7 * 24 * 60 * 60 * 1000));
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers to run cleanup on every new message or notification
DROP TRIGGER IF EXISTS tr_clean_expired ON public.messages;
CREATE TRIGGER tr_clean_expired
  AFTER INSERT ON public.messages
  FOR EACH STATEMENT
  EXECUTE FUNCTION clean_expired_data();

DROP TRIGGER IF EXISTS tr_clean_expired_notif ON public.notifications;
CREATE TRIGGER tr_clean_expired_notif
  AFTER INSERT ON public.notifications
  FOR EACH STATEMENT
  EXECUTE FUNCTION clean_expired_data();

-- ==========================================
-- ENABLE REALTIME
-- ==========================================
-- Ensures Supabase broadcasts changes to the frontend instantly.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

DO $$
DECLARE
  table_list text[] := ARRAY['messages', 'presence', 'sync_state', 'scores', 'notifications', 'canvas_strokes', 'shake_events'];
  t text;
BEGIN
  FOREACH t IN ARRAY table_list
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
