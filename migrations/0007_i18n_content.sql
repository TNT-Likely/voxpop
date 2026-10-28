-- 多语言问卷本体：标题/描述/题目/选项的可选英文翻译（留空回退中文）
ALTER TABLE polls ADD COLUMN title_en TEXT NOT NULL DEFAULT '';
ALTER TABLE polls ADD COLUMN description_en TEXT NOT NULL DEFAULT '';
ALTER TABLE questions ADD COLUMN title_en TEXT NOT NULL DEFAULT '';
ALTER TABLE options ADD COLUMN label_en TEXT NOT NULL DEFAULT '';
