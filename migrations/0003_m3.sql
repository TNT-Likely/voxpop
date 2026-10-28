-- M3：主题色、可见性、自助建票创建者限流
-- 本地：npx wrangler d1 execute voxpop --local --file=./migrations/0003_m3.sql
-- 远端：npm run db:remote

ALTER TABLE polls ADD COLUMN accent TEXT NOT NULL DEFAULT '';
ALTER TABLE polls ADD COLUMN visibility TEXT NOT NULL DEFAULT 'listed';
ALTER TABLE polls ADD COLUMN creator_hash TEXT NOT NULL DEFAULT '';
