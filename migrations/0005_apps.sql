-- 应用定向：与渠道正交的自定义应用标签（beecount / panwatch / ...）；空 = 通用
ALTER TABLE polls ADD COLUMN apps TEXT NOT NULL DEFAULT '';
