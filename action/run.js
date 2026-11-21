#!/usr/bin/env node
// GitHub Action entry point (composite action, runs on the runner's own Node; zero dependencies).
// Inputs arrive as ZHKIT_* environment variables (see action.yml) — never interpolated into a shell.
'use strict';
const fs = require('fs');
const path = require('path');
const core = require('../lib/core.js');
const glossary = require('../glossary.json');
const L = core.createLinter(glossary);

const env = process.env;
const cwd = env.GITHUB_WORKSPACE || process.cwd();
const truthy = (v, d) => (v == null || v === '' ? d : !/^(false|0|no|off)$/i.test(String(v).trim()));
const source = (env.ZHKIT_SOURCE || '').trim();
const targetsRaw = (env.ZHKIT_TARGET || '').split(/\s+/).filter(Boolean);
const variant = (env.ZHKIT_VARIANT || '').trim();
const minScore = (env.ZHKIT_MIN_SCORE || '').trim() === '' ? null : Number(env.ZHKIT_MIN_SCORE);
const spacing = truthy(env.ZHKIT_SPACING, true);
const failOn = truthy(env.ZHKIT_FAIL, true);

// GitHub workflow-command escaping (https://github.com/actions/toolkit — issueCommand)
const escData = (s) => String(s).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
const escProp = (s) => escData(s).replace(/:/g, '%3A').replace(/,/g, '%2C');
function out(name, value) { if (env.GITHUB_OUTPUT) fs.appendFileSync(env.GITHUB_OUTPUT, name + '=' + value + '\n'); }
function summary(md) { if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY, md + '\n'); }
function die(msg) { console.log('::error title=web3-zh-kit::' + escData(msg)); process.exit(2); }

if (!source) die('input "source" is required');
if (!targetsRaw.length) die('input "target" is required');
if (variant && !/^zh-(CN|TW)$/.test(variant)) die('variant must be zh-CN or zh-TW');
if (minScore !== null && !(minScore >= 0 && minScore <= 100)) die('min-score must be a number from 0 to 100');

function inside(p) { const abs = path.resolve(cwd, p); if (abs !== cwd && !abs.startsWith(cwd + path.sep)) die('path outside the workspace: ' + p); return abs; }
function expand(p) {
  if (!p.includes('*')) return [p];
  const dir = path.dirname(p), base = path.basename(p);
  if (dir.includes('*')) die('* is only allowed in the file name: ' + p);
  const re = new RegExp('^' + base.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*') + '$');
  let names = [];
  try { names = fs.readdirSync(inside(dir)); } catch (e) { die('cannot list ' + dir); }
  return names.filter((n) => re.test(n)).sort().map((n) => path.join(dir, n));
}
const srcAbs = inside(source);
const targets = [...new Set(targetsRaw.flatMap(expand))].filter((p) => path.resolve(cwd, p) !== srcAbs);
if (!targets.length) die('no target files matched: ' + targetsRaw.join(' '));

function read(p) { try { return fs.readFileSync(inside(p), 'utf8'); } catch (e) { die('cannot read ' + p); } }
const isJson = (p) => /\.json$/i.test(p);
const srcText = read(source);
let srcJson = null;
if (isJson(source)) { try { srcJson = JSON.parse(srcText); } catch (e) { die(source + ' is not valid JSON: ' + e.message); } }

// best-effort line lookup for a flattened JSON key like "a.b[2].c": walk the path segment by segment through the file
function lineOfKey(text, key) {
  const segs = String(key).replace(/\[\d+\]/g, '').split('.').filter(Boolean);
  const lines = text.split('\n');
  let at = 0, found = 0;
  for (const seg of segs) {
    const re = new RegExp(JSON.stringify(seg).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*:');
    let i = at;
    while (i < lines.length && !re.test(lines[i])) i++;
    if (i >= lines.length) return found;
    found = i + 1; at = i + 1;
  }
  return found;
}

let totalErr = 0, totalWarn = 0, lowest = 100, failed = false;
const rows = [];
summary('## web3-zh-kit · Chinese localization QA\n');
for (const tgt of targets) {
  const tgtText = read(tgt);
  const opts = { variant: variant || undefined, spacing: spacing ? undefined : false };
  let rep;
  if (srcJson && isJson(tgt)) {
    let tj; try { tj = JSON.parse(tgtText); } catch (e) { console.log('::error file=' + escProp(tgt) + ',title=web3-zh-kit::' + escData('invalid JSON: ' + e.message)); failed = true; totalErr++; rows.push('| `' + tgt + '` | – | invalid JSON | |'); continue; }
    rep = L.lintJson(srcJson, tj, opts);
  } else rep = L.lintMarkdown(srcText, tgtText, opts);
  const s = rep.summary;
  totalErr += s.errors; totalWarn += s.warnings; lowest = Math.min(lowest, s.score);
  const bad = s.errors > 0 || (minScore !== null && s.score < minScore);
  if (bad) failed = true;
  rows.push('| `' + tgt + '` | ' + rep.variant + ' | **' + s.score + '** | ' + s.errors + ' / ' + s.warnings + ' / ' + s.info + ' |' + (bad ? ' ❌' : ' ✅'));
  console.log('web3-zh-kit: ' + tgt + ' (' + rep.variant + ') score ' + s.score + ' · ' + s.errors + ' errors · ' + s.warnings + ' warnings · ' + s.info + ' info');
  rep.issues.filter((i) => i.severity !== 'info').slice(0, 100).forEach((i) => {
    const line = i.line || (i.key ? lineOfKey(tgtText, i.key) : 0);
    const props = 'file=' + escProp(tgt) + (line ? ',line=' + line : '') + ',title=' + escProp('web3-zh-kit ' + i.rule);
    console.log('::' + (i.severity === 'error' ? 'error' : 'warning') + ' ' + props + '::' + escData((i.key ? i.key + ': ' : '') + i.message + (i.sample ? ' «' + i.sample + '»' : '')));
  });
  summary('<details' + (bad ? ' open' : '') + '><summary><code>' + tgt + '</code> — ' + s.score + '/100</summary>\n\n' + core.formatReport(rep, 'md', path.basename(source) + ' → ' + path.basename(tgt)) + '\n\n</details>\n');
}
summary('| file | variant | score | errors / warnings / info |\n|---|---|---|---|\n' + rows.join('\n') + '\n\n<sub>web3-zh-kit ' + core.VERSION + ' · deterministic rules, no LLM · built by 小鹿 (f06), an AI localization agent</sub>');
out('score', lowest); out('errors', totalErr); out('warnings', totalWarn);
if (failed && failOn) { console.log('web3-zh-kit: failing' + (minScore !== null ? ' (errors or score < ' + minScore + ')' : ' (errors found)')); process.exit(1); }
