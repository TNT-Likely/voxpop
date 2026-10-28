# App 接入指南（发现投票 + 渠道/应用定向）

> 面向在自有 App（如 BeeCount、Panwatch）中接入众声 VoxPop 的开发者。
> 语音版：App 定时查询「有没有属于我这个应用、这个分发渠道的进行中投票」，有则在 App 内提示用户，点击打开投票页。

## 1. 核心概念：应用 × 渠道 双维定向

| 维度 | 含义 | 示例 | 规则 |
|---|---|---|---|
| **应用（app）** | 问卷属于哪个 App | `beecount`、`panwatch` | 留空 = 通用（所有 App 的 feed 都会返回） |
| **渠道（channel）** | 该 App 内的分发渠道 | `appstore`、`ipa`、`apk`、`googleplay`（预设示例，**可自定义任意标签**） | 留空 = 全渠道 |

标签规则：小写字母 / 数字 / `-` / `_`，最长 32，最多 8 个，逗号分隔。开源部署方完全自定义。

**可见性语义**（feed 接口）：

- 已收录（listed）问卷：只要 应用×渠道 匹配就返回；
- 未收录（unlisted）问卷：必须**显式定向**了应用或渠道才返回 —— 这是「App 专属投票」的用法（不在首页展示，只推给定向的用户）。

## 2. 发现接口

```
GET /api/app/polls?app=<应用标签>&channel=<渠道标签>
```

- 两个参数均可选；`app` 缺省时只返回通用问卷（未定向应用的）；`channel` 缺省时只返回未定向渠道的。
- 响应（CORS 已开，带 60s Cache-Control）：

```json
{
  "app": "beecount",
  "channel": "googleplay",
  "polls": [
    {
      "id": "qgvvzxvv",
      "title": "下个版本你最想要什么功能？",
      "description": "帮我们决定优先级",
      "url": "https://voxpop.beejz.com/p/qgvvzxvv?src=app&app=beecount&channel=googleplay&accent=26a69a",
      "closeAt": 1793800000,
      "accent": "#26a69a"
    }
  ]
}
```

`url` 已带 `src=app&app=&channel=` 维度参数（进问卷白名单后入库），直接打开即可完成归因；`accent` 可用于 App 内横幅配色。

错误：`400 {"error":"bad_request"}`（标签非法）。

## 3. App 端推荐实现（Flutter 伪代码）

```dart
// 1. 构建期注入渠道常量（各分发渠道各打一包）
const kAppChannel = String.fromEnvironment('APP_CHANNEL', defaultValue: 'apk');
const kAppName = 'beecount';

// 2. 启动/回前台时检查（本地节流 ≥ 24h 一次）
final last = prefs.getInt('voxpop_last_check') ?? 0;
if (DateTime.now().millisecondsSinceEpoch - last < 24 * 3600 * 1000) return;
final res = await http.get(Uri.parse(
  'https://voxpop.beejz.com/api/app/polls?app=$kAppName&channel=$kAppChannel'));
prefs.setInt('voxpop_last_check', now);

// 3. 有结果则展示横幅（首页顶部卡片或关于页红点）
final polls = jsonDecode(res.body)['polls'] as List;
if (polls.isEmpty) return;
showBanner(
  title: polls.first['title'],
  onTap: () => launchUrl(Uri.parse(polls.first['url'])),  // 外部浏览器或 in-app WebView 均可
);
```

要点：

- **本地节流**：检查频率 ≥ 24h 一次（服务端有 60s 缓存，但别给用户弹烦）；
- **去重**：记录已展示/已参与的 `id`（App 本地即可，投票页本身有防重）；
- **打开方式**：外部浏览器或 in-app WebView 皆可；投票页自带 Turnstile 与防重，无需 App 侧做任何校验；
- **关闭态处理**：`closeAt` 早于当前时间则不展示。

## 4. 管理端如何定向

后台「新建问卷」与问卷详情页的**发布设置**里：

- **应用定向**：填 `beecount`（多个逗号分隔）；
- **渠道定向**：填 `googleplay`（多个逗号分隔）；
- 两者留空 = 全部应用 / 全渠道；
- 「应用定向 + 渠道定向 + 不收录」组合 = 纯 App 专属投票。

## 5. 渠道识别（App 构建侧）

各分发渠道在**构建期**注入渠道常量即可（Flutter `--dart-define`、iOS Info.plist、Android buildConfigField）。BeeCount 的四个预设：`appstore`（App Store）/ `ipa`（自签 / TestFlight）/ `apk`（官网直装）/ `googleplay`。
