-- 事件日聚合表：Cron 每日把 events 明细按天聚合写入，180 天后清理原始行
-- 本地：npx wrangler d1 execute voxpop --local --file=./migrations/0002_event_daily.sql
-- 远端：npm run db:remote2（或直接 wrangler d1 execute voxpop --remote --file=...）

CREATE TABLE IF NOT EXISTS event_daily (
  day      TEXT NOT NULL,             -- YYYY-MM-DD（UTC）
  poll_id  TEXT NOT NULL DEFAULT '',
  type     TEXT NOT NULL,             -- pageview / respond
  country  TEXT NOT NULL DEFAULT '',
  device   TEXT NOT NULL DEFAULT '',
  browser  TEXT NOT NULL DEFAULT '',
  os       TEXT NOT NULL DEFAULT '',
  pv       INTEGER NOT NULL DEFAULT 0,
  uv       INTEGER NOT NULL DEFAULT 0, -- COUNT(DISTINCT visitor_id)
  PRIMARY KEY (day, poll_id, type, country, device, browser, os)
);
CREATE INDEX IF NOT EXISTS idx_event_daily_poll_day ON event_daily(poll_id, day);
