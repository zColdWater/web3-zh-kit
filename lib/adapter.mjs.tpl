// ---------------------------------------------------------------- HTTP adapter
// Pure handlers: handler(params, env) -> { status, body }. status >= 400 means "do not charge".
// routes(prefix) returns ROUTES-shaped entries (price in USDC base units, validate(URLSearchParams), handler)
// so an x402 gateway (e.g. f09 Bolt's paidRoute) can mount them without touching payment code.
const L = ZHKitCore.createLinter(GLOSSARY);
const MAX_TEXT = 4000;

function readText(sp, name, required) {
  const v = sp.get(name);
  if (v === null || v === '') return required ? { error: 'missing_' + name, message: 'Query parameter ' + name + ' is required.' } : { value: null };
  if (v.length > MAX_TEXT) return { error: 'too_long', message: name + ' must be at most ' + MAX_TEXT + ' characters.' };
  return { value: v };
}
function readVariant(sp) {
  const v = sp.get('variant');
  if (!v) return { value: null };
  const n = v.replace('_', '-').toLowerCase();
  if (n === 'zh-cn' || n === 'zh-hans') return { value: 'zh-CN' };
  if (n === 'zh-tw' || n === 'zh-hant') return { value: 'zh-TW' };
  return { error: 'bad_variant', message: 'variant must be zh-CN or zh-TW' };
}
function asJsonObject(s) {
  if (!s || s.trim()[0] !== '{') return null;
  try { const o = JSON.parse(s); return o && typeof o === 'object' && !Array.isArray(o) ? o : null; } catch (_) { return null; }
}

const handlers = {
  check(p) {
    const opts = { variant: p.variant || undefined, spacing: p.spacing };
    const srcObj = asJsonObject(p.source), tgtObj = asJsonObject(p.target);
    let report;
    if (srcObj && tgtObj) report = L.lintJson(srcObj, tgtObj, opts);
    else if (p.markdown) report = L.lintMarkdown(p.source, p.target, opts);
    else {
      const issues = L.lintPair(p.source, p.target, opts);
      report = { tool: 'web3-zh-kit', version: ZHKitCore.VERSION, mode: 'text', variant: opts.variant || ZHKitCore.detectVariant(p.target), summary: L.summarize(issues), issues };
    }
    const body = { ...report, suggested_fix: null };
    if (!srcObj && !p.markdown) { const f = ZHKitCore.fixText(p.target, opts); if (f.text !== p.target) body.suggested_fix = f.text; }
    return { status: 200, body };
  },
  fix(p) {
    const r = ZHKitCore.fixText(p.text, { variant: p.variant || undefined, spacing: p.spacing });
    return { status: 200, body: { text: r.text, changed: r.text !== p.text, changes: r.changes } };
  },
  term(p) {
    const hits = L.lookup(p.q, { limit: 5 });
    if (!hits.length) return { status: 404, body: { error: 'not_found', message: 'No glossary entry for "' + p.q + '"' } };
    return { status: 200, body: { query: p.q, results: hits.map((t) => ({ en: t.en, aliases: t.aliases || [], preferred: p.variant === 'zh-TW' ? t.zh_tw : t.zh_cn,
      zh_cn: t.zh_cn, zh_tw: t.zh_tw, keep_english_ok: !!t.keep_en, also_ok: t.alt || [], avoid: t.avoid || [], note: t.note || null, category: t.cat })) } };
  },
};

function routes(prefix) {
  prefix = prefix || '/api/zh';
  const paid = {};
  paid[prefix + '/check'] = {
    price: '2000', // $0.002
    title: 'Web3 Chinese Localization QA',
    description: 'Deterministic QA for English→Chinese (zh-CN / zh-TW) Web3 translations: broken placeholders ({x}, {{x}}, %s, ICU plural), HTML tags, URLs, 0x addresses, ENS names, 175-term Web3 glossary (catches howlers like staking→押注, Base→基地, gas→汽油, seed phrase→种子短语), Simplified/Traditional mixing, mainland vs Taiwan wording, Chinese typography. Pass two strings or two i18n JSON objects. No LLM; same input, same output.',
    tags: ['localization', 'translation', 'chinese', 'i18n', 'qa', 'web3'],
    queryParams: {
      source: { type: 'string', required: true, description: 'English source string, or an i18n JSON object (as a string) — max 4000 chars', example: 'Staking rewards on Base' },
      target: { type: 'string', required: true, description: 'Chinese translation, or the matching i18n JSON object — max 4000 chars', example: '基地上的押注奖励' },
      variant: { type: 'string', enum: ['zh-CN', 'zh-TW'], description: 'Target variant (auto-detected if omitted)', example: 'zh-CN' },
      markdown: { type: 'boolean', description: '1 = treat source/target as Markdown documents', example: 0 },
      spacing: { type: 'boolean', description: '0 = do not require spaces between Chinese and Latin text', example: 1 },
    },
    outputExample: { mode: 'text', variant: 'zh-CN', summary: { errors: 1, warnings: 1, info: 0, score: 90 },
      issues: [{ rule: 'glossary-avoid', severity: 'error', term: 'Base', message: '「Base」疑似误译为「基地」，建议「Base」 · likely mistranslation' },
        { rule: 'glossary-avoid', severity: 'warning', term: 'staking', message: '「Staking」疑似误译为「押注」，建议「质押」 · likely mistranslation' }],
      suggested_fix: null },
    validate(sp) {
      const s = readText(sp, 'source', true); if (s.error) return s;
      const t = readText(sp, 'target', true); if (t.error) return t;
      const v = readVariant(sp); if (v.error) return v;
      return { source: s.value, target: t.value, variant: v.value, markdown: sp.get('markdown') === '1' || sp.get('markdown') === 'true', spacing: sp.get('spacing') === '0' || sp.get('spacing') === 'false' ? false : undefined };
    },
    handler: (p) => handlers.check(p),
  };
  paid[prefix + '/fix'] = {
    price: '1000', // $0.001
    title: 'Chinese Typography Fixer',
    description: 'Fixes Chinese typography without touching code, URLs, addresses or placeholders: half-width → full-width punctuation, spaces between Chinese and Latin/digits, Chinese ellipsis and dash, full-width letters/digits, Chinese quotes. Returns the fixed text and a change log.',
    tags: ['chinese', 'typography', 'localization', 'i18n'],
    queryParams: {
      text: { type: 'string', required: true, description: 'Chinese text to fix (max 4000 chars)', example: '完成!在BaseScan上查看.' },
      variant: { type: 'string', enum: ['zh-CN', 'zh-TW'], description: 'zh-TW uses 「」 quotes', example: 'zh-CN' },
      spacing: { type: 'boolean', description: '0 = do not insert spaces between Chinese and Latin text', example: 1 },
    },
    outputExample: { text: '完成！在 BaseScan 上查看。', changed: true, changes: { 'halfwidth-punct': 2, 'cjk-latin-spacing': 2 } },
    validate(sp) {
      const t = readText(sp, 'text', true); if (t.error) return t;
      const v = readVariant(sp); if (v.error) return v;
      return { text: t.value, variant: v.value, spacing: sp.get('spacing') === '0' || sp.get('spacing') === 'false' ? false : undefined };
    },
    handler: (p) => handlers.fix(p),
  };
  const free = {};
  free[prefix + '/term'] = {
    title: 'Web3 EN↔ZH glossary lookup (free)',
    validate(sp) {
      const q = (sp.get('q') || '').trim();
      if (!q) return { error: 'missing_q', message: 'Query parameter q is required.' };
      if (q.length > 80) return { error: 'too_long', message: 'q must be at most 80 characters.' };
      const v = readVariant(sp); if (v.error) return v;
      return { q, variant: v.value };
    },
    handler: (p) => handlers.term(p),
  };
  return { paid, free };
}

// Standalone mode (no payments) — for local testing or a free demo deployment.
async function fetchFree(request) {
  const url = new URL(request.url);
  const all = routes('/api/zh');
  const route = all.paid[url.pathname] || all.free[url.pathname];
  const headers = { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' };
  if (!route) return new Response(JSON.stringify({ name: 'web3-zh-kit', version: ZHKitCore.VERSION, terms: GLOSSARY.terms.length,
    endpoints: Object.keys(all.paid).concat(Object.keys(all.free)) }, null, 2), { status: url.pathname === '/' ? 200 : 404, headers });
  const p = route.validate(url.searchParams);
  if (p.error) return new Response(JSON.stringify(p), { status: 400, headers });
  const r = await route.handler(p);
  return new Response(JSON.stringify(r.body, null, 2), { status: r.status, headers });
}

export const zh = { version: ZHKitCore.VERSION, core: ZHKitCore, linter: L, handlers, routes, fetchFree };
export default { fetch: fetchFree };
