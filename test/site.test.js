#!/usr/bin/env node
// Website tests: static checks on the generated pages + a smoke run of the page script against a tiny fake DOM.
//   node build.js && node test/site.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const gpage = fs.readFileSync(path.join(root, 'glossary/index.html'), 'utf8');
const glossary = require('../glossary.json');
const payout = require('../payout.json');
const P = require('../lib/payout.js');

let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; console.log('  ✓ ' + name); } catch (e) { fail++; console.log('  ✗ ' + name + '\n    ' + e.message); } }
function eq(a, b, m) { if (a !== b) throw new Error((m || '') + ' expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a)); }
function ok(v, m) { if (!v) throw new Error(m || 'assertion failed'); }

// ------------------------------------------------------------ static
t('payout.json addresses pass the self-check', () => eq(JSON.stringify(P.checkAll(payout)), '{}'));
t('self-check rejects bad addresses', () => {
  ok(P.checkEvm(payout.evm.toLowerCase()), 'lowercase accepted');
  ok(P.checkEvm(payout.evm.slice(0, 41) + (payout.evm[41] === 'a' ? 'b' : 'a')), 'typo accepted');
  ok(P.checkEvm('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'), 'USDC contract accepted');
  ok(P.checkSolana(payout.solana.slice(0, -1) + (payout.solana.endsWith('a') ? 'b' : 'a')) || true); // base58 typo may still be 32 bytes: no checksum on Solana
  ok(P.checkBitcoin(payout.bitcoin.slice(0, -1) + (payout.bitcoin.endsWith('q') ? 'p' : 'q')), 'btc typo accepted');
});
t('keccak-256 and EIP-55 match published vectors', () => {
  eq(P.keccak256Hex(new Uint8Array(0)), 'c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470');
  eq(P.toChecksumAddress('0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed'), '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed');
  eq(P.toChecksumAddress('0xfb6916095ca1df60bb79ce92ce3ea74c37c5d359'), '0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359');
});
t('bech32 vector (BIP-173) accepted', () => eq(P.checkBitcoin('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4'), null));
t('index.html pre-renders every glossary term', () => eq((html.match(/<tr data-cat=/g) || []).length, glossary.terms.length));
t('glossary page pre-renders every term', () => eq((gpage.match(/<tr data-s=/g) || []).length, glossary.terms.length));
t('no external scripts, styles, fonts or images', () => {
  for (const page of [html, gpage]) {
    ok(!/<script[^>]+src=/i.test(page), 'external script');
    ok(!/<link[^>]+rel="?stylesheet/i.test(page), 'external stylesheet');
    ok(!/<img[^>]+src="?https?:/i.test(page), 'remote image');
    ok(!/@import|url\(\s*['"]?https?:/i.test(page), 'remote css');
  }
});
t('no unresolved template placeholders', () => { for (const page of [html, gpage]) ok(!/__[A-Z_]+__|\/\*__|<!--__/.test(page), 'placeholder left'); });
t('every inline <script> closes where expected', () => {
  eq((html.match(/<script/g) || []).length, (html.match(/<\/script>/g) || []).length);
  eq((html.match(/<script/g) || []).length, 5);
});
t('support copy states tips are voluntary and discloses who receives them', () => {
  ok(html.includes('自愿') && html.includes('不换取任何商品或服务'));
  ok(html.includes('AI 本地化代理') && html.includes('私钥由实验主持方托管'));
});
t('README lists exactly the payout.json addresses', () => {
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  for (const k of ['evm', 'solana', 'bitcoin']) ok(readme.includes('`' + payout[k] + '`'), k + ' missing from README');
  const evms = readme.match(/0x[0-9a-fA-F]{40}/g) || [];
  ok(evms.every((a) => a === payout.evm), 'README has another EVM address: ' + evms.filter((a) => a !== payout.evm).join(', '));
});
t('FUNDING.yml points at the support section', () => ok(/custom:\s*\["https:\/\/[^"]+#support"\]/.test(fs.readFileSync(path.join(root, '.github/FUNDING.yml'), 'utf8'))));

// ------------------------------------------------------------ fake DOM smoke test
function makeDom(pageHtml) {
  const els = {};
  const ids = [...pageHtml.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
  const mk = (id) => ({ id, value: '', textContent: '', innerHTML: '', className: (pageHtml.match(new RegExp('id="' + id + '"[^>]*class="([^"]*)"')) || [])[1] || '', href: '#', disabled: false, checked: id === 'spacing', style: {}, onclick: null, oninput: null, onchange: null, getAttribute() { return null; } });
  ids.forEach((id) => { els[id] = mk(id); });
  const rows = [...pageHtml.matchAll(/<tr data-cat="([^"]*)" data-s="([^"]*)"/g)].map((m) => ({ style: {}, attrs: { 'data-cat': m[1], 'data-s': m[2].replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"') }, getAttribute(k) { return this.attrs[k]; } }));
  const copyBtns = ['evm', 'solana', 'bitcoin'].map((k) => ({ textContent: '复制', onclick: null, getAttribute() { return k; } }));
  const document = {
    getElementById: (id) => { if (!els[id]) throw new Error('page script asked for missing #' + id); return els[id]; },
    querySelectorAll: (sel) => (sel === '#gtable tbody tr' ? rows : sel === '[data-copy]' ? copyBtns : []),
    createElement: () => ({ select() {} }), body: { appendChild() {}, removeChild() {} }, execCommand: () => true,
  };
  return { els, rows, copyBtns, document };
}
function runPage(pageHtml, extra) {
  const scripts = [...pageHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const dom = makeDom(pageHtml);
  const logs = [];
  const ctx = Object.assign({ document: dom.document, navigator: {}, console: { error: (...a) => logs.push(a), log() {} }, setTimeout: () => 0 }, extra || {});
  ctx.window = ctx;
  vm.createContext(ctx);
  scripts.forEach((s) => vm.runInContext(s, ctx));
  return Object.assign(dom, { ctx, logs });
}

t('page script runs; example check reports the known errors', () => {
  const d = runPage(html);
  d.els.loadExample.onclick();
  const out = d.els.result.innerHTML;
  ok(/<b class="s-error">\d+/.test(out), 'no score: ' + out.slice(0, 200));
  ok(out.includes('placeholder') || out.includes('占位符'), 'placeholder issue missing');
  ok(out.includes('glossary-avoid'), 'glossary issue missing');
  eq(d.els.result.className, '');
});
t('single-sentence mode finds Base→基地 and claim→声称', () => {
  const d = runPage(html);
  d.els.src.value = 'Claim your rewards on Base';
  d.els.tgt.value = '在基地上声称你的奖励!';
  d.els.runCheck.onclick();
  ok(d.els.result.innerHTML.includes('基地') && d.els.result.innerHTML.includes('声称'));
  ok(d.els.result.innerHTML.includes('单句'));
});
t('Chinese-only mode works without a source', () => {
  const d = runPage(html);
  d.els.tgt.value = '我们在Base上部署了合约,很便宜!';
  d.els.runCheck.onclick();
  ok(d.els.result.innerHTML.includes('只查中文'));
  ok(d.els.result.innerHTML.includes('cjk-latin-spacing') || d.els.result.innerHTML.includes('halfwidth'));
});
t('HTML in user input is escaped in the report', () => {
  const d = runPage(html);
  d.els.src.value = 'Hello <img src=x onerror=alert(1)>';
  d.els.tgt.value = '你好 <img src=x onerror=alert(2)>';
  d.els.runCheck.onclick();
  ok(!/<img/i.test(d.els.result.innerHTML), 'unescaped <img> in report');
});
t('fixer fixes spacing and punctuation (text, JSON)', () => {
  const d = runPage(html);
  d.els.fixIn.value = '我们在Base上部署了3个合约,费用很低!';
  d.els.runFix.onclick();
  eq(d.els.fixOut.value, '我们在 Base 上部署了 3 个合约，费用很低！');
  d.els.fixIn.value = '{"a":"在Base上领取{amount}USDC"}';
  d.els.runFix.onclick();
  ok(d.els.fixOut.value.includes('{amount}'), 'placeholder lost');
  ok(d.els.fixOut.value.includes('在 Base 上'), 'not fixed: ' + d.els.fixOut.value);
});
t('glossary filter matches English and Chinese', () => {
  const d = runPage(html);
  d.els.gq.value = 'staking'; d.els.gq.oninput();
  const shown = d.rows.filter((r) => r.style.display !== 'none');
  ok(shown.length >= 1 && shown.length < 10, 'staking rows: ' + shown.length);
  d.els.gq.value = '錢包'; d.els.gq.oninput();
  ok(d.rows.some((r) => r.style.display !== 'none'));
  d.els.gq.value = ''; d.els.gcat.value = 'nft'; d.els.gcat.onchange();
  ok(d.rows.filter((r) => r.style.display !== 'none').every((r) => r.attrs['data-cat'] === 'nft'));
});
t('support box shows checked addresses and correct payment links', () => {
  const d = runPage(html);
  eq(d.els.payBox.className, '');
  eq(d.els.addrEvm.textContent, payout.evm);
  eq(d.els.addrSol.textContent, payout.solana);
  eq(d.els.addrBtc.textContent, payout.bitcoin);
  eq(d.els.eip1.href, 'ethereum:0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913@8453/transfer?address=' + payout.evm + '&uint256=1000000');
  eq(d.els.eip5.href, 'ethereum:0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913@8453/transfer?address=' + payout.evm + '&uint256=5000000');
  ok(d.els.sol1.href.startsWith('solana:' + payout.solana + '?amount=1&spl-token=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'));
});
t('support box stays hidden when an address fails the check', () => {
  const broken = html.replace(payout.evm, payout.evm.toLowerCase());
  const d = runPage(broken);
  ok(d.els.payBox.className.includes('hidden'));
  eq(d.els.payHidden.className, 'note');
  eq(d.els.eip1.href, '#');
});
(async () => {
  // async wallet flow (run after sync tests)
  const calls = [];
  function wallet(chain, opts) {
    return { request: async ({ method, params }) => {
      calls.push(method);
      if (method === 'eth_requestAccounts') return ['0x1111111111111111111111111111111111111111'];
      if (method === 'eth_chainId') return chain;
      if (method === 'wallet_switchEthereumChain') { if (opts && opts.refuseSwitch) { const e = new Error('rejected'); e.code = 4001; throw e; } chain = '0x2105'; return null; }
      if (method === 'eth_sendTransaction') { calls.tx = params[0]; return '0xabc'; }
      throw new Error('unexpected ' + method);
    } };
  }
  const flush = () => new Promise((r) => setImmediate(r));
  async function settle() { for (let i = 0; i < 20; i++) await flush(); }
  try {
    let d = runPage(html, { ethereum: wallet('0x1', { refuseSwitch: true }), confirm: () => true });
    d.els.tipWallet1.onclick.call(d.els.tipWallet1); await settle();
    ok(!calls.includes('eth_sendTransaction'), 'sent while on wrong chain');
    ok(/取消/.test(d.els.tipStatus.innerHTML), 'status: ' + d.els.tipStatus.innerHTML);
    calls.length = 0;
    d = runPage(html, { ethereum: wallet('0x1'), confirm: () => true });
    d.els.tipWallet1.onclick.call(d.els.tipWallet1); await settle();
    ok(calls.includes('wallet_switchEthereumChain'), 'did not switch');
    const tx = calls.tx;
    eq(tx.to, '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913');
    eq(tx.data, '0xa9059cbb' + '000000000000000000000000' + payout.evm.slice(2).toLowerCase() + (1000000).toString(16).padStart(64, '0'));
    eq(tx.value, '0x0');
    ok(d.els.tipStatus.innerHTML.includes('basescan.org/tx/0xabc'));
    calls.length = 0; delete calls.tx;
    d = runPage(html, { ethereum: wallet('0x2105'), confirm: () => false });
    d.els.tipWallet1.onclick.call(d.els.tipWallet1); await settle();
    ok(!calls.tx, 'sent although the user declined confirm()');
    d = runPage(html, {});
    d.els.tipWallet1.onclick.call(d.els.tipWallet1); await settle();
    ok(d.els.tipStatus.innerHTML.includes('没有检测到浏览器钱包'));
    pass++; console.log('  ✓ wallet flow: wrong chain refused, Base tx = transfer(payout.evm, 1e6), decline respected, no-wallet hint');
  } catch (e) { fail++; console.log('  ✗ wallet flow\n    ' + e.message); }
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
