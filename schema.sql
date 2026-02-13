-- ==========================================
-- HANGOUT PRO - SUPABASE SCHEMA
-- ==========================================
-- 1. Run this in your Supabase SQL Editor
-- 2. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to Vercel Env Vars

-- EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- MESSAGES TABLE (With 48h Expiry Logic)
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

-- SYNC STATE (Persistence for Music/Theme)
CREATE TABLE IF NOT EXISTS public.sync_state (
  key text PRIMARY KEY,
  data jsonb NOT NULL,
  updated_at timestamp WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- PRESENCE (Real-time Online Status)
CREATE TABLE IF NOT EXISTS public.presence (
  user_id text PRIMARY KEY,
  is_online boolean DEFAULT false,
  last_seen bigint,
  mood text
);

-- NOTIFICATIONS (Used for "Miss You" signals)
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  sender text NOT NULL,
  recipient text NOT NULL,
  type text NOT NULL,
  timestamp bigint NOT NULL,
  read boolean DEFAULT false
);

-- ==========================================
-- ROW LEVEL SECURITY (RLS) - Public Setup
-- ==========================================
-- We enable RLS and allow all actions for simplicity in this private app.
-- In a public app, you would restrict this to authenticated users.

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

-- ==========================================
-- AUTOMATED CLEANUP (The Cron part)
-- ==========================================
-- Note: Supabase free tier doesn't support pg_cron easily without extensions.
-- Most reliable way for free tier: Trigger on EVERY INSERT to clean up old stuff.

CREATE OR REPLACE FUNCTION clean_expired_data() 
RETURNS TRIGGER AS $$
BEGIN
  -- Delete messages older than current time
  DELETE FROM public.messages WHERE "expiresAt" < (EXTRACT(EPOCH FROM NOW()) * 1000);
  
  -- Delete notifications older than 48 hours
  DELETE FROM public.notifications WHERE timestamp < ((EXTRACT(EPOCH FROM NOW()) * 1000) - (48 * 60 * 60 * 1000));
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach trigger to messages table (runs on every new message)
DROP TRIGGER IF EXISTS tr_clean_expired ON public.messages;
CREATE TRIGGER tr_clean_expired
  AFTER INSERT ON public.messages
  FOR EACH STATEMENT
  EXECUTE FUNCTION clean_expired_data();

-- ==========================================
-- ENABLE REALTIME
-- ==========================================
-- IMPORTANT: Run these to make sure sync works!
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.presence;
alter publication supabase_realtime add table public.sync_state;

-- VERCEL DEPLOYMENT NOTES
-- ==========================================
-- Add these to Vercel Environment Variables:
-- VITE_SUPABASE_URL = [Your Project URL]
-- VITE_SUPABASE_ANON_KEY = [Your Anon Key]
