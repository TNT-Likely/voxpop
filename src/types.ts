export type Env = {
  DB: D1Database;
  /** Rate Limiting binding（wrangler.jsonc ratelimits），不可用时为空 */
  RL?: { limit(input: { key: string }): Promise<{ success: boolean }> };
  /** 登录专用限流（更严格） */
  RL_LOGIN?: { limit(input: { key: string }): Promise<{ success: boolean }> };
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
  title_en: string;
  description: string;
  description_en: string;
  dedup_mode: DedupMode;
  result_policy: ResultPolicy;
  status: 'draft' | 'open' | 'closed';
  close_at: number | null;
  extra_keys: string;
  accent: string;
  visibility: 'listed' | 'unlisted';
  creator_hash: string;
  channels: string;
  apps: string;
  created_at: number;
  closed_at: number | null;
}

export interface QuestionRow {
  id: string;
  poll_id: string;
  type: QuestionType;
  title: string;
  title_en: string;
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
  label_en: string;
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
  lang: string;
}

/** 后台创建问卷的已解析输入 */
export interface PollInput {
  title: string;
  titleEn: string;
  description: string;
  descriptionEn: string;
  dedupMode: DedupMode;
  resultPolicy: ResultPolicy;
  closeAt: number | null;
  extraKeys: string;
  accent: string;
  visibility: 'listed' | 'unlisted';
  creatorHash: string;
  channels: string;
  apps: string;
  questions: {
    type: QuestionType;
    title: string;
    titleEn: string;
    required: boolean;
    maxChoices: number;
    maxLen: number;
    parsedOptions: { label: string; depth: number }[];
    /** 与 parsedOptions 一一对应的英文选项（空串 = 未翻译） */
    parsedOptionsEn: string[];
  }[];
}
