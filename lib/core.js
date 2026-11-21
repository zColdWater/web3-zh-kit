/*
 * web3-zh-kit · core
 * Zero-dependency EN→ZH (zh-CN / zh-TW) localization QA for Web3 products.
 * Runs unchanged in Node.js (CommonJS) and Cloudflare Workers / browsers (via build.js bundle).
 * Author: f06 小鹿 (AI localization agent). License: MIT.
 */
var ZHKitCore = (function () {
  'use strict';

  var VERSION = '0.2.0';
  var C = '\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff'; // CJK ideographs
  var ML = '\\uE000-\\uE7FF'; // masks that behave like Latin text (code, URL, email, address)
  var MN = '\\uE800-\\uEFFF'; // neutral masks (placeholders, tags)
  var reHasCJK = new RegExp('[' + C + ']');
  var reCJKg = new RegExp('[' + C + ']', 'g');

  // ---------------------------------------------------------------- utils
  function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function countMap(arr) { var m = {}; arr.forEach(function (x) { m[x] = (m[x] || 0) + 1; }); return m; }
  function diffMulti(a, b) {
    var ma = countMap(a), mb = countMap(b), missing = [], extra = [];
    Object.keys(ma).forEach(function (k) { for (var i = 0; i < ma[k] - (mb[k] || 0); i++) missing.push(k); });
    Object.keys(mb).forEach(function (k) { for (var i = 0; i < mb[k] - (ma[k] || 0); i++) extra.push(k); });
    return { missing: missing, extra: extra };
  }
  function uniq(a) { return a.filter(function (x, i) { return a.indexOf(x) === i; }); }
  function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }

  function flatten(obj, prefix, out) {
    out = out || {};
    if (typeof obj === 'string') { out[prefix || '(root)'] = obj; return out; }
    if (Array.isArray(obj)) { obj.forEach(function (v, i) { flatten(v, prefix ? prefix + '[' + i + ']' : '[' + i + ']', out); }); return out; }
    if (isObj(obj)) { Object.keys(obj).forEach(function (k) { flatten(obj[k], prefix ? prefix + '.' + k : k, out); }); }
    return out;
  }
  function mapStrings(obj, fn, path) {
    path = path || '';
    if (typeof obj === 'string') return fn(obj, path);
    if (Array.isArray(obj)) return obj.map(function (v, i) { return mapStrings(v, fn, path + '[' + i + ']'); });
    if (isObj(obj)) { var o = {}; Object.keys(obj).forEach(function (k) { o[k] = mapStrings(obj[k], fn, path ? path + '.' + k : k); }); return o; }
    return obj;
  }

  // ---------------------------------------------------------------- masking
  // Protected spans are swapped for private-use characters so that text rules never touch them.
  var URL_RE = new RegExp('https?:\\/\\/[^\\s<>()"\'`\\[\\]（）【】，。、；！？「」' + C + ']+', 'g');
  var MASKS = [
    { re: /`[^`\n]+`/g, latin: true },
    { re: URL_RE, latin: true, url: true },
    { re: /(?<=\])\((?:#|\.{0,2}\/)[^()\s]*\)/g, latin: false }, // Markdown link target that is an anchor or relative path: ](#用法)
    { re: /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, latin: true },
    { re: /0x[a-fA-F0-9]{6,}/g, latin: true },
    { re: /<\/?[A-Za-z0-9][\w-]*(?:\s[^<>]*)?\/?>/g, latin: false },
    { re: /\{\{[^{}]*\}\}/g, latin: false },
    { re: /\$\{[^}]*\}/g, latin: false },
    { re: /\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g, latin: false },
    { re: /(?<!\d)%(?:\d+\$)?[-+0#]*\d*(?:\.\d+)?[sdif@]/g, latin: false }
  ];
  function mask(text) {
    var spans = [], nl = 0, nn = 0;
    var out = text;
    MASKS.forEach(function (m) {
      out = out.replace(m.re, function (hit) {
        var trail = '';
        if (m.url) { var mm = /[.,;:!?)]+$/.exec(hit); if (mm) { trail = mm[0]; hit = hit.slice(0, -trail.length); } }
        var code = m.latin ? 0xE000 + (nl++ % 0x800) : 0xE800 + (nn++ % 0x800);
        var ch = String.fromCharCode(code);
        spans.push([ch, hit]);
        return ch + trail;
      });
    });
    return { text: out, spans: spans };
  }
  function unmask(text, spans) {
    for (var i = spans.length - 1; i >= 0; i--) text = text.split(spans[i][0]).join(spans[i][1]);
    return text;
  }

  // ---------------------------------------------------------------- extraction (integrity checks)
  function extractPlaceholders(s) {
    var toks = [];
    s.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, function (_, n) { toks.push('{{' + n + '}}'); return ''; });
    s.replace(/\$\{([^}]*)\}/g, function (_, n) { toks.push('${' + n.trim() + '}'); return ''; });
    s.replace(/(?<!\d)%(?:\d+\$)?[-+0#]*\d*(?:\.\d+)?[sdif@]/g, function (m) { toks.push(m); return ''; });
    // ICU-aware single-brace scan ({name}, {n, plural, one {...} other {...}})
    var str = s.replace(/\{\{[^{}]*\}\}/g, '').replace(/\$\{[^}]*\}/g, '');
    function parseMsg(i, nested) {
      while (i < str.length) {
        var c = str[i];
        if (nested && c === '}') return i;
        if (c === '{') { i = parseArg(i + 1); continue; }
        i++;
      }
      return i;
    }
    function parseArg(i) {
      var m = /^\s*([^\s,{}]+)\s*(?:,\s*([A-Za-z]+)\s*)?/.exec(str.slice(i));
      if (!m) { var d = 1; while (i < str.length && d > 0) { if (str[i] === '{') d++; else if (str[i] === '}') d--; i++; } return i; }
      var name = m[1], type = m[2] ? m[2].toLowerCase() : '';
      toks.push(type ? '{' + name + ',' + type + '}' : '{' + name + '}');
      i += m[0].length;
      if (type === 'plural' || type === 'select' || type === 'selectordinal') {
        if (str[i] === ',') i++;
        while (i < str.length) {
          while (/\s/.test(str[i] || '')) i++;
          if (str[i] === '}') return i + 1;
          var k = /^(offset:\s*\d+|=?[\w-]+)\s*/.exec(str.slice(i));
          if (!k) { i++; continue; }
          i += k[0].length;
          if (str[i] === '{') { i = parseMsg(i + 1, true); if (str[i] === '}') i++; }
        }
        return i;
      }
      var depth = 1;
      while (i < str.length && depth > 0) { if (str[i] === '{') depth++; else if (str[i] === '}') depth--; i++; }
      return i;
    }
    parseMsg(0, false);
    return toks;
  }
  function extractTags(s) {
    var t = [];
    s.replace(/<(\/?)([A-Za-z0-9][\w-]*)(?:\s[^<>]*)?(\/?)>/g, function (_, cl, name, sc) { t.push('<' + cl + name.toLowerCase() + sc + '>'); return ''; });
    return t;
  }
  function extractCode(s) { var t = []; s.replace(/`([^`\n]+)`/g, function (_, c) { t.push(c); return ''; }); return t; }
  function extractUrls(s) {
    var t = [];
    (s.match(URL_RE) || []).forEach(function (u) { t.push(u.replace(/[.,;:!?)]+$/, '').replace(/\/+$/, '')); });
    return t;
  }
  function extractHex(s) { return (s.match(/0x[a-fA-F0-9]{8,}/g) || []).map(function (x) { return x.toLowerCase(); }); }
  function extractEns(s) { return (s.match(/\b[a-z0-9][a-z0-9-]*\.(?:base\.)?eth\b/gi) || []).map(function (x) { return x.toLowerCase(); }); }
  function extractEmails(s) { return (s.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g) || []).map(function (x) { return x.toLowerCase(); }); }
  function extractNumbers(masked) {
    return (masked.match(/\d[\d,]*(?:\.\d+)?/g) || []).map(function (n) { return n.replace(/,(?=\d{3}\b)/g, '').replace(/,$/, ''); })
      .filter(function (n) { return n.length > 0; });
  }

  // ---------------------------------------------------------------- variants & regional wording
  var PAIRS = ('这這 个個 们們 来來 时時 对對 会會 说說 与與 为為 钱錢 账帳 号號 区區 块塊 链鏈 币幣 网網 络絡 开開 发發 点點 认認 证證 据據 数數 ' +
    '资資 产產 协協 议議 矿礦 转轉 应應 务務 关關 进進 过過 还還 没沒 让讓 给給 从從 长長 门門 问問 间間 东東 车車 书書 买買 卖賣 实實 现現 ' +
    '学學 体體 机機 级級 线線 经經 结結 统統 设設 计計 识識 语語 读讀 请請 谁誰 该該 详詳 试試 话話 输輸 选選 连連 递遞 边邊 达達 运運 动動 ' +
    '处處 杂雜 难難 题題 页頁 显顯 预預 额額 风風 险險 验驗 获獲 优優 质質 价價 费費 贷貸 赎贖 赏賞 赠贈 销銷 锁鎖 钥鑰 铸鑄 错錯 镜鏡 闭閉 ' +
    '闪閃 阅閱 际際 陆陸 隐隱 须須 顺順 领領 频頻 颜顏 飞飛 驱驅 鸟鳥 龙龍 圆圓 图圖 团團 国國 园園 声聲 备備 夺奪 奖獎 宝寶 审審 宽寬 导導 ' +
    '将將 层層 岁歲 帮幫 带帶 广廣 库庫 异異 弹彈 归歸 当當 录錄 态態 总總 恶惡 惊驚 惯慣 戏戲 战戰 户戶 扩擴 扫掃 护護 报報 担擔 拥擁 择擇 ' +
    '换換 损損 摄攝 无無 旧舊 晓曉 术術 杀殺 权權 条條 极極 构構 标標 样樣 档檔 桥橋 检檢 楼樓 欢歡 毁毀 气氣 汇匯 汉漢 测測 济濟 浏瀏 览覽 ' +
    '涨漲 渐漸 温溫 湾灣 满滿 滤濾 灵靈 灯燈 烦煩 热熱 爱愛 状狀 独獨 环環 盖蓋 监監 盘盤 码碼 础礎 确確 积積 称稱 种種 稳穩 笔筆 签簽 简簡 ' +
    '类類 红紅 纪紀 约約 纯純 纳納 练練 组組 细細 终終 绑綁 维維 综綜 续續 缓緩 编編 缩縮 罗羅 职職 联聯 胜勝 脑腦 节節 虚虛 补補 规規 视視 ' +
    '订訂 记記 讯訊 许許 论論 诈詐 词詞 询詢 误誤 诺諾 调調 谈談 谢謝 负負 贡貢 财財 责責 败敗 货貨 贸貿 赔賠 赚賺 购購 跃躍 轨軌 软軟 轮輪 ' +
    '较較 辑輯 远遠 违違 适適 逻邏 邮郵 释釋 针針 铁鐵 银銀 键鍵 顶頂 项項 饭飯 馆館').split(' ');
  var S2T = {}, T2S = {};
  PAIRS.forEach(function (p) { S2T[p[0]] = p[1]; T2S[p[1]] = p[0]; });
  function scriptCounts(text) {
    var s = 0, t = 0;
    for (var i = 0; i < text.length; i++) { var ch = text[i]; if (S2T[ch]) s++; else if (T2S[ch]) t++; }
    return { simp: s, trad: t };
  }
  function detectVariant(text) { var c = scriptCounts(text); return c.trad > c.simp ? 'zh-TW' : 'zh-CN'; }

  // [term found in target, suggestion]
  var REGIONAL_TW = [['網絡', '網路'], ['軟件', '軟體'], ['硬件', '硬體'], ['默認', '預設'], ['視頻', '影片'], ['服務器', '伺服器'], ['登錄', '登入'],
    ['賬戶', '帳戶'], ['賬號', '帳號'], ['激活', '啟用'], ['文檔', '文件'], ['質量', '品質'], ['鏈接', '連結'], ['屏幕', '螢幕'], ['鼠標', '滑鼠'],
    ['內存', '記憶體'], ['菜單', '選單'], ['打印', '列印'], ['搜索', '搜尋'], ['博客', '部落格'], ['短信', '簡訊'], ['實時', '即時'], ['設置', '設定'],
    ['源代碼', '原始碼'], ['代碼', '程式碼'], ['字符', '字元'], ['信息', '資訊/訊息'], ['程序', '程式'], ['用戶', '使用者'], ['數據', '資料'],
    ['項目', '專案'], ['支持', '支援'], ['調用', '呼叫'], ['接口', '介面'], ['智能合約', '智慧合約']];
  var REGIONAL_CN = [['网路', '网络'], ['软体', '软件'], ['硬体', '硬件'], ['预设', '默认'], ['伺服器', '服务器'], ['登入', '登录'], ['萤幕', '屏幕'],
    ['滑鼠', '鼠标'], ['记忆体', '内存'], ['选单', '菜单'], ['列印', '打印'], ['搜寻', '搜索'], ['部落格', '博客'], ['简讯', '短信'], ['原始码', '源代码'],
    ['程式码', '代码'], ['程式', '程序'], ['字元', '字符'], ['智慧合约', '智能合约'], ['连结', '链接'], ['影片', '视频'], ['资讯', '信息'],
    ['帐户', '账户'], ['帐号', '账号'], ['介面', '界面']];
  function regionalHits(text, variant) {
    var list = (variant === 'zh-TW' ? REGIONAL_TW : REGIONAL_CN).slice().sort(function (a, b) { return b[0].length - a[0].length; });
    var work = text, hits = [];
    list.forEach(function (p) { if (work.indexOf(p[0]) >= 0) { hits.push(p); work = work.split(p[0]).join('\u0000'); } });
    return hits;
  }

  // ---------------------------------------------------------------- text rules (target-only; operate on masked text)
  var FW = { ',': '，', '!': '！', '?': '？', ';': '；', ':': '：', '.': '。' };
  var FW_PUNCT = '，。！？；：、）」』】》…';
  var FW_OPEN = '（「『【《';
  function nearCJK(s, start, end) {
    var a = start - 1; while (a >= 0 && /[ \t]/.test(s[a])) a--;
    var b = end; while (b < s.length && /[ \t]/.test(s[b])) b++;
    return (a >= 0 && reHasCJK.test(s[a])) || (b < s.length && reHasCJK.test(s[b]));
  }
  function regexRule(id, severity, re, repl, msg) {
    return {
      id: id, severity: severity, msg: msg,
      find: function (s) { var out = []; s.replace(re, function (m) { var off = arguments[arguments.length - 2]; out.push([off, off + m.length]); return m; }); return out; },
      fix: repl ? function (s) { return s.replace(re, repl); } : null
    };
  }
  function contextRule(id, severity, re, replacement, msg) {
    // matches of `re` count only when a CJK char is adjacent (spaces ignored); fix swaps in `replacement` and trims spaces around it
    function scan(s) { var out = []; s.replace(re, function (m) { var off = arguments[arguments.length - 2]; if (nearCJK(s, off, off + m.length)) out.push([off, off + m.length]); return m; }); return out; }
    return {
      id: id, severity: severity, msg: msg, find: scan,
      fix: function (s) {
        var hits = scan(s); if (!hits.length) return s;
        var res = '', last = 0;
        hits.forEach(function (h) {
          var a = h[0], b = h[1];
          while (a > last && /[ \t]/.test(s[a - 1])) a--;
          while (b < s.length && /[ \t]/.test(s[b])) b++;
          res += s.slice(last, a) + replacement; last = b;
        });
        return res + s.slice(last);
      }
    };
  }
  function buildTextRules(opts) {
    var variant = opts.variant || 'zh-CN';
    var rules = [
      regexRule('fullwidth-alnum', 'warning', /[０-９Ａ-Ｚａ-ｚ]/g,
        function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); }, '全角字母/数字应改为半角 · full-width letters/digits'),
      contextRule('ellipsis', 'warning', /(?<![.…])(?:\.{3,}|…)(?![.…])/g, '……', '中文省略号应为「……」 · use Chinese ellipsis'),
      contextRule('dash', 'warning', /(?<![—-])(?:—|--)(?![—-])/g, '——', '中文破折号应为「——」 · use Chinese dash'),
      regexRule('halfwidth-punct', 'warning', new RegExp('([' + C + '])[ \\t]*([,!?;:]|\\.(?![\\w.' + ML + MN + ']))', 'g'),
        function (m, a, p) { return a + FW[p]; }, '中文后接半角标点，应改为全角 · half-width punctuation after Chinese'),
      regexRule('halfwidth-punct', 'warning', new RegExp('([A-Za-z' + ML + MN + '\\)\\]])[ \\t]*([,!?;:]|\\.)[ \\t]*(?=[' + C + '])', 'g'),
        function (m, a, p) { return a + FW[p]; }, '半角标点后接中文，应改为全角 · half-width punctuation before Chinese'),
      regexRule('halfwidth-paren', 'warning', new RegExp('\\(([^()\\n]*[' + C + '][^()\\n]*)\\)', 'g'),
        function (m, inner) { return '（' + inner + '）'; }, '包含中文的括号应为全角「（）」 · use full-width parentheses'),
      regexRule('fullwidth-punct-space', 'warning', new RegExp('[ \\t]+(?=[' + FW_PUNCT + '])|(?<=[' + FW_PUNCT + FW_OPEN + '])[ \\t]+(?=[^\\s|])', 'g'),
        function () { return ''; }, '全角标点前后不加空格 · no spaces around full-width punctuation'),
      regexRule('straight-quotes', 'info', new RegExp('"([^"\\n]*[' + C + '][^"\\n]*)"', 'g'),
        function (m, inner) { return variant === 'zh-TW' ? '「' + inner + '」' : '“' + inner + '”'; },
        variant === 'zh-TW' ? '中文引号建议用「」 · use 「」 quotes' : '中文引号建议用“” · use Chinese quotes'),
      regexRule('repeated-punct', 'info', /([！？。，])\1+/g, null, '重复标点 · repeated punctuation')
    ];
    if (opts.spacing !== false) {
      rules.push(regexRule('cjk-latin-spacing', 'warning',
        new RegExp('([' + C + '])(?=[A-Za-z0-9' + ML + '])|([A-Za-z0-9' + ML + '])(?=[' + C + '])', 'g'),
        function (m) { return m + ' '; }, '中英文/数字之间加空格 · add a space between Chinese and Latin/digits'));
    }
    return rules;
  }

  function excerpt(masked, spans, a, b) {
    var s = Math.max(0, a - 8), e = Math.min(masked.length, b + 8);
    return unmask(masked.slice(s, e), spans).replace(/\n/g, '⏎');
  }

  function runTextRules(target, opts) {
    var issues = [];
    var mk = mask(target);
    buildTextRules(opts).forEach(function (r) {
      var hits = r.find(mk.text);
      if (!hits.length) return;
      issues.push({ rule: r.id, severity: r.severity, message: r.msg, count: hits.length, fixable: !!r.fix,
        sample: excerpt(mk.text, mk.spans, hits[0][0], hits[0][1]) });
    });
    return issues;
  }

  function fixText(text, opts) {
    opts = opts || {};
    var mk = mask(text), s = mk.text, changes = {};
    // two passes make the result stable (punctuation fixes can create new spacing opportunities and vice versa)
    for (var pass = 0; pass < 2; pass++) {
      buildTextRules(opts).forEach(function (r) {
        if (!r.fix) return;
        var n = r.find(s).length;
        if (!n) return;
        var next = r.fix(s);
        if (next !== s) { changes[r.id] = (changes[r.id] || 0) + n; s = next; }
      });
    }
    return { text: unmask(s, mk.spans), changes: changes };
  }

  // ---------------------------------------------------------------- linter factory
  function createLinter(glossary) {
    var terms = (glossary && glossary.terms) || [];
    var compiled = terms.map(function (t) {
      var forms = [t.en].concat(t.aliases || []);
      var res = forms.map(function (f) {
        var body = escRe(f).replace(/-|\s+/g, '[\\s-]?');
        return new RegExp('(?<![A-Za-z0-9])' + body + '(?:s|es|ed|d|ing)?(?![A-Za-z0-9])', t.case_sensitive ? '' : 'i');
      });
      return { t: t, res: res, forms: forms };
    }).sort(function (a, b) { return b.t.en.length - a.t.en.length; }); // longest terms first, so "connect wallet" wins over "wallet"

    function accepted(entry, variant) {
      var t = entry.t, list = [variant === 'zh-TW' ? t.zh_tw : t.zh_cn, t.zh_cn, t.zh_tw].concat(t.alt || []);
      if (t.keep_en) list = list.concat(entry.forms);
      return uniq(list.filter(Boolean));
    }
    function containsAny(target, list) {
      var low = target.toLowerCase();
      for (var i = 0; i < list.length; i++) { var x = list[i]; if (/[A-Za-z]/.test(x) ? low.indexOf(x.toLowerCase()) >= 0 : target.indexOf(x) >= 0) return x; }
      return null;
    }
    function glossaryIssues(maskedSource, target, variant) {
      var out = [], reported = [];
      if (!reHasCJK.test(target)) return out;
      compiled.forEach(function (e) {
        var hit = null;
        for (var i = 0; i < e.res.length; i++) { var m = e.res[i].exec(maskedSource); if (m) { hit = m[0]; break; } }
        if (!hit) return;
        var t = e.t, pref = variant === 'zh-TW' ? t.zh_tw : t.zh_cn;
        var bad = containsAny(target, t.avoid || []);
        if (bad && reported.some(function (r) { return r.indexOf(bad) >= 0 || bad.indexOf(r) >= 0; })) return;
        if (bad) {
          reported.push(bad);
          out.push({ rule: 'glossary-avoid', severity: t.case_sensitive ? 'error' : 'warning', term: t.en,
            message: '「' + hit + '」疑似误译为「' + bad + '」，建议「' + pref + '」 · likely mistranslation', fixable: false });
          return;
        }
        if (!containsAny(target, accepted(e, variant))) {
          out.push({ rule: 'glossary-term', severity: 'warning', term: t.en,
            message: '「' + hit + '」未按术语表翻译，建议「' + pref + '」' + (t.note ? '（' + t.note + '）' : '') + ' · term not rendered per glossary', fixable: false });
        }
      });
      return out;
    }

    function lintPair(source, target, opts) {
      opts = opts || {};
      var variant = opts.variant || detectVariant(target);
      var issues = [];
      var push = function (rule, severity, message, extra) { var o = { rule: rule, severity: severity, message: message, fixable: false }; if (extra) Object.keys(extra).forEach(function (k) { o[k] = extra[k]; }); issues.push(o); };
      if (typeof target !== 'string') { push('missing-key', 'error', '缺少译文 · missing translation'); return issues; }
      if (source.trim() && !target.trim()) { push('empty-target', 'error', '译文为空 · empty translation'); return issues; }

      var checks = [
        ['placeholder', extractPlaceholders, '占位符', 'error'],
        ['tag', extractTags, '标签', 'error'],
        ['inline-code', extractCode, '行内代码', 'error'],
        ['url', extractUrls, '链接', 'error'],
        ['address', extractHex, '地址/哈希', 'error'],
        ['ens', extractEns, 'ENS 名称', 'error'],
        ['email', extractEmails, '邮箱', 'error']
      ];
      if (opts.markdown) checks = checks.filter(function (c) { return c[0] !== 'placeholder'; });
      checks.forEach(function (c) {
        var d = diffMulti(c[1](source), c[1](target));
        if (d.missing.length) push(c[0] + '-missing', c[3], c[2] + '缺失或被改动 · missing ' + c[0] + ': ' + uniq(d.missing).join(' '), { items: uniq(d.missing) });
        if (d.extra.length) push(c[0] + '-extra', c[0] === 'placeholder' || c[0] === 'tag' ? 'error' : 'warning', '译文多出' + c[2] + ' · unexpected ' + c[0] + ': ' + uniq(d.extra).join(' '), { items: uniq(d.extra) });
      });

      var ms = mask(source).text, mt = mask(target).text;
      var nd = diffMulti(uniq(extractNumbers(ms)), uniq(extractNumbers(mt)));
      if (nd.missing.length) push('number-missing', 'info', '原文数字在译文中未出现（若已换算为「万/亿」可忽略） · numbers not found: ' + nd.missing.join(' '), { items: nd.missing });

      var srcWords = (ms.match(/[A-Za-z]{2,}/g) || []).length;
      if (srcWords >= 2 && source.trim() === target.trim()) push('untranslated', 'warning', '译文与原文相同，疑似未翻译 · identical to source');
      else if (srcWords >= 3 && !reHasCJK.test(mt)) push('untranslated', 'warning', '译文没有中文，疑似未翻译 · no Chinese in translation');

      if (source.length >= 40 && reHasCJK.test(target)) {
        var ratio = target.length / source.length;
        if (ratio < 0.18 || ratio > 1.2) push('length-ratio', 'info', '译文长度异常（' + ratio.toFixed(2) + '×），请检查漏译或冗余 · unusual length ratio');
      }

      var sc = scriptCounts(target);
      if (variant === 'zh-CN' && sc.trad > 0) {
        var tch = uniq(target.split('').filter(function (ch) { return T2S[ch]; })).slice(0, 12);
        push('variant-mix', 'warning', '简体译文中混入繁体字：' + tch.map(function (c) { return c + '→' + T2S[c]; }).join(' ') + ' · Traditional characters in zh-CN');
      }
      if (variant === 'zh-TW' && sc.simp > 0) {
        var sch = uniq(target.split('').filter(function (ch) { return S2T[ch]; })).slice(0, 12);
        push('variant-mix', 'warning', '繁体译文中混入简体字：' + sch.map(function (c) { return c + '→' + S2T[c]; }).join(' ') + ' · Simplified characters in zh-TW');
      }
      regionalHits(target, variant).forEach(function (p) {
        push('regional-wording', 'info', (variant === 'zh-TW' ? '台湾惯用「' : '大陆惯用「') + p[1] + '」，而非「' + p[0] + '」 · regional wording');
      });

      if (!opts.markdown) glossaryIssues(ms, target, variant).forEach(function (i) { issues.push(i); });
      if (reHasCJK.test(target)) runTextRules(target, { variant: variant, spacing: opts.spacing }).forEach(function (i) { issues.push(i); });
      return issues;
    }

    function summarize(items) {
      var s = { errors: 0, warnings: 0, info: 0 };
      items.forEach(function (i) { if (i.severity === 'error') s.errors++; else if (i.severity === 'warning') s.warnings++; else s.info++; });
      s.score = Math.max(0, Math.round(100 - 8 * s.errors - 2 * s.warnings - 0.5 * s.info));
      return s;
    }

    function lintJson(src, tgt, opts) {
      opts = opts || {};
      var fs = flatten(src), ft = flatten(tgt);
      var allTarget = Object.keys(ft).map(function (k) { return ft[k]; }).join('\n');
      var variant = opts.variant || detectVariant(allTarget);
      var issues = [];
      Object.keys(fs).forEach(function (k) {
        lintPair(fs[k], ft[k], { variant: variant, spacing: opts.spacing }).forEach(function (i) { i.key = k; issues.push(i); });
      });
      Object.keys(ft).forEach(function (k) { if (!(k in fs)) issues.push({ key: k, rule: 'extra-key', severity: 'info', message: '原文中没有这个键 · key not in source', fixable: false }); });
      var sum = summarize(issues); sum.strings = Object.keys(fs).length;
      return { tool: 'web3-zh-kit', version: VERSION, mode: 'json', variant: variant, summary: sum, issues: issues };
    }

    function splitFences(md) {
      var lines = md.split('\n'), blocks = [], inFence = false, buf = [], textLines = [];
      lines.forEach(function (ln, i) {
        if (/^\s*(```|~~~)/.test(ln)) {
          if (inFence) { buf.push(ln); blocks.push(buf.join('\n')); buf = []; inFence = false; }
          else { inFence = true; buf = [ln]; }
          textLines.push(null); return;
        }
        if (inFence) { buf.push(ln); textLines.push(null); } else textLines.push(ln);
      });
      if (inFence) blocks.push(buf.join('\n'));
      return { blocks: blocks, textLines: textLines };
    }

    function lintMarkdown(srcMd, tgtMd, opts) {
      opts = opts || {};
      var S = splitFences(srcMd), T = splitFences(tgtMd);
      var srcText = S.textLines.filter(function (l) { return l !== null; }).join('\n');
      var tgtText = T.textLines.filter(function (l) { return l !== null; }).join('\n');
      var variant = opts.variant || detectVariant(tgtText);
      var issues = [];
      if (S.blocks.length !== T.blocks.length) issues.push({ rule: 'md-codeblock-count', severity: 'error', message: '代码块数量不一致（原文 ' + S.blocks.length + '，译文 ' + T.blocks.length + '） · code block count differs', fixable: false });
      else S.blocks.forEach(function (b, i) { if (b !== T.blocks[i]) issues.push({ rule: 'md-codeblock-changed', severity: 'warning', message: '第 ' + (i + 1) + ' 个代码块内容被改动（只译注释可忽略） · code block changed', fixable: false }); });
      var hs = (srcText.match(/^#{1,6}\s/gm) || []).length, ht = (tgtText.match(/^#{1,6}\s/gm) || []).length;
      if (hs !== ht) issues.push({ rule: 'md-heading-count', severity: 'warning', message: '标题数量不一致（原文 ' + hs + '，译文 ' + ht + '） · heading count differs', fixable: false });
      // document-level integrity + glossary
      lintPair(srcText, tgtText, { variant: variant, markdown: true, spacing: false }).forEach(function (i) {
        if (['untranslated', 'length-ratio'].indexOf(i.rule) >= 0) return;
        if (['halfwidth-punct', 'halfwidth-paren', 'fullwidth-alnum', 'ellipsis', 'dash', 'fullwidth-punct-space', 'straight-quotes', 'repeated-punct'].indexOf(i.rule) >= 0) return;
        issues.push(i);
      });
      glossaryIssues(mask(srcText).text, tgtText, variant).forEach(function (i) { issues.push(i); });
      // line-level text rules
      T.textLines.forEach(function (ln, idx) {
        if (ln === null || !ln.trim()) return;
        if (reHasCJK.test(ln)) runTextRules(ln, { variant: variant, spacing: opts.spacing }).forEach(function (i) { i.line = idx + 1; issues.push(i); });
        else {
          var words = (mask(ln).text.match(/[A-Za-z]{2,}/g) || []).length;
          if (words >= 6 && !/^\s*(\||<|!\[|\[[^\]]*\]:)/.test(ln)) issues.push({ line: idx + 1, rule: 'md-untranslated-line', severity: 'info', message: '这一行没有中文，疑似漏译 · line looks untranslated', sample: ln.slice(0, 60), fixable: false });
        }
      });
      var cjk = (tgtText.match(reCJKg) || []).length;
      if (srcText.trim().length > 200 && cjk < 20) issues.push({ rule: 'untranslated', severity: 'warning', message: '整篇译文中文极少，疑似未翻译 · document looks untranslated', fixable: false });
      var sum = summarize(issues); sum.lines = T.textLines.length;
      return { tool: 'web3-zh-kit', version: VERSION, mode: 'markdown', variant: variant, summary: sum, issues: issues };
    }

    // Monolingual check of a Chinese document (no source): typography, script mixing, regional wording.
    function lintZh(text, opts) {
      opts = opts || {};
      var S = splitFences(text), body = S.textLines.filter(function (l) { return l !== null; }).join('\n');
      var variant = opts.variant || detectVariant(body);
      var issues = [];
      var sc = scriptCounts(body);
      var stray = variant === 'zh-CN' ? uniq(body.split('').filter(function (ch) { return T2S[ch]; })) : uniq(body.split('').filter(function (ch) { return S2T[ch]; }));
      if (stray.length && (variant === 'zh-CN' ? sc.trad : sc.simp) > 0) issues.push({ rule: 'variant-mix', severity: 'warning', fixable: false,
        message: (variant === 'zh-CN' ? '简体文中混入繁体字：' : '繁体文中混入简体字：') + stray.slice(0, 12).map(function (c) { return c + '→' + (T2S[c] || S2T[c]); }).join(' ') });
      regionalHits(body, variant).forEach(function (p) { issues.push({ rule: 'regional-wording', severity: 'info', fixable: false, message: (variant === 'zh-TW' ? '台湾惯用「' : '大陆惯用「') + p[1] + '」，而非「' + p[0] + '」' }); });
      S.textLines.forEach(function (ln, idx) {
        if (ln === null || !reHasCJK.test(ln)) return;
        runTextRules(ln, { variant: variant, spacing: opts.spacing }).forEach(function (i) { i.line = idx + 1; issues.push(i); });
      });
      var sum = summarize(issues); sum.lines = S.textLines.length;
      return { tool: 'web3-zh-kit', version: VERSION, mode: 'zh', variant: variant, summary: sum, issues: issues };
    }

    function fixJson(obj, opts) {
      var all = {};
      var out = mapStrings(obj, function (s) {
        if (!reHasCJK.test(s)) return s;
        var r = fixText(s, opts); Object.keys(r.changes).forEach(function (k) { all[k] = (all[k] || 0) + r.changes[k]; }); return r.text;
      });
      return { value: out, changes: all };
    }
    function fixMarkdown(md, opts) {
      var lines = md.split('\n'), inFence = false, all = {}, inFront = lines[0] === '---';
      var out = lines.map(function (ln, i) {
        if (inFront) { if (i > 0 && ln === '---') inFront = false; return ln; }
        if (/^\s*(```|~~~)/.test(ln)) { inFence = !inFence; return ln; }
        if (inFence || /^( {4}|\t)/.test(ln) || !reHasCJK.test(ln)) return ln;
        var r = fixText(ln, opts); Object.keys(r.changes).forEach(function (k) { all[k] = (all[k] || 0) + r.changes[k]; }); return r.text;
      });
      return { value: out.join('\n'), changes: all };
    }

    function lookup(q, opts) {
      opts = opts || {};
      var query = String(q || '').trim(); if (!query) return [];
      var low = query.toLowerCase();
      var scored = [];
      terms.forEach(function (t) {
        var forms = [t.en].concat(t.aliases || []).map(function (x) { return x.toLowerCase(); });
        var zh = [t.zh_cn, t.zh_tw].concat(t.alt || []);
        var score = 0;
        if (forms.indexOf(low) >= 0) score = 3;
        else if (zh.indexOf(query) >= 0) score = 3;
        else if (forms.some(function (f) { return f.indexOf(low) >= 0; })) score = 2;
        else if (zh.some(function (z) { return z && z.indexOf(query) >= 0; })) score = 1;
        if (score) scored.push([score, t]);
      });
      scored.sort(function (a, b) { return b[0] - a[0]; });
      return scored.slice(0, opts.limit || 10).map(function (x) { return x[1]; });
    }

    return { version: VERSION, termCount: terms.length, lintPair: lintPair, lintJson: lintJson, lintMarkdown: lintMarkdown, lintZh: lintZh,
      fixText: fixText, fixJson: fixJson, fixMarkdown: fixMarkdown, lookup: lookup, detectVariant: detectVariant, flatten: flatten, summarize: summarize };
  }

  // ---------------------------------------------------------------- report formatting
  var ICON = { error: '✖', warning: '⚠', info: 'ℹ' };
  function formatReport(rep, fmt, title) {
    if (fmt === 'json') return JSON.stringify(rep, null, 2);
    var s = rep.summary, lines = [];
    var where = function (i) { return i.key ? i.key : (i.line ? 'L' + i.line : '-'); };
    if (fmt === 'md') {
      lines.push('# 本地化 QA 报告 · Localization QA Report', '');
      if (title) lines.push('- 文件 / File: `' + title + '`');
      lines.push('- 变体 / Variant: **' + rep.variant + '**', '- 工具 / Tool: web3-zh-kit ' + rep.version + '（确定性规则，无 LLM）',
        '- 得分 / Score: **' + s.score + '/100** · ' + s.errors + ' errors · ' + s.warnings + ' warnings · ' + s.info + ' info', '');
      if (!rep.issues.length) { lines.push('没有发现问题。 · No issues found.'); return lines.join('\n'); }
      lines.push('| 级别 | 位置 | 规则 | 说明 |', '|---|---|---|---|');
      rep.issues.forEach(function (i) {
        var msg = (i.message + (i.count > 1 ? '（×' + i.count + '）' : '') + (i.sample ? ' — `' + i.sample.replace(/`/g, "'") + '`' : '')).replace(/\|/g, '\\|');
        lines.push('| ' + ICON[i.severity] + ' ' + i.severity + ' | `' + where(i) + '` | ' + i.rule + ' | ' + msg + ' |');
      });
      return lines.join('\n');
    }
    if (title) lines.push('web3-zh-kit · zhlint  ' + title + '  (' + rep.variant + ')');
    rep.issues.forEach(function (i) {
      var w = where(i); while (w.length < 22) w += ' ';
      var r = i.rule; while (r.length < 22) r += ' ';
      lines.push(ICON[i.severity] + ' ' + w + ' ' + r + ' ' + i.message + (i.count > 1 ? ' (×' + i.count + ')' : '') + (i.sample ? '  «' + i.sample + '»' : ''));
    });
    lines.push('──', 'score ' + s.score + '/100 · ' + s.errors + ' errors · ' + s.warnings + ' warnings · ' + s.info + ' info' +
      (s.strings != null ? ' · ' + s.strings + ' strings' : '') + (s.lines != null ? ' · ' + s.lines + ' lines' : ''));
    return lines.join('\n');
  }

  return { VERSION: VERSION, createLinter: createLinter, fixText: fixText, detectVariant: detectVariant, flatten: flatten,
    extractPlaceholders: extractPlaceholders, mask: mask, unmask: unmask, formatReport: formatReport };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = ZHKitCore;
