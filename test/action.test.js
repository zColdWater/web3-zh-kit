#!/usr/bin/env node
// Tests for the GitHub Action entry point (action/run.js), run the way the runner runs it.
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const root = path.join(__dirname, '..');
const tmp = path.join(__dirname, '.tmp-action');
fs.rmSync(tmp, { recursive: true, force: true });
fs.mkdirSync(tmp, { recursive: true });

let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; console.log('  ✓ ' + name); } catch (e) { fail++; console.log('  ✗ ' + name + '\n    ' + e.message); } }
function ok(v, m) { if (!v) throw new Error(m || 'assertion failed'); }

function run(inputs) {
  const outFile = path.join(tmp, 'out-' + Math.random().toString(36).slice(2));
  const sumFile = outFile + '.md';
  const env = Object.assign({}, process.env, { GITHUB_WORKSPACE: root, GITHUB_OUTPUT: outFile, GITHUB_STEP_SUMMARY: sumFile }, inputs);
  const r = spawnSync(process.execPath, [path.join(root, 'action/run.js')], { env, encoding: 'utf8' });
  const outputs = {};
  if (fs.existsSync(outFile)) fs.readFileSync(outFile, 'utf8').split('\n').filter(Boolean).forEach((l) => { const i = l.indexOf('='); outputs[l.slice(0, i)] = l.slice(i + 1); });
  return { code: r.status, stdout: r.stdout, outputs, summary: fs.existsSync(sumFile) ? fs.readFileSync(sumFile, 'utf8') : '' };
}

t('clean translations pass (zh-CN + zh-TW)', () => {
  const r = run({ ZHKIT_SOURCE: 'examples/en.json', ZHKIT_TARGET: 'examples/zh-CN.json\nexamples/zh-TW.json', ZHKIT_MIN_SCORE: '90' });
  ok(r.code === 0, 'exit ' + r.code + '\n' + r.stdout);
  ok(r.outputs.errors === '0', 'errors=' + r.outputs.errors);
  ok(Number(r.outputs.score) >= 90);
  ok(r.summary.includes('zh-TW') && r.summary.includes('✅'));
});
t('broken translation fails with file annotations', () => {
  const r = run({ ZHKIT_SOURCE: 'examples/en.json', ZHKIT_TARGET: 'examples/zh-CN.bad.json' });
  ok(r.code === 1, 'exit ' + r.code);
  ok(Number(r.outputs.errors) > 0);
  ok(/::error file=examples\/zh-CN\.bad\.json,line=\d+,title=web3-zh-kit /.test(r.stdout), 'no line-annotated error:\n' + r.stdout.slice(0, 600));
  ok(r.summary.includes('❌') && r.summary.includes('<details open>'));
});
t('fail-on-error=false reports but exits 0', () => {
  const r = run({ ZHKIT_SOURCE: 'examples/en.json', ZHKIT_TARGET: 'examples/zh-CN.bad.json', ZHKIT_FAIL: 'false' });
  ok(r.code === 0 && Number(r.outputs.errors) > 0);
});
t('glob in the file name expands and skips the source itself', () => {
  const r = run({ ZHKIT_SOURCE: 'examples/en.json', ZHKIT_TARGET: 'examples/*.json', ZHKIT_FAIL: 'false' });
  ok(r.code === 0, r.stdout);
  ok(r.stdout.includes('zh-CN.json') && r.stdout.includes('zh-TW.json') && r.stdout.includes('zh-CN.bad.json'));
  ok(!/web3-zh-kit: examples\/en\.json/.test(r.stdout), 'linted the source against itself');
});
t('Markdown documents are supported', () => {
  const r = run({ ZHKIT_SOURCE: 'examples/guide.en.md', ZHKIT_TARGET: 'examples/guide.zh-CN.md', ZHKIT_FAIL: 'false' });
  ok(r.code === 0 && r.outputs.score !== undefined, r.stdout);
});
t('min-score makes a low score fail even without errors', () => {
  const r = run({ ZHKIT_SOURCE: 'examples/en.json', ZHKIT_TARGET: 'examples/zh-CN.json', ZHKIT_MIN_SCORE: '101' });
  ok(r.code === 2, 'invalid min-score should be a usage error, got ' + r.code);
  const r2 = run({ ZHKIT_SOURCE: 'examples/en.json', ZHKIT_TARGET: 'examples/zh-CN.json', ZHKIT_MIN_SCORE: '100', ZHKIT_SPACING: 'true' });
  ok(r2.code === (Number(r2.outputs.score) < 100 ? 1 : 0), 'min-score not enforced: ' + r2.outputs.score + ' / ' + r2.code);
});
t('paths outside the workspace are refused', () => {
  const r = run({ ZHKIT_SOURCE: '../package.json', ZHKIT_TARGET: 'examples/zh-CN.json' });
  ok(r.code === 2 && r.stdout.includes('outside the workspace'), r.stdout);
});
t('workflow-command injection in messages is escaped', () => {
  const r = run({ ZHKIT_SOURCE: 'examples/en.json', ZHKIT_TARGET: 'examples/zh-CN.bad.json', ZHKIT_FAIL: 'false' });
  const lines = r.stdout.split('\n').filter((l) => l.startsWith('::'));
  ok(lines.length > 0 && lines.every((l) => /^::(error|warning) file=[^:]*::/.test(l)), 'malformed command line');
});

fs.rmSync(tmp, { recursive: true, force: true });
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
