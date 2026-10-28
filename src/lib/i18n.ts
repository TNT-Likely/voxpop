/** 中英双语文案。键为稳定标识符，新增文案必须中英同时给。 */

export type Locale = 'zh' | 'en';

type Entry = { zh: string; en: string };

export const DICT: Record<string, Entry> = {
  // 品牌 / 框架
  tagline: { zh: '大家的投票站', en: 'Share your voice' },
  footerPrivacy: {
    zh: '本站仅做匿名聚合统计，不收集任何个人身份信息',
    en: 'Anonymous aggregated statistics only. No personal data is collected.',
  },
  home: { zh: '首页', en: 'Home' },
  newPoll: { zh: '新建问卷', en: 'New poll' },
  admin: { zh: '后台', en: 'Admin' },
  themeAuto: { zh: '跟随系统', en: 'Auto' },
  themeLight: { zh: '日间', en: 'Light' },
  themeDark: { zh: '暗黑', en: 'Dark' },

  // 首页
  ongoingTitle: { zh: '进行中的调研', en: 'Open polls' },
  emptyHome: { zh: '暂无进行中的调研', en: 'No open polls' },
  participants: { zh: '{n} 人参与', en: '{n} responses' },
  ongoing: { zh: '进行中', en: 'Open' },
  closingOn: { zh: '{date} 截止', en: 'Closes {date}' },

  // 投票页
  needJs: { zh: '需要启用 JavaScript 才能参与。', en: 'JavaScript is required to participate.' },
  closedBanner: { zh: '调研已截止，仅展示结果', en: 'This poll has closed — showing results only' },
  votedBanner: { zh: '你已参与过这次调研', en: "You've already responded" },
  submit: { zh: '提交', en: 'Submit' },
  pleaseComplete: { zh: '请完成：{title}', en: 'Please complete: {title}' },
  alreadySubmitted: { zh: '你已提交过这份问卷', en: "You've already responded" },
  thanks: { zh: '提交成功，感谢你的声音！', en: 'Thanks — your voice is in!' },
  networkError: { zh: '网络异常，请稍后再试', en: 'Network error. Please try again.' },
  submitFailed: { zh: '提交失败：{reason}', en: 'Submission failed: {reason}' },
  maxChoicesTip: { zh: '最多可选 {n} 项', en: 'Choose up to {n}' },
  selectLevel: { zh: '请选择', en: 'Select…' },
  selectNext: { zh: '请选择下一级', en: 'Select next…' },
  textPlaceholder: { zh: '请输入（最多 {n} 字）', en: 'Type here (max {n} chars)' },
  optionalPostfix: { zh: '（选填）', en: ' (optional)' },
  resultsHiddenNotice: { zh: '结果将在截止后公开', en: 'Results will be visible after the poll closes' },

  // 结果
  resultsTitle: { zh: '结果（{n} 份答卷 · {m} 次浏览）', en: 'Results ({n} responses · {m} views)' },
  totalResponses: { zh: '共 {n} 份答卷', en: '{n} responses' },
  composition: { zh: '答卷构成', en: 'Response mix' },
  trendTitle: { zh: '趋势（近 14 天）', en: 'Trend (last 14 days)' },
  device: { zh: '设备', en: 'Device' },
  browser: { zh: '浏览器', en: 'Browser' },
  os: { zh: '系统', en: 'OS' },
  country: { zh: '国家/地区', en: 'Country/Region' },
  unknown: { zh: '未知', en: 'Unknown' },
  responsesLabel: { zh: '答卷', en: 'Responses' },
  pageviewsLabel: { zh: '浏览 PV', en: 'Views' },
  supplementCount: { zh: '{n} 条补充说明', en: '{n} written responses' },
  sharePoster: { zh: '生成分享海报', en: 'Share as poster' },
  posterFailed: { zh: '海报生成失败', en: 'Failed to generate poster' },
  scanToVote: { zh: '扫码参与', en: 'Scan to vote' },
  posterBrand: { zh: '众声 VoxPop', en: 'VoxPop' },

  // 404 / 通用错误
  notFoundTitle: { zh: '页面不存在', en: 'Page not found' },
  notFoundDesc: { zh: '页面不存在或问卷已下线', en: 'Page not found or poll removed' },
  backHome: { zh: '回首页', en: 'Back home' },
  pollClosed: { zh: '问卷已截止', en: 'This poll has closed' },
  pollNotFound: { zh: '问卷不存在或已下线', en: 'Poll not found' },
  resultsHidden: { zh: '结果暂不可见', en: 'Results are not visible yet' },
  alreadyResponded: { zh: '请勿重复提交', en: 'Duplicate submission' },
  captchaFailed: { zh: '人机校验未通过，请重试', en: 'CAPTCHA failed. Please retry.' },
  missingAnswer: { zh: '还有必答题未完成', en: 'Required answers are missing' },
  textTooLong: { zh: '文本超出长度限制', en: 'Text exceeds the length limit' },
  tooManyChoices: { zh: '超出了可选项数上限', en: 'Too many choices selected' },
  cascadeNeedsLeaf: { zh: '级联题需要选择到最底层', en: 'Please choose the deepest cascade level' },
  badAnswers: { zh: '答卷格式不正确', en: 'Invalid answers payload' },
  tooManyRequests: { zh: '操作过于频繁，请稍后再试', en: 'Too many requests. Try again later.' },
  unauthorized: { zh: '未授权', en: 'Unauthorized' },
  badRequest: { zh: '请求无效', en: 'Bad request' },
  dailyLimit: { zh: '今天创建的问卷已达上限（{n} 份），明天再来', en: 'Daily creation limit reached ({n} per day)' },

  // 登录 / 后台
  adminTitle: { zh: '管理后台', en: 'Admin' },
  adminKeyLabel: { zh: '管理密钥', en: 'Admin key' },
  loginBtn: { zh: '登录', en: 'Sign in' },
  wrongKey: { zh: '密钥不正确', en: 'Incorrect key' },
  logout: { zh: '退出登录', en: 'Sign out' },
  backToList: { zh: '返回列表', en: 'Back to list' },
  thTitle: { zh: '标题', en: 'Title' },
  thStatus: { zh: '状态', en: 'Status' },
  thResponses: { zh: '答卷', en: 'Responses' },
  thCreated: { zh: '创建时间', en: 'Created' },
  thActions: { zh: '操作', en: 'Actions' },
  statusOpen: { zh: '进行中', en: 'Open' },
  statusClosed: { zh: '已截止', en: 'Closed' },
  statusExpired: { zh: '已到期', en: 'Expired' },
  listedBadge: { zh: '已收录', en: 'Listed' },
  unlistedBadge: { zh: '未收录', en: 'Unlisted' },
  listOn: { zh: '收录', en: 'List' },
  listOff: { zh: '取消收录', en: 'Unlist' },
  close: { zh: '截止', en: 'Close' },
  reopen: { zh: '开启', en: 'Reopen' },
  delete: { zh: '删除', en: 'Delete' },
  confirmDelete: { zh: '确定删除该问卷及其全部数据？不可恢复', en: 'Delete this poll and all its data? This cannot be undone.' },
  noPolls: { zh: '还没有问卷，点右上角新建', en: 'No polls yet — create one' },
  viewPage: { zh: '打开公开页', en: 'View page' },
  exportJson: { zh: '导出 JSON', en: 'Export JSON' },
  publicLink: { zh: '公开链接', en: 'Public link' },
  embedCode: { zh: '嵌入代码', en: 'Embed code' },
  noResponses: { zh: '还没有答卷', en: 'No responses yet' },
  noData: { zh: '暂无数据', en: 'No data' },
  setAccent: { zh: '保存', en: 'Save' },
  accentLabel: { zh: '主题色（影响该问卷页面与海报）', en: 'Accent color (poll page & poster)' },
  channelsLabel: {
    zh: '渠道定向（逗号分隔自定义渠道，留空 = 全渠道）',
    en: 'Channel targeting (comma separated, blank = all channels)',
  },
  appsLabel: {
    zh: '应用定向（留空 = 全部应用）',
    en: 'App targeting (blank = all apps)',
  },
  titleEnLabel: { zh: '英文标题（选填）', en: 'English title (optional)' },
  descEnLabel: { zh: '英文说明（选填）', en: 'English description (optional)' },
  autoRefresh: { zh: '自动刷新 30s', en: 'Auto refresh 30s' },
  enMismatch: { zh: '英文选项与中文的行数/层级不一致', en: 'English options must match the Chinese structure line by line' },
  registryTitle: { zh: '标签维护', en: 'Tag registry' },
  registryHint: {
    zh: '应用与渠道用于 App 发现接口的定向；问卷创建时从这里勾选，避免手填出错。',
    en: 'Apps & channels power app-feed targeting; pick them from here when creating polls.',
  },
  kindApps: { zh: '应用', en: 'Apps' },
  kindChannels: { zh: '渠道', en: 'Channels' },
  slugLabel: { zh: '标识 slug', en: 'Slug' },
  nameLabel: { zh: '显示名', en: 'Display name' },
  addTag: { zh: '添加', en: 'Add' },
  delTag: { zh: '删除', en: 'Delete' },
  noTags: { zh: '暂无标签，先在下面添加', en: 'No tags yet — add below' },
  goRegistry: { zh: '去标签维护', en: 'Manage tags' },

  // 新建问卷表单
  createTitle: { zh: '新建问卷', en: 'Create a poll' },
  pollTitleLabel: { zh: '标题（必填）', en: 'Title (required)' },
  pollTitlePlaceholder: { zh: '例如：BeeCount 下个版本你最想要什么功能？', en: 'e.g. Which feature should BeeCount ship next?' },
  descLabel: { zh: '说明（选填）', en: 'Description (optional)' },
  dedupLabel: { zh: '防重策略', en: 'Duplicate protection' },
  dedupDevice: { zh: '每设备一份（推荐）', en: 'One per device (recommended)' },
  dedupIp: { zh: '每 IP 一份（严格）', en: 'One per IP (strict)' },
  dedupOpen: { zh: '宽松（仅前端提示）', en: 'Loose (client-side only)' },
  policyLabel: { zh: '结果可见', en: 'Result visibility' },
  policyAfterVote: { zh: '提交后可见', en: 'Visible after voting' },
  policyAlways: { zh: '实时可见', en: 'Visible in realtime' },
  policyAfterClose: { zh: '截止后可见', en: 'Visible after closing' },
  closeDaysLabel: { zh: '几天后截止（留空不限）', en: 'Close after days (blank = never)' },
  accentCreateLabel: { zh: '主题色（选填，#RRGGBB）', en: 'Accent color (optional, #RRGGBB)' },
  extraKeysLabel: { zh: '自定义维度键（逗号分隔）', en: 'Custom dimension keys (comma separated)' },
  questionsTitle: { zh: '题目', en: 'Questions' },
  addQuestion: { zh: '+ 添加题目', en: '+ Add question' },
  qTitleLabel: { zh: '题目', en: 'Question' },
  qTypeLabel: { zh: '题型', en: 'Type' },
  typeSingle: { zh: '单选', en: 'Single choice' },
  typeMulti: { zh: '多选', en: 'Multiple choice' },
  typeCascade: { zh: '级联选择', en: 'Cascading select' },
  typeText: { zh: '文本输入', en: 'Text input' },
  optionsLabel: {
    zh: '选项（每行一个；级联题用两个空格缩进表示下一级，最深 3 层）',
    en: 'Options (one per line; indent two spaces for cascade levels, max 3 levels)',
  },
  normalHint: { zh: '选项 A\n选项 B\n选项 C', en: 'Option A\nOption B\nOption C' },
  cascadeHint: {
    zh: 'iOS\n  iPhone\n    iOS 26（最新）\n    iOS 17 ~ 25\nAndroid\n  Android 15 及以上',
    en: 'iOS\n  iPhone\n    iOS 26 (latest)\n    iOS 17 - 25\nAndroid\n  Android 15+',
  },
  maxChoicesLabel: { zh: '最多可选', en: 'Max choices' },
  maxLenLabel: { zh: '最大字数', en: 'Max length' },
  requiredLabel: { zh: '必答', en: 'Required' },
  removeQuestion: { zh: '删除本题', en: 'Remove' },
  createBtn: { zh: '创建问卷', en: 'Create poll' },
  needPollTitle: { zh: '请填写问卷标题', en: 'Please enter a title' },
  needQTitle: { zh: '有题目还没填标题', en: 'A question is missing its title' },
  needTwoOptions: { zh: '「{title}」至少需要两个选项', en: '"{title}" needs at least two options' },
  titleTooLong: { zh: '标题超长', en: 'Title is too long' },
  optionsTooFew: { zh: '每道选择 / 级联题至少需要两个选项', en: 'Choice questions need at least two options' },
  levelTooDeep: { zh: '级联选项最深 3 层', en: 'Cascade options can be at most 3 levels deep' },
  badIndent: { zh: '只有级联题支持缩进子选项', en: 'Only cascade questions support indented sub-options' },
  tooManyQuestions: { zh: '问卷需要 1 ~ 20 道题', en: 'A poll needs 1-20 questions' },
  createFailed: { zh: '创建失败', en: 'Failed to create' },

  // 自助建票
  publicNewTitle: { zh: '创建问卷', en: 'Create a poll' },
  unlistedNotice: {
    zh: '创建的问卷默认不出现在首页，仅通过链接访问；管理员可收录。',
    en: 'New polls are unlisted — share the link directly. An admin can list it later.',
  },
  contentNotice: {
    zh: '你对问卷内容负责，违规内容将被删除。',
    en: 'You are responsible for the content. Abusive polls will be removed.',
  },
  dailyLimitNotice: { zh: '每设备每天最多 {n} 份', en: 'Up to {n} polls per device per day' },
};

export function t(locale: Locale, key: string, vars?: Record<string, string | number>): string {
  const entry = DICT[key];
  let s = entry ? entry[locale] : key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  }
  return s;
}

/** 下发给前端 JS 的扁平字典（单语） */
export function dictFor(locale: Locale): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(DICT)) out[key] = entry[locale];
  return out;
}

/** 语言判定：URL 参数 > Cookie > Accept-Language，默认中文 */
export function detectLocale(param: string | undefined, cookie: string | undefined, acceptLanguage: string | undefined): Locale {
  if (param === 'en' || param === 'zh') return param;
  if (cookie === 'en' || cookie === 'zh') return cookie;
  const al = (acceptLanguage ?? '').toLowerCase();
  return /(^|[,;])\s*en([-,;]|$)/.test(al) || al.startsWith('en') ? 'en' : 'zh';
}
