-- 标签注册表：应用与渠道的 slug + 显示名，后台维护；建卷时勾选而非手填
CREATE TABLE IF NOT EXISTS registry (
  kind       TEXT NOT NULL CHECK (kind IN ('app', 'channel')),
  slug       TEXT NOT NULL,
  name       TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (kind, slug)
);
-- 预设（可删）
INSERT OR IGNORE INTO registry (kind, slug, name, created_at) VALUES
  ('app', 'beecount', 'BeeCount', strftime('%s', 'now')),
  ('app', 'panwatch', 'Panwatch', strftime('%s', 'now')),
  ('channel', 'appstore', 'App Store', strftime('%s', 'now')),
  ('channel', 'ipa', 'IPA（自签）', strftime('%s', 'now')),
  ('channel', 'apk', 'APK（直装）', strftime('%s', 'now')),
  ('channel', 'googleplay', 'Google Play', strftime('%s', 'now'));
