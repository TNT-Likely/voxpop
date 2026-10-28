export type Env = {
  DB: D1Database;
  /** Rate Limiting binding（wrangler.jsonc ratelimits），不可用时为空 */
  RL?: { limit(input: { key: string }): Promise<{ success: boolean }> };
  ADMIN_KEY: string;
  SERVER_SALT: string;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  SAMPLE_RATE?: string;
};

export type QuestionType = 'single' | 'multi' | 'cascade' | 'text';
export type DedupMode = 'device' | 'ip' | 'open';
export type ResultPolicy = 'always' | 'after_vote' | 'after_close';

export interface PollRow {
  id: string;
  title: string;
  description: string;
  dedup_mode: DedupMode;
  result_policy: ResultPolicy;
  status: 'draft' | 'open' | 'closed';
  close_at: number | null;
  extra_keys: string;
  created_at: number;
  closed_at: number | null;
}

export interface QuestionRow {
  id: string;
  poll_id: string;
  type: QuestionType;
  title: string;
  required: number;
  max_choices: number;
  max_len: number;
  sort: number;
}

export interface OptionRow {
  id: string;
  question_id: string;
  parent_id: string | null;
  label: string;
  sort: number;
}

export interface AnswerInput {
  questionId: string;
  optionIds?: string[];
  text?: string;
}

export interface RespondDims {
  country: string;
  device: string;
  browser: string;
  os: string;
}

/** 后台创建问卷的已解析输入 */
export interface PollInput {
  title: string;
  description: string;
  dedupMode: DedupMode;
  resultPolicy: ResultPolicy;
  closeAt: number | null;
  extraKeys: string;
  questions: {
    type: QuestionType;
    title: string;
    required: boolean;
    maxChoices: number;
    maxLen: number;
    parsedOptions: { label: string; depth: number }[];
  }[];
}
