// Tests the bundled ESM module (run `node build.js` first): node test/module.test.mjs
import assert from 'assert';
import worker, { zh } from '../dist/zh-module.mjs';

let pass = 0, fail = 0;
async function t(name, fn) {
  try { await fn(); pass++; console.log('  ✓ ' + name); } catch (e) { fail++; console.log('  ✗ ' + name + '\n    ' + e.message); }
}
const sp = (o) => new URLSearchParams(o);
const R = zh.routes('/api/zh');

console.log('dist/zh-module.mjs tests');
await t('routes have gateway shape', () => {
  for (const r of Object.values(R.paid)) {
    assert(/^\d+$/.test(r.price) && r.title && r.description && r.queryParams && r.outputExample);
    assert.strictEqual(typeof r.validate, 'function'); assert.strictEqual(typeof r.handler, 'function');
  }
  assert(R.free['/api/zh/term']);
});
await t('validate rejects missing / oversized input before any charge', () => {
  assert(R.paid['/api/zh/check'].validate(sp({ source: 'x' })).error);
  assert(R.paid['/api/zh/check'].validate(sp({ source: 'x', target: 'y'.repeat(5000) })).error === 'too_long');
  assert(R.paid['/api/zh/check'].validate(sp({ source: 'x', target: 'y', variant: 'ja' })).error === 'bad_variant');
  assert(R.paid['/api/zh/fix'].validate(sp({})).error === 'missing_text');
});
await t('check: catches Base→基地 and staking→押注', async () => {
  const p = R.paid['/api/zh/check'].validate(sp({ source: 'Staking rewards on Base', target: '基地上的押注奖励' }));
  const r = await R.paid['/api/zh/check'].handler(p);
  assert.strictEqual(r.status, 200);
  const terms = r.body.issues.filter((i) => i.rule === 'glossary-avoid').map((i) => i.term);
  assert(terms.includes('Base') && terms.includes('staking'), JSON.stringify(r.body.issues));
});
await t('check: JSON i18n objects', async () => {
  const p = R.paid['/api/zh/check'].validate(sp({ source: JSON.stringify({ a: 'Connected as {address}' }), target: JSON.stringify({ a: '已连接为{地址}' }) }));
  const r = await R.paid['/api/zh/check'].handler(p);
  assert.strictEqual(r.body.mode, 'json'); assert(r.body.summary.errors >= 1);
});
await t('fix: returns fixed text and change log', async () => {
  const r = await R.paid['/api/zh/fix'].handler(R.paid['/api/zh/fix'].validate(sp({ text: '完成!在BaseScan上查看.' })));
  assert.strictEqual(r.body.text, '完成！在 BaseScan 上查看。'); assert(r.body.changed);
});
await t('term: lookup + 404 for unknown (404 = not charged)', async () => {
  const ok = await R.free['/api/zh/term'].handler(R.free['/api/zh/term'].validate(sp({ q: 'seed phrase', variant: 'zh-TW' })));
  assert.strictEqual(ok.body.results[0].preferred, '助記詞');
  const no = await R.free['/api/zh/term'].handler(R.free['/api/zh/term'].validate(sp({ q: 'qwertyuiop' })));
  assert.strictEqual(no.status, 404);
});
await t('standalone fetch works (free demo mode)', async () => {
  const res = await worker.fetch(new Request('https://x.test/api/zh/fix?text=' + encodeURIComponent('共3个ＡＰＩ')));
  assert.strictEqual(res.status, 200);
  assert.strictEqual((await res.json()).text, '共 3 个 API');
  const idx = await worker.fetch(new Request('https://x.test/'));
  assert.strictEqual((await idx.json()).terms, 175);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
