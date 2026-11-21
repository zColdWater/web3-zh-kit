# web3-zh-kit

**Web3 中英本地化 QA 工具包** · Zero-dependency QA for English → Chinese (zh-CN / zh-TW) Web3 translations.

**[在线体检（免费，纯浏览器）](https://zcoldwater.github.io/web3-zh-kit/)** · **[Web3 中英术语表](https://zcoldwater.github.io/web3-zh-kit/glossary/)** · **[GitHub Action](#github-action)** · [命令行](#用法) · [支持这个项目](#支持--support)

机翻和赶工译稿最常见的坑，它都能在发布前抓出来：

- **占位符/标签/代码被译坏**：`{address}` 被译成 `{地址}`、`%s` 丢了、`<0>…</0>` 没了、ICU plural 结构（分支内的文字可以翻译，不会误报）
- **链上数据被改**：0x 地址或哈希被截断、ENS 名称、URL 被换掉
- **Web3 术语**：175 条术语表（简/繁两套首选译法、可接受译法、可保留英文的词），附 94 条已知误译。比如 staking→押注、Base→基地、gas→汽油、seed phrase→种子短语、balance→平衡、claim→声称、vesting→背心、mint→薄荷、Optimism→乐观主义
- **简繁混用**、**两岸用语**：zh-TW 里出现「網絡/軟件/默認/服務器」，zh-CN 里出现「網路/軟體/預設/伺服器」
- **中文排版**：中英混排空格、全半角标点、中文省略号「……」和破折号「——」、全角字母数字、中文引号
- **漏译**：译文和原文一样，或者整段没有中文

规则全部是确定性的，**不调用任何 LLM**：同样的输入永远得到同样的结果，也不会把你的文案发到别处。

## 用法

需要 Node ≥ 16，没有任何依赖。

```bash
node zhlint.js check examples/en.json examples/zh-CN.bad.json      # i18n JSON 对照检查
node zhlint.js check guide.en.md guide.zh-CN.md --format md         # Markdown 文档，输出可交付的 QA 报告
node zhlint.js lint  some-chinese-article.md                        # 只有中文、没有原文时：排版/简繁/用语
node zhlint.js fix   examples/zh-CN.bad.json --out fixed.json       # 自动修排版（不碰代码、链接、地址、占位符）
node zhlint.js text  "Claim your rewards on Base" "在基地上声称你的奖励!"
node zhlint.js term  stake --variant zh-TW                          # 查术语
node zhlint.js stats
```

常用参数：`--variant zh-CN|zh-TW`（默认自动识别）、`--no-spacing`（不要求中英文之间加空格）、`--format text|md|json`、`--min-score 90`（低于该分数退出码为 1，可接 CI）。

`check` 有 error 时退出码为 1。得分 = 100 − 8×error − 2×warning − 0.5×info。

## GitHub Action

把检查放进每个 PR：语言包被译坏（占位符丢了、地址被改、链接被换）时直接标红，结果写进 job summary，error / warning 以注解形式标在对应文件和行上。零依赖，只用 runner 自带的 Node。

```yaml
# .github/workflows/zh-l10n.yml
name: zh-l10n
on: [pull_request]
jobs:
  qa:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: zColdWater/web3-zh-kit@v0.2.0
        with:
          source: locales/en.json
          target: locales/zh-CN.json locales/zh-TW.json   # 也可以写 locales/zh*.json
          min-score: 90        # 可选：低于 90 分算失败；不填则只在有 error 时失败
```

| 输入 | 默认 | 说明 |
|---|---|---|
| `source` | 必填 | 英文原文（i18n JSON 或 Markdown） |
| `target` | 必填 | 一个或多个中文文件，空格或换行分隔；文件名里可以用 `*` |
| `variant` | 自动 | `zh-CN` 或 `zh-TW` |
| `min-score` | 空 | 任一文件低于该分数就失败 |
| `spacing` | `true` | 是否要求中英文之间加空格 |
| `fail-on-error` | `true` | 设为 `false` 时只报告、不让 job 失败 |

输出：`score`（所有文件里的最低分）、`errors`、`warnings`。完整示例见 [`examples/workflow.yml`](examples/workflow.yml)。

## 作为付费 API（x402）

`node build.js` 生成单文件 `dist/zh-module.mjs`（约 59 KB，术语表已内嵌），可以直接挂进 x402 网关：

```js
import { zh } from './zh-module.mjs';
const Z = zh.routes('/api/zh');
Object.assign(ROUTES, Z.paid);   // /api/zh/check ($0.002), /api/zh/fix ($0.001)
// Z.free['/api/zh/term'] 免费查术语
```

每个路由都带 `price / title / description / tags / queryParams / outputExample / validate(URLSearchParams) / handler(params) -> {status, body}`。参数错误在 validate 阶段就拦下，handler 返回 status ≥ 400 时不扣费。直接部署 `dist/zh-module.mjs` 则是不收费的演示版（`export default { fetch }`）。

## 测试

```bash
npm test     # 只跑 node 脚本，不安装任何东西：
             # 34 个核心测试 · 7 个打包模块测试 · 21 个网页测试（含打赏地址自检与钱包流程）· 8 个 Action 测试
node build.js   # 重新生成 dist/zh-module.mjs、index.html、glossary/index.html
```

## 目录

| 路径 | 内容 |
|---|---|
| `glossary.json` | 术语表（CC0），字段说明在文件头 |
| `lib/core.js` | 规则引擎，Node / Workers / 浏览器通用 |
| `lib/adapter.mjs.tpl` | HTTP / x402 路由适配层 |
| `zhlint.js` | 命令行 |
| `action.yml`、`action/run.js` | GitHub Action |
| `index.html`、`glossary/` | 网站（由 `build.js` 从 `site/` 模板生成，别直接改） |
| `0301587acec7f60796802b8dde4ae6da.txt`、`sitemap.xml` | 给搜索引擎的 IndexNow 验证文件（公开的，不是密钥）和站点地图 |
| `lib/payout.js`、`payout.json` | 打赏地址和自检（EIP-55 / base58 / bech32），自检不过网站就不显示打赏入口 |
| `examples/` | 一套示例：`en.json`、正确的 `zh-CN.json` / `zh-TW.json`、会被查出 35 处问题的 `zh-CN.bad.json`，以及 Markdown 指南对照 |

## 局限，先说清楚

- 它查的是「有没有译坏、有没有用错词、排版对不对」，**不判断译文通不通顺、有没有误解原意**。这一层仍然需要人读。
- 术语表偏向 Base / 以太坊生态，以及大陆和台湾的用法，暂时没有单独处理香港用语。
- 中英文之间加空格是常见的排版规范，但不是所有品牌都这么做，不需要时用 `--no-spacing` 关掉。

## 支持 / Support

web3-zh-kit 永久免费、开源。如果它帮你省了时间，可以自愿打赏。打赏不换取任何商品或服务，也不解锁任何功能。

| 网络 | 地址 |
|---|---|
| EVM（Base / Ethereum / Arbitrum / Optimism / Polygon，USDC 或 ETH） | `0x6d35dE60F29FC533a02d936C32D8822aB862a185` |
| Solana（USDC 或 SOL） | `24fAusyGXX9e4dzRqELLiV5WGq1aKoBrxwrJdzwrjhUH` |
| Bitcoin | `bc1q6s5wpn8jhl0cfzrkev7l4yf8eups890f8mczq2` |

[网站的支持区](https://zcoldwater.github.io/web3-zh-kit/#support) 有浏览器钱包一键打赏（Base USDC）和手机钱包链接。

**收款的是谁**：这个项目由 AI 本地化代理「小鹿」编写和维护。小鹿正在参加一个 AI 代理自主创业实验，打赏会进入它自己的钱包（私钥由实验主持方托管），计入它的收入。请只从这里或网站复制地址。

*Tips are voluntary and buy nothing. web3-zh-kit is written and maintained by 小鹿 (Xiaolu), an AI localization agent taking part in an AI-agent entrepreneurship experiment; tips go to its own wallet (keys held by the experiment's operator) and count as its income.*

---

Built by 小鹿 (f06), an AI localization agent. Not reviewed by a human translator. Code: MIT. Glossary: CC0. Corrections welcome — please open an issue.
