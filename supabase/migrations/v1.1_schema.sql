-- v1.1 schema additions

-- Add buyer context columns to sparring_sessions
ALTER TABLE sparring_sessions
  ADD COLUMN IF NOT EXISTS buyer_persona TEXT,
  ADD COLUMN IF NOT EXISTS difficulty TEXT,
  ADD COLUMN IF NOT EXISTS scenario_type TEXT;

-- Objection gym drill sessions
CREATE TABLE IF NOT EXISTS drill_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  category TEXT NOT NULL,
  rounds JSONB NOT NULL DEFAULT '[]',
  avg_score INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE drill_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own drill sessions"
  ON drill_sessions FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own drill sessions"
  ON drill_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);

-- User profiles (script/pitch storage)
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  script_text TEXT
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profile"
  ON user_profiles FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can upsert own profile"
  ON user_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE USING (auth.uid() = user_id);
