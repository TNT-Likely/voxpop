-- 众声 VoxPop 初始表结构（六表）
-- 本地：npm run db:local   远端：npm run db:remote

PRAGMA foreign_keys = ON;

-- 问卷/投票
CREATE TABLE polls (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  dedup_mode    TEXT NOT NULL DEFAULT 'device' CHECK (dedup_mode IN ('device', 'ip', 'open')),
  result_policy TEXT NOT NULL DEFAULT 'after_vote' CHECK (result_policy IN ('always', 'after_vote', 'after_close')),
  status        TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'open', 'closed')),
  close_at      INTEGER,
  extra_keys    TEXT NOT NULL DEFAULT '',
  created_at    INTEGER NOT NULL,
  closed_at     INTEGER
);

-- 题目
CREATE TABLE questions (
  id          TEXT PRIMARY KEY,
  poll_id     TEXT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN ('single', 'multi', 'cascade', 'text')),
  title       TEXT NOT NULL,
  required    INTEGER NOT NULL DEFAULT 1,
  max_choices INTEGER NOT NULL DEFAULT 1,
  max_len     INTEGER NOT NULL DEFAULT 200,
  sort        INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_questions_poll ON questions(poll_id, sort);

-- 选项（parent_id 构成级联树）
CREATE TABLE options (
  id          TEXT PRIMARY KEY,
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  parent_id   TEXT REFERENCES options(id) ON DELETE CASCADE,
  label       TEXT NOT NULL,
  sort        INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_options_question ON options(question_id, sort);

-- 答卷（每设备每问卷一份，防重唯一约束在这里）
CREATE TABLE responses (
  id         TEXT PRIMARY KEY,
  poll_id    TEXT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  voter_hash TEXT NOT NULL,
  country    TEXT NOT NULL DEFAULT '',
  device     TEXT NOT NULL DEFAULT '',
  browser    TEXT NOT NULL DEFAULT '',
  os         TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  UNIQUE (poll_id, voter_hash)
);
CREATE INDEX idx_responses_poll ON responses(poll_id);
CREATE INDEX idx_responses_time ON responses(created_at);

-- 答案（选择题为 option_id，文本题为 text_value；级联存叶子选项，路径由树回溯）
CREATE TABLE answers (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  response_id TEXT NOT NULL REFERENCES responses(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  option_id   TEXT REFERENCES options(id) ON DELETE CASCADE,
  text_value  TEXT,
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_answers_response ON answers(response_id);
CREATE INDEX idx_answers_question ON answers(question_id);

-- 埋点事件（pageview / respond / embed_view）
CREATE TABLE events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  type       TEXT NOT NULL,
  poll_id    TEXT NOT NULL DEFAULT '',
  path       TEXT NOT NULL DEFAULT '',
  visitor_id TEXT NOT NULL DEFAULT '',
  session_id TEXT NOT NULL DEFAULT '',
  country    TEXT NOT NULL DEFAULT '',
  device     TEXT NOT NULL DEFAULT '',
  browser    TEXT NOT NULL DEFAULT '',
  os         TEXT NOT NULL DEFAULT '',
  lang       TEXT NOT NULL DEFAULT '',
  screen     TEXT NOT NULL DEFAULT '',
  referrer   TEXT NOT NULL DEFAULT '',
  extra      TEXT NOT NULL DEFAULT '{}',
  ts         INTEGER NOT NULL
);
CREATE INDEX idx_events_ts ON events(ts);
CREATE INDEX idx_events_poll_ts ON events(poll_id, ts);
CREATE INDEX idx_events_type_ts ON events(type, ts);
