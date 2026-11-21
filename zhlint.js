#!/usr/bin/env node
/*
 * zhlint — EN→ZH localization QA for Web3 (web3-zh-kit CLI). Zero dependencies, Node ≥ 16.
 *
 *   node zhlint.js check <source.json|md> <target.json|md> [--variant zh-CN|zh-TW] [--format text|md|json] [--no-spacing] [--min-score 80]
 *   node zhlint.js lint  <chinese.md|json>  (no source: typography, script mixing, regional wording)
 *   node zhlint.js fix   <target.json|md> [--out <file>] [--variant zh-CN|zh-TW] [--no-spacing]
 *   node zhlint.js text  "<english>" "<中文>" [--variant zh-TW]
 *   node zhlint.js term  <english or 中文>    [--variant zh-TW]
 *   node zhlint.js stats
 */
'use strict';
const fs = require('fs');
const path = require('path');
const core = require('./lib/core.js');
const glossary = require('./glossary.json');
const L = core.createLinter(glossary);

const argv = process.argv.slice(2);
const flags = {};
const pos = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--no-spacing') flags.spacing = false;
  else if (a.startsWith('--')) { flags[a.slice(2)] = argv[i + 1]; i++; }
  else pos.push(a);
}
const opts = { variant: flags.variant, spacing: flags.spacing };
const cmd = pos[0];

function die(msg) { console.error('zhlint: ' + msg); process.exit(2); }
function read(p) { try { return fs.readFileSync(p, 'utf8'); } catch (e) { die('cannot read ' + p); } }
function isJson(p) { return /\.json$/i.test(p); }

function help() {
  console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(2, 11).map((l) => l.replace(/^ \* ?/, '')).join('\n'));
}

if (!cmd || cmd === 'help' || cmd === '--help') { help(); process.exit(0); }

if (cmd === 'check') {
  const [, src, tgt] = pos;
  if (!src || !tgt) die('usage: check <source> <target>');
  let rep;
  if (isJson(src)) {
    let a, b;
    try { a = JSON.parse(read(src)); b = JSON.parse(read(tgt)); } catch (e) { die('invalid JSON: ' + e.message); }
    rep = L.lintJson(a, b, opts);
  } else {
    rep = L.lintMarkdown(read(src), read(tgt), opts);
  }
  console.log(core.formatReport(rep, flags.format || 'text', path.basename(src) + ' → ' + path.basename(tgt)));
  const min = flags['min-score'] ? Number(flags['min-score']) : null;
  process.exit(rep.summary.errors > 0 || (min !== null && rep.summary.score < min) ? 1 : 0);
}

if (cmd === 'lint') {
  const f = pos[1];
  if (!f) die('usage: lint <chinese.md|json>');
  let text = read(f);
  if (isJson(f)) { try { text = Object.values(core.flatten(JSON.parse(text))).join('\n'); } catch (e) { die('invalid JSON: ' + e.message); } }
  const rep = L.lintZh(text, opts);
  console.log(core.formatReport(rep, flags.format || 'text', path.basename(f)));
  process.exit(rep.summary.errors > 0 ? 1 : 0);
}

if (cmd === 'fix') {
  const tgt = pos[1];
  if (!tgt) die('usage: fix <target> [--out file]');
  let res;
  if (isJson(tgt)) {
    let obj;
    try { obj = JSON.parse(read(tgt)); } catch (e) { die('invalid JSON: ' + e.message); }
    res = L.fixJson(obj, opts);
    res.value = JSON.stringify(res.value, null, 2) + '\n';
  } else {
    res = L.fixMarkdown(read(tgt), opts);
  }
  if (flags.out) { fs.writeFileSync(flags.out, res.value); }
  else process.stdout.write(res.value);
  const summary = Object.keys(res.changes).map((k) => k + '×' + res.changes[k]).join(', ') || 'nothing to fix';
  console.error('zhlint fix: ' + summary + (flags.out ? ' → ' + flags.out : ''));
  process.exit(0);
}

if (cmd === 'text') {
  const [, src, tgt] = pos;
  if (src === undefined || tgt === undefined) die('usage: text "<english>" "<中文>"');
  const issues = L.lintPair(src, tgt, opts);
  const rep = { tool: 'web3-zh-kit', version: core.VERSION, mode: 'text', variant: opts.variant || core.detectVariant(tgt), summary: L.summarize(issues), issues };
  console.log(core.formatReport(rep, flags.format || 'text'));
  const fixed = core.fixText(tgt, opts);
  if (fixed.text !== tgt) console.log('suggested fix: ' + fixed.text);
  process.exit(rep.summary.errors > 0 ? 1 : 0);
}

if (cmd === 'term') {
  const q = pos.slice(1).join(' ');
  const hits = L.lookup(q);
  if (!hits.length) { console.log('no glossary entry for "' + q + '"'); process.exit(1); }
  hits.forEach((t) => {
    const pref = opts.variant === 'zh-TW' ? t.zh_tw : t.zh_cn;
    console.log(`${t.en}${t.aliases ? ' (' + t.aliases.join(', ') + ')' : ''}\n  → ${pref}   [zh-CN ${t.zh_cn} · zh-TW ${t.zh_tw}]` +
      (t.keep_en ? '\n  ✓ 可保留英文 / English OK' : '') +
      (t.alt ? '\n  也可 alt: ' + t.alt.join('、') : '') +
      (t.avoid ? '\n  ✗ 避免 avoid: ' + t.avoid.join('、') : '') +
      (t.note ? '\n  注 note: ' + t.note : ''));
  });
  process.exit(0);
}

if (cmd === 'stats') {
  const cats = {};
  glossary.terms.forEach((t) => { cats[t.cat] = (cats[t.cat] || 0) + 1; });
  const avoid = glossary.terms.reduce((n, t) => n + (t.avoid ? t.avoid.length : 0), 0);
  console.log(`web3-zh-kit ${core.VERSION} · ${glossary.terms.length} terms · ${avoid} known mistranslations\n` +
    Object.keys(cats).map((c) => `  ${c}: ${cats[c]}`).join('\n'));
  process.exit(0);
}

die('unknown command "' + cmd + '" (try: check, fix, text, term, stats)');
