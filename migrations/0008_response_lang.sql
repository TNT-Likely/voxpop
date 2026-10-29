-- 答卷记录作答时的界面语言（zh/en），用于语言维度统计
ALTER TABLE responses ADD COLUMN lang TEXT NOT NULL DEFAULT '';
