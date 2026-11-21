/*
 * web3-zh-kit · payout address self-check (zero dependencies, Node + browser).
 * The support box on the website is shown ONLY when every address passes these checks:
 *   EVM      — 0x + 40 hex, valid EIP-55 mixed-case checksum (keccak-256), not a known token/zero/burn address
 *   Solana   — base58, decodes to exactly 32 bytes
 *   Bitcoin  — bech32 (BIP-173) mainnet segwit v0, valid checksum, 20- or 32-byte program
 * Author: f06 小鹿 (AI localization agent). License: MIT.
 */
var ZHKitPayout = (function () {
  'use strict';

  // ---------------------------------------------------------------- keccak-256 (original Keccak padding 0x01, not SHA3)
  var M64 = (BigInt(1) << BigInt(64)) - BigInt(1);
  var RC = ['0x1', '0x8082', '0x800000000000808a', '0x8000000080008000', '0x808b', '0x80000001', '0x8000000080008081', '0x8000000000008009',
    '0x8a', '0x88', '0x80008009', '0x8000000a', '0x8000808b', '0x800000000000008b', '0x8000000000008089', '0x8000000000008003',
    '0x8000000000008002', '0x8000000000000080', '0x800a', '0x800000008000000a', '0x8000000080008081', '0x8000000000008080', '0x80000001', '0x8000000080008008'].map(BigInt);
  var ROT = [0, 1, 62, 28, 27, 36, 44, 6, 55, 20, 3, 10, 43, 25, 39, 41, 45, 15, 21, 8, 18, 2, 61, 56, 14];
  function rotl(v, n) { return n === 0 ? v : ((v << BigInt(n)) | (v >> BigInt(64 - n))) & M64; }
  function keccakF(A) {
    for (var r = 0; r < 24; r++) {
      var C = [], x, y;
      for (x = 0; x < 5; x++) C[x] = A[x] ^ A[x + 5] ^ A[x + 10] ^ A[x + 15] ^ A[x + 20];
      for (x = 0; x < 5; x++) { var D = C[(x + 4) % 5] ^ rotl(C[(x + 1) % 5], 1); for (y = 0; y < 5; y++) A[x + 5 * y] ^= D; }
      var B = new Array(25);
      for (x = 0; x < 5; x++) for (y = 0; y < 5; y++) B[y + 5 * ((2 * x + 3 * y) % 5)] = rotl(A[x + 5 * y], ROT[x + 5 * y]);
      for (x = 0; x < 5; x++) for (y = 0; y < 5; y++) A[x + 5 * y] = (B[x + 5 * y] ^ ((~B[(x + 1) % 5 + 5 * y] & M64) & B[(x + 2) % 5 + 5 * y])) & M64;
      A[0] ^= RC[r];
    }
  }
  function keccak256Hex(bytes) {
    var rate = 136, len = bytes.length, padLen = rate - (len % rate);
    var p = new Uint8Array(len + padLen); p.set(bytes); p[len] ^= 0x01; p[p.length - 1] ^= 0x80;
    var A = []; for (var i = 0; i < 25; i++) A.push(BigInt(0));
    for (var off = 0; off < p.length; off += rate) {
      for (var w = 0; w < rate / 8; w++) {
        var v = BigInt(0);
        for (var b = 7; b >= 0; b--) v = (v << BigInt(8)) | BigInt(p[off + w * 8 + b]);
        A[w] ^= v;
      }
      keccakF(A);
    }
    var hex = '';
    for (var k = 0; k < 4; k++) { var lane = A[k]; for (var j = 0; j < 8; j++) { var byte = Number((lane >> BigInt(8 * j)) & BigInt(255)); hex += (byte < 16 ? '0' : '') + byte.toString(16); } }
    return hex;
  }
  function ascii(s) { var u = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 0xff; return u; }

  function toChecksumAddress(addr) {
    var a = String(addr).replace(/^0x/i, '').toLowerCase();
    var h = keccak256Hex(ascii(a)), out = '0x';
    for (var i = 0; i < 40; i++) out += parseInt(h[i], 16) >= 8 ? a[i].toUpperCase() : a[i];
    return out;
  }

  var EVM_DENY = {
    '0x0000000000000000000000000000000000000000': 'zero address',
    '0x000000000000000000000000000000000000dead': 'burn address',
    '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': 'USDC token contract (Base)',
    '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': 'USDC token contract (Ethereum)',
    '0x4200000000000000000000000000000000000006': 'WETH contract (Base)'
  };
  function checkEvm(addr) {
    if (typeof addr !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(addr)) return 'not a 0x + 40-hex address';
    if (EVM_DENY[addr.toLowerCase()]) return EVM_DENY[addr.toLowerCase()];
    if (addr === addr.toLowerCase() || addr === '0x' + addr.slice(2).toUpperCase()) return 'no EIP-55 checksum (single case)';
    if (toChecksumAddress(addr) !== addr) return 'EIP-55 checksum mismatch';
    return null;
  }

  // ---------------------------------------------------------------- Solana: base58 → 32 bytes
  var B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  function b58decode(s) {
    var n = BigInt(0);
    for (var i = 0; i < s.length; i++) { var d = B58.indexOf(s[i]); if (d < 0) return null; n = n * BigInt(58) + BigInt(d); }
    var bytes = [];
    while (n > BigInt(0)) { bytes.unshift(Number(n % BigInt(256))); n = n / BigInt(256); }
    for (var j = 0; j < s.length && s[j] === '1'; j++) bytes.unshift(0);
    return bytes;
  }
  var SOL_DENY = { '11111111111111111111111111111111': 'System Program', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 'USDC mint', 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA': 'Token Program' };
  function checkSolana(addr) {
    if (typeof addr !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr)) return 'not base58';
    if (SOL_DENY[addr]) return SOL_DENY[addr];
    var b = b58decode(addr);
    if (!b || b.length !== 32) return 'does not decode to 32 bytes';
    return null;
  }

  // ---------------------------------------------------------------- Bitcoin: bech32 (BIP-173), mainnet, witness v0
  var CS = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
  function polymod(values) {
    var GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3], chk = 1;
    for (var i = 0; i < values.length; i++) {
      var top = chk >>> 25; chk = ((chk & 0x1ffffff) << 5) ^ values[i];
      for (var j = 0; j < 5; j++) if ((top >>> j) & 1) chk ^= GEN[j];
    }
    return chk >>> 0;
  }
  function hrpExpand(h) { var r = [], i; for (i = 0; i < h.length; i++) r.push(h.charCodeAt(i) >> 5); r.push(0); for (i = 0; i < h.length; i++) r.push(h.charCodeAt(i) & 31); return r; }
  function checkBitcoin(addr) {
    if (typeof addr !== 'string' || addr !== addr.toLowerCase() || addr.indexOf('bc1') !== 0) return 'not a lowercase bc1 address';
    var pos = addr.lastIndexOf('1'), hrp = addr.slice(0, pos), data = [];
    if (hrp !== 'bc' || addr.length - pos - 1 < 6) return 'bad bech32 layout';
    for (var i = pos + 1; i < addr.length; i++) { var d = CS.indexOf(addr[i]); if (d < 0) return 'bad bech32 character'; data.push(d); }
    if (polymod(hrpExpand(hrp).concat(data)) !== 1) return 'bech32 checksum mismatch (or bech32m)';
    if (data[0] !== 0) return 'only witness v0 (bc1q…) is accepted here';
    var acc = 0, bits = 0, prog = [];
    for (var k = 1; k < data.length - 6; k++) { acc = (acc << 5) | data[k]; bits += 5; while (bits >= 8) { bits -= 8; prog.push((acc >> bits) & 255); } }
    if (bits >= 5 || ((acc << (8 - bits)) & 255)) return 'bad padding';
    if (prog.length !== 20 && prog.length !== 32) return 'witness program must be 20 or 32 bytes';
    return null;
  }

  function checkAll(p) {
    p = p || {};
    var problems = {};
    var e = checkEvm(p.evm); if (e) problems.evm = e;
    var s = checkSolana(p.solana); if (s) problems.solana = s;
    var b = checkBitcoin(p.bitcoin); if (b) problems.bitcoin = b;
    return problems;
  }

  return { keccak256Hex: keccak256Hex, toChecksumAddress: toChecksumAddress, checkEvm: checkEvm, checkSolana: checkSolana, checkBitcoin: checkBitcoin, checkAll: checkAll };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = ZHKitPayout;
