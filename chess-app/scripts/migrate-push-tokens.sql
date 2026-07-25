-- S11.1: tabla para tokens de notificaciones push por usuario
CREATE TABLE IF NOT EXISTS push_tokens (
  user_id    UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  token      TEXT        NOT NULL,
  platform   TEXT        NOT NULL CHECK (platform IN ('ios', 'android')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own push token"
  ON push_tokens FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
