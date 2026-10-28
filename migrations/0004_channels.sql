-- 渠道定向：appstore / ipa / apk / googleplay；空 = 全渠道
-- 本地：npx wrangler d1 execute voxpop --local --file=./migrations/0004_channels.sql
ALTER TABLE polls ADD COLUMN channels TEXT NOT NULL DEFAULT '';
