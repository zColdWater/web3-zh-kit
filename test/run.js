#!/usr/bin/env node
// Zero-dependency test suite: node test/run.js
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const core = require('../lib/core.js');
const L = core.createLinter(require('../glossary.json'));
const ex = (f) => path.join(__dirname, '..', 'examples', f);
const J = (f) => JSON.parse(fs.readFileSync(ex(f), 'utf8'));

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); } catch (e) { fail++; console.log('  ✗ ' + name + '\n    ' + e.message); }
}
const rules = (issues) => issues.map((i) => i.rule);
const has = (issues, rule) => rules(issues).includes(rule);

console.log('web3-zh-kit tests');

t('placeholder translated → error', () => {
  const r = L.lintPair('Connected as {address}', '已连接为{地址}');
  assert(has(r, 'placeholder-missing') && has(r, 'placeholder-extra'));
});
t('ICU plural branches are not placeholders', () => {
  const r = L.lintPair('{count, plural, one {# item} other {# items}}', '{count, plural, other {# 项}}');
  assert(!has(r, 'placeholder-missing') && !has(r, 'placeholder-extra'), JSON.stringify(r));
});
t('printf, ${var}, {{var}} preserved', () => {
  assert(!has(L.lintPair('Failed: %s (${code}) {{name}}', '失败：%s（${code}）{{name}}'), 'placeholder-missing'));
  assert(has(L.lintPair('Failed: %s', '失败：'), 'placeholder-missing'));
});
t('"100% safe" is not a printf placeholder', () => {
  assert.deepStrictEqual(core.extractPlaceholders('100% sure, 50%s'), []);
});
t('tags must survive', () => {
  assert(has(L.lintPair('View on <0>BaseScan</0>.', '在 BaseScan 上查看。'), 'tag-missing'));
});
t('truncated address → error', () => {
  const r = L.lintPair('Send to 0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', '发送到 0x833589fcd6edb6e08f4c7c32d4f71b54bda0291');
  assert(has(r, 'address-missing'));
});
t('address comparison is case-insensitive', () => {
  assert(!has(L.lintPair('to 0xABCDEF0123456789', '至 0xabcdef0123456789'), 'address-missing'));
});
t('URL changed → error; trailing slash ignored', () => {
  assert(has(L.lintPair('See https://docs.base.org', '见 https://docs.base.com'), 'url-missing'));
  assert(!has(L.lintPair('See https://docs.base.org/', '见 https://docs.base.org'), 'url-missing'));
});
t('Base → 基地 is an error (brand name)', () => {
  const r = L.lintPair('Send USDC on Base', '在基地上发送 USDC');
  const i = r.find((x) => x.rule === 'glossary-avoid');
  assert(i && i.severity === 'error');
});
t('lowercase "base fee" does not trigger the Base brand rule', () => {
  assert(!L.lintPair('The base fee is burned.', '基础费用会被销毁。').some((i) => i.term === 'Base'));
});
t('staking → 押注 flagged, 质押 accepted', () => {
  assert(has(L.lintPair('Staking rewards', '押注奖励'), 'glossary-avoid'));
  assert(!has(L.lintPair('Staking rewards', '质押奖励'), 'glossary-avoid'));
});
t('keep_en terms accept English (gas, NFT)', () => {
  assert.strictEqual(L.lintPair('Gas is paid in ETH.', 'Gas 以 ETH 支付。').filter((i) => i.rule.startsWith('glossary')).length, 0);
});
t('missing glossary term → warning', () => {
  assert(has(L.lintPair('Address poisoning alert', '地址中毒警报'), 'glossary-term'));
});
t('Traditional chars in zh-CN → variant-mix', () => {
  assert(has(L.lintPair('Unstake anytime', '隨時解除質押', { variant: 'zh-CN' }), 'variant-mix'));
});
t('Simplified chars in zh-TW → variant-mix', () => {
  assert(has(L.lintPair('Connect wallet', '连接錢包', { variant: 'zh-TW' }), 'variant-mix'));
});
t('variant auto-detect', () => {
  assert.strictEqual(core.detectVariant('連接錢包，確認轉帳'), 'zh-TW');
  assert.strictEqual(core.detectVariant('连接钱包，确认转账'), 'zh-CN');
});
t('regional wording: 網絡 in zh-TW → suggest 網路', () => {
  const r = L.lintPair('Network fee', '網絡費用', { variant: 'zh-TW' });
  assert(r.some((i) => i.rule === 'regional-wording' && i.message.includes('網路')));
});
t('regional wording: longest match wins (程式碼 not double-counted)', () => {
  const r = L.lintPair('Source code', '程式码', { variant: 'zh-CN' }).filter((i) => i.rule === 'regional-wording');
  assert.strictEqual(r.length, 1);
});
t('untranslated string → warning', () => {
  assert(has(L.lintPair('Pay per request with x402', 'Pay per request with x402'), 'untranslated'));
});
t('brand-only strings are not "untranslated"', () => {
  assert(!has(L.lintPair('Receipts', 'Receipts'), 'untranslated'));
});
t('spacing + punctuation detection', () => {
  const r = L.lintPair('Done! View on BaseScan.', '完成!在BaseScan上查看.');
  assert(has(r, 'cjk-latin-spacing') && has(r, 'halfwidth-punct'));
});
t('--no-spacing disables the spacing rule', () => {
  assert(!has(L.lintPair('Send USDC', '发送USDC', { spacing: false }), 'cjk-latin-spacing'));
});
t('fixText repairs typography but never touches code/URLs/placeholders', () => {
  const src = '运行`npm i`后访问https://docs.base.org,然后点击{button}(确认)... 共3个ＡＰＩ';
  const out = core.fixText(src, { variant: 'zh-CN' }).text;
  assert.strictEqual(out, '运行 `npm i` 后访问 https://docs.base.org，然后点击{button}（确认）……共 3 个 API');
});
t('fixText is idempotent', () => {
  const samples = ['完成!在BaseScan上查看.', '网络费:~{fee}(汽油由付款主管赞助)', '交易悬而未决... {count}', '估计ＡＰＹ：{apy}%', '"中文"引号 -- 测试'];
  samples.forEach((s) => { const a = core.fixText(s).text; assert.strictEqual(core.fixText(a).text, a, s); });
});
t('fixText keeps decimals, versions and English sentences intact', () => {
  assert.strictEqual(core.fixText('版本 v2.0.1 已上线').text, '版本 v2.0.1 已上线');
  assert.strictEqual(core.fixText('Hello, world. 1.5').text, 'Hello, world. 1.5');
});
t('examples/zh-CN.json and zh-TW.json score 100', () => {
  assert.strictEqual(L.lintJson(J('en.json'), J('zh-CN.json')).summary.score, 100);
  assert.strictEqual(L.lintJson(J('en.json'), J('zh-TW.json')).summary.score, 100);
});
t('examples/zh-CN.bad.json catches the planted bugs', () => {
  const rep = L.lintJson(J('en.json'), J('zh-CN.bad.json'));
  const want = ['placeholder-missing', 'tag-missing', 'address-missing', 'url-missing', 'glossary-avoid', 'glossary-term',
    'variant-mix', 'untranslated', 'cjk-latin-spacing', 'halfwidth-punct', 'halfwidth-paren', 'ellipsis', 'fullwidth-alnum'];
  const got = rules(rep.issues);
  want.forEach((w) => assert(got.includes(w), 'missing rule ' + w));
  assert(rep.summary.errors >= 8, 'errors=' + rep.summary.errors);
});
t('fixing the bad example removes every fixable issue', () => {
  const fixed = L.fixJson(J('zh-CN.bad.json')).value;
  const left = L.lintJson(J('en.json'), fixed).issues.filter((i) => i.fixable);
  assert.strictEqual(left.length, 0, JSON.stringify(left, null, 1));
});
t('missing key → error, extra key → info', () => {
  const rep = L.lintJson({ a: 'Hi', b: 'Bye' }, { a: '你好', c: '多余' });
  assert(rep.issues.some((i) => i.key === 'b' && i.rule === 'missing-key' && i.severity === 'error'));
  assert(rep.issues.some((i) => i.key === 'c' && i.rule === 'extra-key'));
});
t('markdown: good guide scores 100', () => {
  const r = L.lintMarkdown(fs.readFileSync(ex('guide.en.md'), 'utf8'), fs.readFileSync(ex('guide.zh-CN.md'), 'utf8'));
  assert.strictEqual(r.summary.score, 100, JSON.stringify(r.issues));
});
t('markdown: changed code block, lost heading, lost URL, English leftover', () => {
  const en = fs.readFileSync(ex('guide.en.md'), 'utf8');
  const bad = fs.readFileSync(ex('guide.zh-CN.md'), 'utf8')
    .replace('mainnet.base.org', 'mainnet.base.com')
    .replace('## 4. 检查授权', '4. 检查授权')
    .replace('https://developers.circle.com/stablecoins/usdc-contract-addresses', '官网')
    .replace('永远不要从交易记录里复制地址。', 'Never copy an address from your transaction history.');
  const got = rules(L.lintMarkdown(en, bad).issues);
  ['md-codeblock-changed', 'md-heading-count', 'url-missing', 'md-untranslated-line'].forEach((w) => assert(got.includes(w), 'missing ' + w + ' in ' + got));
});
t('markdown fixer skips fenced code', () => {
  const md = '中文English\n```\n中文English\n```\n';
  assert.strictEqual(L.fixMarkdown(md).value, '中文 English\n```\n中文English\n```\n');
});
t('glossary lookup works both directions', () => {
  assert.strictEqual(L.lookup('seed phrase')[0].zh_cn, '助记词');
  assert.strictEqual(L.lookup('质押')[0].en, 'staking');
});

t('Markdown anchor / relative link targets are not typography', () => {
  const r = L.lintZh('见[用法](#用法)和[示例](./examples/zh-CN.json)。');
  assert.deepStrictEqual(rules(r.issues), []);
  assert.strictEqual(L.fixMarkdown('见[用法](#用法)。\n').value, '见[用法](#用法)。\n');
});
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
