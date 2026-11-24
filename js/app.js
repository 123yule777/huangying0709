/* 过线计划 · 四川专升本计算机 —— 纯前端单页应用 */
(function () {
  "use strict";
  var KEY = "guoxian.v1";
  var ACCT_KEY = "guoxian.accounts";
  var EMOJIS = ["🦊", "🐰", "🐼", "🐨", "🐯", "🦉", "🐧", "🐳", "🌵", "🍀", "⭐", "🌙"];
  var acct = loadAcct();
  var authMode = "login";
  /* 艾宾浩斯复习节点（天）：10min → 30min → 12h → 1d → 2d → 4d → 7d → 15d → 30d → 60d */
  var INTERVALS = [0.007, 0.021, 0.5, 1, 2, 4, 7, 15, 30, 60];
  var TARGET_R = 0.8;
  var DB = { meta: null, mods: [], items: {}, list: [], byKp: {}, byMod: {} };
  var S = { screen: "home", tab: "home", sess: null, filter: "all", timer: null, last: null };
  var store = null;

  var SUBJECTS = [];
  var SUB_COLOR = { computer: "#D8F94B", yw: "#A9DCC0", en: "#CBE7CF" };
  var ICONS = {
    book: '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5v-13Z"/><path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5A1.5 1.5 0 0 0 20 18.5v-13Z"/>',
    list: '<circle cx="6" cy="7" r="1.4"/><circle cx="6" cy="12" r="1.4"/><circle cx="6" cy="17" r="1.4"/><path d="M10.5 7H19M10.5 12H19M10.5 17H15"/>',
    review: '<path d="M4 9a8 8 0 1 1 2.3 6.3"/><path d="M4 4.5V9h4.5"/><path d="M12 8v4.5l3 1.8"/>',
    user: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 19.5c.8-3.4 3.6-5.2 7-5.2s6.2 1.8 7 5.2"/>',
    target: '<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6"/>',
    timer: '<circle cx="12" cy="13" r="7"/><path d="M9 2.8h6"/><path d="M12 9v4.4l2.6 1.6"/>',
    pen: '<path d="M4 20l4.2-1 9.6-9.6a2.1 2.1 0 0 0-3-3L5.2 16 4 20Z"/>',
    grid: '<rect x="4" y="4" width="7" height="7" rx="1.6"/><rect x="13" y="4" width="7" height="7" rx="1.6"/><rect x="4" y="13" width="7" height="7" rx="1.6"/><rect x="13" y="13" width="7" height="7" rx="1.6"/>'
  };
  function icon(name, size) {
    var s = size || 20;
    return '<svg viewBox="0 0 24 24" width="' + s + '" height="' + s + '" fill="none" stroke="currentColor" ' +
      'stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[name] || "") + "</svg>";
  }

  /* 按学科加载 kp 与题目，填充 DB */
  function loadSubjectData(sid) {
    return ASSET_CACHE.json("data/" + sid + "/kp.json")
      .then(function (kp) {
        DB.meta = kp.meta;
        DB.mods = kp.kps;
        DB.items = {}; DB.list = []; DB.byKp = {}; DB.byMod = {};
        var ids = kp.kps.map(function (m) { return m.id; });
        return Promise.all(ids.map(function (id) {
          return ASSET_CACHE.json("data/" + sid + "/q/" + id + ".json")
            .catch(function () { return { module: id, items: [] }; });
        }));
      })
      .then(function (list) {
        list.forEach(function (m) {
          m.items.forEach(function (q) { DB.items[q.id] = q; DB.list.push(q); });
          DB.byMod[m.module] = m.items;
        });
        DB.mods.forEach(function (mod) {
          mod.points.forEach(function (p) {
            DB.byKp[p.id] = p;
            p.module = mod.id;
            p.moduleName = mod.name;
            p.qids = p.qids.filter(function (id) { return !!DB.items[id]; });
          });
        });
      });
  }

  /* ---------- 存储 ---------- */
  function loadAcct() {
    try { var r = localStorage.getItem(ACCT_KEY); if (r) return JSON.parse(r); } catch (e) {}
    return { current: "", accounts: {} };
  }
  function saveAcct() { try { localStorage.setItem(ACCT_KEY, JSON.stringify(acct)); } catch (e) {} }
  function hash(s) {
    var h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }
  function mkSalt() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }

  function freshSub() { return { progress: {}, daily: { ymd: "", done: 0, goal: 20 }, sessions: 0 }; }
  function freshStore() { return { v: 2, current: "computer", subs: { computer: freshSub() }, settings: {} }; }
  function loadStore(user) {
    var base = null;
    try {
      var raw = localStorage.getItem(KEY + "." + user);
      if (raw) base = JSON.parse(raw);
    } catch (e) {}
    if (!base) return freshStore();
    if (!base.subs) {
      /* v1 → v2：旧进度并入计算机 */
      base = { v: 2, current: "computer", settings: base.settings || {},
               subs: { computer: { progress: base.progress || {}, daily: base.daily || { ymd: "", done: 0, goal: 20 },
                                   sessions: base.sessions || 0 } } };
    }
    if (!base.settings) base.settings = {};
    if (!base.subs.computer) base.subs.computer = freshSub();
    if (!base.current) base.current = "computer";
    return base;
  }
  /* 当前学科的学习数据（进度 / 今日 / 轮次） */
  function PR() {
    if (!store.subs[store.current]) store.subs[store.current] = freshSub();
    return store.subs[store.current];
  }
  function save() { try { if (store && acct.current) localStorage.setItem(KEY + "." + acct.current, JSON.stringify(store)); } catch (e) {} }
  function ymd() { var d = new Date(); return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(); }
  function todayDone() {
    if (PR().daily.ymd !== ymd()) { PR().daily.ymd = ymd(); PR().daily.done = 0; save(); }
    return PR().daily.done;
  }
  function rec(qid) {
    var p = PR().progress[qid];
    if (!p) { p = { n: 0, ok: 0, box: 0, due: 0, last: 0 }; PR().progress[qid] = p; }
    return p;
  }
  function markAnswer(qid, right) {
    var p = rec(qid);
    p.n++; if (right) p.ok++;
    /* 答对 → 升到下一个复习节点；答错 → 回到第一节点（当天再练） */
    p.box = right ? Math.min(INTERVALS.length - 1, (p.box || 0) + 1) : 0;
    var interval = INTERVALS[p.box];
    p.last = Date.now();
    p.due = p.last + interval * 864e5;
    /* 稳定性 S：使保持度恰好在到期时衰减到 TARGET_R */
    p.S = interval / -Math.log(TARGET_R);
    if (right) { PR().daily.ymd = ymd(); PR().daily.done = (PR().daily.done || 0) + 1; }
    save();
  }
  /* 当前记忆保持度 R = e^(-t/S)，S 由上一个复习间隔推得 */
  function retention(p) {
    if (!p || !p.last) return 0;
    var S = p.S || 1;
    return Math.exp(-((Date.now() - p.last) / 864e5) / S);
  }
  function nextReviewText(p) {
    if (!p || !p.due) return "未练";
    var d = p.due - Date.now();
    if (d <= 0) return "该复习";
    if (d < 3600e3) return Math.round(d / 60e3) + " 分钟后";
    if (d < 864e5) return Math.round(d / 3600e3) + " 小时后";
    return Math.round(d / 864e5) + " 天后";
  }
  function dueList() {
    var out = [];
    for (var i = 0; i < DB.list.length; i++) {
      var q = DB.list[i], p = PR().progress[q.id];
      if (p && p.box < 4 && (p.due || 0) <= Date.now()) out.push({ q: q, p: p });
    }
    out.sort(function (a, b) { return retention(a.p) - retention(b.p); });
    return out;
  }
  function weakKps() {
    var arr = [];
    DB.mods.forEach(function (m) {
      m.points.forEach(function (kp) {
        var n = 0, ok = 0;
        kp.qids.forEach(function (id) {
          var p = PR().progress[id];
          if (p) { n += p.n; ok += p.ok; }
        });
        if (n >= 2) arr.push({ kp: kp, module: m.id, rate: ok / n, n: n });
      });
    });
    arr.sort(function (a, b) { return a.rate - b.rate; });
    return arr.slice(0, 8);
  }

  /* ---------- 工具 ---------- */
  function avatarHtml(profile, size) {
    var p = profile || {};
    var s = size || 56;
    if (p.avatar && p.avatar.indexOf("data:") === 0) {
      return '<img src="' + p.avatar + '" style="width:' + s + "px;height:" + s + 'px;border-radius:' + (s / 3) + 'px;object-fit:cover">';
    }
    return '<span style="font-size:' + Math.round(s * 0.55) + 'px;line-height:1">' + esc(p.avatar || "🙂") + "</span>";
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function pick(arr, n) { return shuffle(arr).slice(0, n); }
  function letters(n) { return ["A", "B", "C", "D", "E"].slice(0, n); }
  function idxOf(l) { return "ABCDE".indexOf(l); }
  function itemById(id) { return DB.items[id]; }

  /* ---------- 启动 ---------- */
  document.addEventListener("DOMContentLoaded", boot);

  function boot() {
    try {
      var legacyG = localStorage.getItem(KEY);
      if (legacyG && !localStorage.getItem(KEY + ".guest")) {
        localStorage.setItem(KEY + ".guest", legacyG); localStorage.removeItem(KEY);
      }
    } catch (e) {}
    store = loadStore(acct.current || "guest");
    if (/dbg/.test(location.search)) {
      var gm = location.search.match(/[?&]g=(\d+)/);
      if (gm) PR().daily.goal = Math.max(1, Math.min(200, parseInt(gm[1], 10)));
    }
    SFX.init({
      enabled: !(store && store.settings && store.settings.sfx === false),
      volume: (store && store.settings && typeof store.settings.volume === "number") ? store.settings.volume : 0.7
    });
    ASSET_CACHE.json("data/subjects.json")
      .then(function (subs) {
        SUBJECTS = subs || [];
        return loadSubjectData(store.current || "computer").then(function () {
    /* 仅调试：?dbg=1&seed=1 注入几道错题，便于验证薄弱考点相关界面 */
    if (/dbg/.test(location.search) && /seed/.test(location.search) && DB.mods[0]) {
      DB.mods[0].points.slice(0, 3).forEach(function (kp) {
        kp.qids.slice(0, 3).forEach(function (id) {
          PR().progress[id] = { n: 2, ok: 0, box: 0, due: Date.now() };
        });
      });
      save();
    }
  });
      })
      .then(function () {
      render();
      var h = (location.hash || "").replace("#", "");
      if (h === "train") startSession({ mode: "daily" });
      else if (h === "fb") {
        var one = DB.list.filter(function (q) { return q.type === "single" && q.analysis.length > 40; })[0];
        startSession({ qids: [one.id] });
        setTimeout(function () { judge([one.answer]); }, 400);
      }
      else if (h === "exam") startSession({ mode: "exam" });
      else if (h === "exama") {
        startSession({ mode: "exam" });
        setTimeout(function () {
          var timer = setInterval(function () {
            if (S.screen === "result") { clearInterval(timer); return; }
            var s = S.sess, q = cur();
            if (!s || !q) { clearInterval(timer); return; }
            s.picked = q.type === "multi" ? q.answer.split("") : [q.answer.slice(0, 1)];
            var btn = document.querySelector('[data-act="exam-next"]');
            if (btn) btn.click();
          }, 120);
        }, 400);
      }
      else if (h === "auto") {
        startSession({ mode: "daily", n: 5 });
        setTimeout(autoPlay, 300);
      }
      else if (h === "kp" || h === "wrong" || h === "me") { S.screen = h; S.tab = h; render(); }
      else if (h === "fbw") {
        var one3 = DB.list.filter(function (q) { return q.type === "single" && q.analysis.length > 40; })[0];
        startSession({ qids: [one3.id] });
        setTimeout(function () {
          var wl = "ABCD".split("").filter(function (L) { return one3.answer.indexOf(L) < 0; })[0];
          judge([wl]);
        }, 400);
      }
      else if (h === "weak") {
        var wpool = weakPool();
        var wleft = Math.max(0, (PR().daily.goal || 20) - todayDone());
        if (wpool.length > wleft) showWeakConfirm(wpool.length, wleft);
        else startSession({ mode: "weak" });
      }
      else if (h === "subj") startSession({ mode: "subjective" });
      else if (h.indexOf("kpc.") === 0) {
        var kidc = h.slice(4);
        var sidc = kidc.split(".")[0];
        var openConfirm = function () {
          if (!DB.byKp[kidc]) return;
          var oc = DB.byKp[kidc].qids.filter(function (id) { var q = DB.items[id]; return q && isObj(q); });
          var totalc = oc.length || DB.byKp[kidc].qids.length;
          var leftc = Math.max(0, (PR().daily.goal || 20) - todayDone());
          S.screen = "kp"; S.tab = "kp"; render();
          setTimeout(function () {
            if (totalc > leftc) showKpConfirm(kidc, totalc, leftc);
            else startSession({ qids: DB.byKp[kidc].qids });
          }, 100);
        };
        if (SUBJECTS.some(function (x) { return x.id === sidc; }) && sidc !== store.current) {
          store.current = sidc;
          if (!store.subs[sidc]) store.subs[sidc] = freshSub();
          var gm2 = location.search.match(/[?&]g=(\d+)/);
          if (gm2) store.subs[sidc].daily.goal = Math.max(1, Math.min(200, parseInt(gm2[1], 10)));
          save();
          loadSubjectData(sidc).then(openConfirm);
        } else openConfirm();
      }
      else if (h === "subj-r") {
        startSession({ mode: "subjective" });
        setTimeout(function () { if (S.sess) { S.sess.revealed = true; render(); } }, 600);
      }
      else if (h === "subj-auto") {
        startSession({ mode: "subjective" });
        setTimeout(function () {
          var t = setInterval(function () {
            if (!S.sess || S.screen === "result") { clearInterval(t); return; }
            var rv = document.querySelector('[data-act="reveal"]');
            if (rv) { rv.click(); return; }
            var ok = document.querySelector('[data-act="self-ok"]');
            if (ok) ok.click();
          }, 140);
        }, 400);
      }
      else if (h === "subject") { showSubjectSheet(); }
      else if (h.indexOf("kpo-") === 0) {
        S.screen = "kp"; S.tab = "kp"; S.openCh = {}; S.openCh[h.slice(4)] = true; render();
      }
      else if (h.indexOf("sub-") === 0) { switchSubject(h.slice(4)); }
      else if (h === "login" || h === "reg") {
        S.screen = "me"; S.tab = "me"; render();
        setTimeout(function () { showAuth(h); }, 60);
      }
      else if (h === "goal") { S.screen = "me"; S.tab = "me"; render(); setTimeout(showGoalEditor, 60); }
      else if (h.indexOf("goal-") === 0) {
        PR().daily.goal = Math.max(1, Math.min(200, parseInt(h.slice(5), 10) || 20));
        save(); render();
      }
      else if (h.indexOf("kp.") === 0) {
        var kid = h.slice(3);
        var sid2 = kid.split(".")[0];
        if (SUBJECTS.some(function (x) { return x.id === sid2; }) && sid2 !== store.current) {
          store.current = sid2;
          if (!store.subs[sid2]) store.subs[sid2] = freshSub();
          save();
          loadSubjectData(sid2).then(function () {
            if (DB.byKp[kid]) startSession({ qids: DB.byKp[kid].qids });
            else render();
          });
        } else if (DB.byKp[kid]) startSession({ qids: DB.byKp[kid].qids });
      }
    }).catch(function (e) {
      document.getElementById("app").innerHTML = '<div style="padding:40px 20px;font-family:sans-serif">' +
        '<h2>数据加载失败</h2><p style="color:#666;line-height:1.7">请用本地服务器打开（双击 index.html 会被浏览器的 fetch 限制拦住）：<br><code>python -m http.server 5178</code></p>' +
        '<p style="color:#999">' + esc(e.message) + "</p></div>";
    });
    document.addEventListener("click", onClick, false);
    document.addEventListener("input", function (e) {
      if (!e.target || e.target.id !== "vol") return;
      var v = Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0)) / 100;
      store.settings = store.settings || {};
      store.settings.volume = v;
      SFX.setVolume(v); save();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && e.target && e.target.id === "goal-input") { e.preventDefault(); saveGoal(); }
    });
  }

  /* ---------- 渲染 ---------- */
  function showAuth(mode) {
    /* 只保留登录：首次登录自动建号 */
    document.getElementById("sheet-inner").innerHTML =
      '<div class="dots"><i></i><i></i><i></i></div>' +
      '<div class="label">登录已有账号</div>' +
      '<div class="mid" style="margin:8px 0 14px">欢迎回来</div>' +
      '<div class="auth-form">' +
        '<input id="auth-user" placeholder="账号（2–16 位）" autocomplete="username" maxlength="16">' +
        '<input id="auth-pass" type="password" placeholder="密码（至少 4 位）" autocomplete="current-password">' +
      "</div>" +
      '<div class="auth-err" id="auth-err"></div>' +
      '<button class="btn lime" data-act="auth-submit">登录</button>' +
      '<button class="btn ghost" style="margin-top:10px" data-act="close">取消</button>' +
      '<p class="auth-tip">首次登录会自动创建账号；账号与进度只保存在这台设备。</p>';
    document.getElementById("sheet").hidden = false; SFX.open();
    var u = document.getElementById("auth-user");
    if (u) u.focus();
  }

  function authErr(msg) {
    var e = document.getElementById("auth-err");
    if (e) e.textContent = msg;
  }

  function submitAuth() {
    var u = ((document.getElementById("auth-user") || {}).value || "").trim();
    var p = (document.getElementById("auth-pass") || {}).value || "";
    if (u.length < 2) return authErr("账号至少 2 个字符");
    if (u.length > 16) return authErr("账号最多 16 个字符");
    if (p.length < 4) return authErr("密码至少 4 位");
    var a = acct.accounts[u];
    if (!a) {
      /* 首次登录即注册 */
      var salt = mkSalt();
      acct.accounts[u] = { salt: salt, hash: hash(salt + p), name: u, avatar: "🦊", created: Date.now() };
      if (Object.keys(acct.accounts).length === 1) {
        try {
          var legacy = localStorage.getItem(KEY);
          if (legacy) { localStorage.setItem(KEY + "." + u, legacy); localStorage.removeItem(KEY); }
        } catch (e) {}
      }
      acct.current = u; saveAcct();
      store = loadStore(u); closeSheet(); render();
      toast("已创建账号并登录");
      return;
    }
    if (a.hash !== hash(a.salt + p)) return authErr("密码不正确");
    acct.current = u; saveAcct();
    store = loadStore(u); closeSheet(); render();
  }

  function render() {
    var html = header() + '<div class="scroll">' + body() + "</div>" + tabs();
    document.getElementById("app").innerHTML = html;
  }

  function header() {
    var right = "";
    if (S.screen === "train" || S.screen === "exam") {
      var s = S.sess;
      right = '<span class="pill">' + (s.mode === "exam" ? timeText() : (s.i + 1) + " / " + s.list.length) + "</span>";
    } else {
      right = '<span class="pill">' + (DB.meta ? DB.meta.total : 0) + " 题</span>";
    }
    return '<div class="hd"><div class="logo"><i>过</i>过线计划</div>' + right + "</div>";
  }

  function tabs() {
    var items = [["home", "book", "学习"], ["kp", "list", "考点"], ["wrong", "review", "错题"], ["me", "user", "我的"]];
    return '<div class="tabs">' + items.map(function (t) {
      return '<button data-act="tab" data-tab="' + t[0] + '" class="' + (S.tab === t[0] ? "on" : "") + '">' +
        '<span class="ic">' + icon(t[1], 20) + "</span>" + t[2] + "</button>";
    }).join("") + "</div>";
  }

  function dday() {
    var d = new Date(DB.meta.examDate + "T00:00:00");
    return Math.max(0, Math.ceil((d - Date.now()) / 864e5));
  }

  function body() {
    if (!DB.meta) return "";
    if (S.screen === "train" || S.screen === "exam") {
      return (S.sess && S.sess.mode === "subjective") ? subjectiveView() : trainView();
    }
    if (S.screen === "kp") return kpView();
    if (S.screen === "wrong") return wrongView();
    if (S.screen === "me") return meView();
    return homeView();
  }

  /* ---------- 首页 ---------- */
  function homeView() {
    var done = todayDone(), goal = PR().daily.goal || 20;
    var pct = Math.min(1, done / goal);
    var due = dueList().length;
    var r = 40, c = 2 * Math.PI * r;
    var curSub = SUBJECTS.filter(function (x) { return x.id === store.current; })[0] || { name: "计算机", title: "计算机基础" };
    var appEl = document.getElementById("app");
    if (appEl) appEl.style.setProperty("--accent", SUB_COLOR[curSub.id] || "#D8F94B");
    return '<div class="sub-bar"><button class="sub-chip" data-act="pick-subject">' +
        '<span class="sdot"></span>' + esc(curSub.title) + ' <i>▾</i></button>' +
        '<span class="label">换科目</span></div>' +
      '<div class="card">' +
        '<div class="dday"><div><div class="label">距离 ' + esc(DB.meta.examName) + '还有</div>' +
        '<div class="n">' + dday() + '<small>天</small></div></div>' +
        '<div class="ring"><svg width="96" height="96"><circle cx="48" cy="48" r="' + r + '" fill="none" stroke="#EDE9E1" stroke-width="10"/>' +
        '<circle cx="48" cy="48" r="' + r + '" fill="none" stroke="#111" stroke-width="10" stroke-linecap="round" stroke-dasharray="' + c + '" stroke-dashoffset="' + (c * (1 - pct)) + '"/></svg>' +
        '<div class="t">' + Math.round(pct * 100) + "%</div></div></div>" +
        '<div style="margin-top:18px" class="label">今日计划 ' + done + " / " + goal + " 题 · 约 " + Math.max(1, Math.round(goal * 25 / 60)) + " 分钟" + (due ? " · 待复习 " + due + " 题" : "") + "</div>" +
        '<button class="btn lime" style="margin-top:14px" data-act="start" data-mode="daily">开始学习 · ' + Math.min(goal, 200) + " 题</button>" +
      "</div>" +
      '<div class="quick">' +
        '<button data-act="start" data-mode="weak"><div class="dot">' + icon("target", 19) + '</div><b>薄弱考点</b><small>' + (weakKps()[0] ? esc(weakKps()[0].kp.name) : "先练几轮再看") + "</small></button>" +
        '<button data-act="start" data-mode="exam"><div class="dot">' + icon("timer", 19) + '</div><b>模拟考</b><small>45 题 · 85 分</small></button>' +
        '<button data-act="tab" data-tab="kp"><div class="dot">' + icon("list", 19) + '</div><b>考点速览</b><small>' + DB.mods.reduce(function (a, m) { return a + m.points.length; }, 0) + " 个考点</small></button>" +
        '<button data-act="tab" data-tab="wrong"><div class="dot deeper">' + icon("review", 19) + '</div><b>错题复习</b><small>' + due + " 题到期</small></button>" +
      "</div>" +
      (function () {
        var sn = DB.list.filter(isSubj).length;
        if (!sn) return "";
        return '<button class="card wide" data-act="start" data-mode="subjective" style="margin-top:14px">' +
          '<div class="wide-row"><div class="dot">' + icon("pen", 18) + '</div>' +
          "<div><b>主观题自评</b><small>默写 / 简答 / 翻译：自己写，自己判</small></div>" +
          '<span class="chip">' + sn + " 题</span></div></button>";
      })() +
      '<div class="card" style="margin-top:14px"><div class="label" style="margin-bottom:10px">模块进度</div>' + moduleBars() + "</div>";
  }

  function moduleBars() {
    return '<div class="bars">' + DB.mods.map(function (m) {
      var n = 0, ok = 0;
      m.points.forEach(function (kp) { kp.qids.forEach(function (id) { var p = PR().progress[id]; if (p) { n += p.n; ok += p.ok; } }); });
      var rate = n ? Math.round(ok / n * 100) : 0;
      return '<div class="bar-row"><span class="nm">' + esc(m.name) + '</span><span class="t"><i style="width:' + rate + '%"></i></span><span class="p">' + (n ? rate + "%" : "—") + "</span></div>";
    }).join("") + "</div>";
  }

  /* ---------- 训练 / 模考 ---------- */
  var OBJECTIVE = { single: 1, multi: 1, judge: 1 };
  var SUBJECTIVE = { blank: 1, short: 1, design: 1 };
  function isObj(q) { return !!OBJECTIVE[q.type]; }
  function isSubj(q) { return !!SUBJECTIVE[q.type]; }

  function startSession(opts) {
    var list = [], mode = opts.mode || "train";
    if (opts.qids) {
      var allQ = opts.qids.map(itemById).filter(Boolean);
      list = allQ.filter(isObj);
      if (!list.length) {
        /* 该考点全是主观题（如文言翻译）→ 走自评模式 */
        list = allQ.filter(isSubj);
        if (list.length) mode = "subjective";
      }
    } else if (mode === "weak") {
      list = weakPool().map(itemById).filter(Boolean);
      if (opts.limit) list = shuffle(list).slice(0, opts.limit);
    } else if (mode === "subjective") {
      list = pick(DB.list.filter(isSubj), opts.n || 8);
    } else if (mode === "exam") {
      var singles = DB.list.filter(function (q) { return q.type === "single"; });
      var multis = DB.list.filter(function (q) { return q.type === "multi"; });
      var judges = DB.list.filter(function (q) { return q.type === "judge"; });
      list = pick(singles, 20).concat(pick(multis, 10)).concat(pick(judges, 15));
    } else {
      var want = opts.n || (mode === "daily" ? (PR().daily.goal || 20) : 20);
      list = pick(DB.list.filter(isObj), Math.max(1, Math.min(want, 200)));
    }
    if (!list.length) return;
    S.sess = {
      mode: mode, list: list, i: 0, picked: [], locked: false, revealed: false,
      answers: [], t0: Date.now(), limit: mode === "exam" ? 60 * 60 * 1000 : 0,
    };
    S.lastCfg = opts;
    S.screen = mode === "exam" ? "exam" : "train";
    S.tab = "home";
    S.last = null; S.result = null;
    if (mode === "exam") startTimer();
    render();
  }

  function startTimer() {
    clearInterval(S.timer);
    S.timer = setInterval(function () {
      if (!S.sess || S.sess.mode !== "exam") return clearInterval(S.timer);
      if (Date.now() - S.sess.t0 > S.sess.limit) { clearInterval(S.timer); finish(true); return; }
      var el = document.getElementById("clock");
      if (el) el.textContent = timeText();
      var left = S.sess.limit - (Date.now() - S.sess.t0);
      if (left <= 10000 && left > 0) SFX.tick();
    }, 1000);
  }
  function timeText() {
    if (!S.sess) return "";
    var left = Math.max(0, S.sess.limit - (Date.now() - S.sess.t0));
    var m = Math.floor(left / 60000), s = Math.floor(left % 60000 / 1000);
    return (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
  }

  function cur() { return S.sess ? S.sess.list[S.sess.i] : null; }

  function trainView() {
    var s = S.sess, q = cur();
    if (!q) return "";
    var total = s.list.length;
    var kp = DB.byKp[q.kp];
    var exam = s.mode === "exam";
    var picked = s.picked || [];
    var done = s.answers.length;
    var opts = "";
    if (q.type === "judge") {
      opts = [["√", "正确"], ["×", "错误"]].map(function (p) {
        var cls = "opt" + (picked[0] === p[0] ? " on" : ""), badge = p[0];
        if (s.locked && !exam) {
          if (p[0] === q.answer) { cls += " ok"; badge = "✓"; }
          else if (picked[0] === p[0]) { cls += " no"; badge = "✕"; }
          else cls += " dim";
        }
        return '<button class="' + cls + '" data-act="pick" data-v="' + p[0] + '"><span class="k">' + badge + "</span><span>" + p[1] + "</span></button>";
      }).join("");
    } else {
      opts = letters(q.options.length).map(function (L, i) {
        var cls = "opt" + (picked.indexOf(L) >= 0 ? " on" : ""), badge = L;
        if (s.locked && !exam) {
          if (q.answer.indexOf(L) >= 0) { cls += " ok"; badge = "✓"; }
          else if (picked.indexOf(L) >= 0) { cls += " no"; badge = "✕"; }
          else cls += " dim";
        }
        return '<button class="' + cls + '" data-act="pick" data-v="' + L + '"><span class="k">' + badge + "</span><span>" + esc(q.options[i]) + "</span></button>";
      }).join("");
    }
    var multiTip = exam
      ? '<button class="btn" style="margin-top:12px" data-act="exam-next">' + (s.i + 1 >= total ? "交卷" : "下一题 →") + "</button>"
      : (q.type === "multi" && !s.locked ? '<button class="btn lime" style="margin-top:12px" data-act="submit">确认选择</button>' : "");
    return '<div class="qtop"><button class="x" data-act="quit">✕</button>' +
        '<div class="bar"><i style="width:' + Math.round((exam ? done : s.i) / total * 100) + '%"></i></div>' +
        (exam ? '<span class="pill" id="clock" style="min-width:64px;text-align:center">' + timeText() + "</span>" : "") +
      "</div>" +
      (exam ? '<button class="btn ghost" style="height:40px;border-radius:14px;margin:2px 0 10px;font-size:13px" data-act="handin">交卷 · 已答 ' + done + " / " + total + "</button>" : "") +
      '<div class="meta"><span>' + (exam ? "模拟考 · 计时中" : "第 " + (s.i + 1) + " 题 / 共 " + total + " 题") + "</span>" +
        "<span>" + (exam ? "交卷自动评分" : "答完即看解析") + "</span></div>" +
      '<div class="qcard"><div class="tagline"><span class="tag lime">' + esc(kp ? kp.moduleName : "") + "</span>" +
        '<span class="tag">' + esc(kp ? kp.name : "") + '</span><span class="tag">' + (q.type === "multi" ? "多选" : q.type === "judge" ? "判断" : "单选") + "</span></div>" +
        '<div class="qtext">' + esc(q.stem) + "</div>" +
        '<div class="opts">' + opts + "</div>" + multiTip + "</div>" +
      (S.last ? feedback() : "");
  }

  function answerBlock(q) {
    return '<div class="answer-block"><div class="w-title">参考答案 / 评分要点</div><p>' + esc(q.answer) + "</p>" +
      '<div class="w-title" style="margin-top:12px">解析</div><p>' + esc(q.analysis) + "</p></div>" +
      '<div class="row" style="margin-top:14px">' +
      '<button class="btn lime" data-act="self-ok">会了</button>' +
      '<button class="btn ghost" data-act="self-no">没记住</button></div>';
  }

  function subjectiveView() {
    var s = S.sess, q = cur();
    var kp = DB.byKp[q.kp];
    var total = s.list.length;
    return '<div class="qtop"><button class="x" data-act="quit">✕</button>' +
        '<div class="bar"><i style="width:' + Math.round(s.i / total * 100) + '%"></i></div>' +
        '<span style="font-size:12px;color:#8A8A82">' + (s.i + 1) + "/" + total + "</span></div>" +
      '<div class="meta"><span>第 ' + (s.i + 1) + " 题 / 共 " + total + ' 题</span><span>自己写，自己判</span></div>' +
      '<div class="qcard"><div class="tagline"><span class="tag lime">' + esc(kp ? kp.moduleName : "") + "</span>" +
        '<span class="tag">' + esc(kp ? kp.name : "") + '</span><span class="tag">主观题</span></div>' +
        '<div class="qtext">' + esc(q.stem) + "</div>" +
        (s.revealed ? "" : '<textarea id="self-note" class="self-note" placeholder="先在纸上写要点（这里可留空）"></textarea>') +
        (s.revealed ? answerBlock(q) : '<button class="btn lime" style="margin-top:14px" data-act="reveal">看答案</button>') +
      "</div>";
  }

  function feedback() {
    var f = S.last, q = f.q;
    var ok = f.ok;
    var ansText = q.type === "judge" ? (q.answer === "√" ? "正确" : "错误") : q.answer;
    if (q.type !== "judge" && q.type !== "multi") {
      ansText = q.answer + "．" + (q.options[idxOf(q.answer)] || "");
    }
    return '<div class="fb ' + (ok ? "" : "no") + '">' +
        "<h4>" + (ok ? "回答正确" : "回答错误") + "</h4>" +
        '<div class="ans">正确答案：' + esc(ansText) + "</div>" +
        "<p>" + esc(q.analysis || "暂无解析") + "</p>" +
        (q.anchor ? '<div class="anchor"><b>记忆锚点</b> ' + esc(q.anchor) + "</div>" : "") +
        '<button class="btn lime" style="margin-top:14px" data-act="next">' + (S.sess.i + 1 >= S.sess.list.length ? "查看结果" : "下一题") + "</button>" +
      "</div>";
  }

  function judge(picked) {
    var s = S.sess, q = cur();
    if (s.locked) return;
    var isMulti = q.type === "multi";
    if (isMulti) { s.picked = picked; render(); return; }
    var ans = picked.join("");
    var ok = ans === q.answer || (q.type === "judge" && ans === q.answer);
    s.locked = true;
    s.picked = picked;
    s.answers.push({ q: q, ok: ok, picked: ans });
    markAnswer(q.id, ok);
    if (ok) SFX.correct(); else SFX.wrong();
    var streak = 0;
    for (var k2 = s.answers.length - 1; k2 >= 0 && s.answers[k2].ok; k2--) streak++;
    if (ok && streak >= 3 && streak % 3 === 0) SFX.streak(streak);
    if (s.mode === "exam") {
      if (s.i + 1 >= s.list.length) return finish(false);
      s.i++; s.picked = []; s.locked = false; return render();
    }
    S.last = { q: q, ok: ok };
    render();
  }

  function submitMulti() {
    var s = S.sess, q = cur();
    if (!s.picked.length) return;
    var ok = s.picked.slice().sort().join("") === q.answer.split("").sort().join("");
    s.locked = true;
    s.answers.push({ q: q, ok: ok, picked: s.picked.join("") });
    markAnswer(q.id, ok);
    if (ok) SFX.correct(); else SFX.wrong();
    if (s.mode === "exam") {
      if (s.i + 1 >= s.list.length) return finish(false);
      s.i++; s.picked = []; s.locked = false; return render();
    }
    S.last = { q: q, ok: ok };
    render();
  }

  function next() {
    var s = S.sess;
    if (s.i + 1 >= s.list.length) return finish(false);
    s.i++; s.picked = []; s.locked = false; S.last = null; render();
  }

  function finish(timeout) {
    var s = S.sess;
    clearInterval(S.timer);
    var right = s.answers.filter(function (a) { return a.ok; }).length;
    var sec = Math.round((Date.now() - s.t0) / 1000);
    if (s.mode === "exam") {
      var single = s.list.filter(function (q) { return q.type === "single"; }).length;
      var score = 0, idx = 0;
      var map = {};
      s.answers.forEach(function (a) { map[a.q.id] = a.ok; });
      s.list.forEach(function (q) {
        var ok = !!map[q.id];
        if (q.type === "single") score += ok ? 2 : 0;
        else if (q.type === "multi") score += ok ? 3 : 0;
        else score += ok ? 1 : 0;
      });
      S.result = { mode: "exam", score: score, total: 85, right: right, n: s.list.length, answers: s.answers, timeout: timeout, sec: sec };
    } else {
      S.result = { mode: s.mode === "subjective" ? "subjective" : "train", right: right,
                   n: s.list.length, answers: s.answers, sec: sec };
      PR().sessions = (PR().sessions || 0) + 1;
      save();
    }
    S.screen = "result";
    S.sess = null;
    SFX.finish();
    render();
  }

  function mmss(sec) {
    var m = Math.floor(sec / 60), s = sec % 60;
    return (m ? m + " 分 " : "") + s + " 秒";
  }

  function resultView() {
    var r = S.result;
    var pct = Math.round(r.right / r.n * 100);
    var wrong = r.answers.filter(function (a) { return !a.ok; });
    var head = r.mode === "exam"
      ? '<div class="label">模拟考 · ' + (r.timeout ? "时间到，自动交卷" : "已交卷") + '</div><div class="score">' + r.score + '<span style="font-size:26px;color:#8A8A82"> / 85</span></div>'
      : '<div class="label">' + (r.mode === "subjective" ? "自评掌握率" : "本轮正确率") + '</div><div class="score">' + pct + '%</div>';
    var advice = r.mode === "subjective"
      ? (pct >= 80 ? "这些要点你能复述出来，说明记牢了；明天只复习没记住的那几道。"
                   : "把没记住的题对照解析读一遍，再用自己的话复述要点，明天它们会再出现。")
      : (pct >= 90 ? "掌握得很好。下一轮建议直接练薄弱考点，把时间花在没吃透的地方。"
      : pct >= 70 ? "基本掌握。错题已按遗忘曲线排进复习计划，明天会再出现。"
      : "建议先逐题看解析，把错的知识点复述一遍，再练一轮同考点的题。");
    return '<div class="card" style="margin-top:8px">' + head +
        '<div class="label" style="margin-top:6px">用时 ' + mmss(r.sec || 0) + " · 共 " + r.n + " 题" + (r.mode === "exam" ? " · 正确率 " + pct + "%" : "") + "</div>" +
        '<div class="stat3"><div><b>' + r.right + "</b><small>" + (r.mode === "subjective" ? "会了" : "答对") + "</small></div><div><b>" + (r.n - r.right) + "</b><small>" + (r.mode === "subjective" ? "没记住" : "答错") + "</small></div><div><b>" + pct + "%</b><small>" + (r.mode === "subjective" ? "掌握率" : "正确率") + "</small></div></div>" +
        '<div class="advice">' + advice + "</div>" +
      "</div>" +
      '<div class="congrats"><div class="congrats-card">' +
        '<div class="cheer">🎉</div>' +
        "<h2>你真棒！</h2>" +
        "<p>" + (r.mode === "exam" ? "模拟考完成" : "完成一轮 " + r.n + " 题") + " · " +
          (r.mode === "subjective" ? "掌握率 " : "正确率 ") + pct + "% · 用时 " + mmss(r.sec || 0) + "</p>" +
        '<button class="btn lime" style="margin-top:16px" data-act="again">继续答题</button>' +
        '<button class="btn ghost" style="margin-top:10px" data-act="rest">休息一下</button>' +
      "</div></div>" +
      (wrong.length ? '<div class="card"><div class="label" style="margin-bottom:12px">本轮错题 ' + wrong.length + " 题</div>" +
        wrong.map(function (a) {
          return '<div class="item"><div class="s">' + esc(a.q.stem) + '</div><div class="m"><span>正确答案 ' + esc(a.q.answer) + "</span><span>" + esc(DB.byKp[a.q.kp] ? DB.byKp[a.q.kp].name : "") + "</span></div></div>";
        }).join("") + "</div>" : "");
  }

  /* ---------- 考点 ---------- */
  function kpView() {
    var open = S.openCh || (S.openCh = {});
    var groups = DB.mods.map(function (m) {
      var totalQ = m.points.reduce(function (a, p) { return a + p.qids.length; }, 0);
      var isOpen = !!open[m.id];
      var head = '<button class="ch-head" data-act="toggle-ch" data-ch="' + m.id + '">' +
        '<span class="ch-name">' + esc(m.name) + "</span>" +
        '<span class="ch-meta">' + m.points.length + " 考点 · " + totalQ + " 题</span>" +
        '<span class="ch-arrow">' + (isOpen ? "▾" : "▸") + "</span></button>";
      var body = !isOpen ? "" : '<div class="ch-body">' + m.points.map(function (kp) {
          var n = 0, ok = 0;
          kp.qids.forEach(function (id) { var p = PR().progress[id]; if (p) { n += p.n; ok += p.ok; } });
          var weak = n >= 2 && ok / n < 0.6;
          return '<button class="kp" data-act="kp" data-kp="' + kp.id + '">' +
            '<span class="nm">' + esc(kp.name) + "</span>" +
            (weak ? '<span class="weak"></span>' : "") +
            '<span class="ct">' + kp.qids.length + ' 题</span><span class="go">开练</span></button>';
        }).join("") + "</div>";
      return '<div class="ch-block' + (isOpen ? " open" : "") + '">' + head + body + "</div>";
    }).join("");
    return '<div class="card" style="margin-top:8px;padding:18px"><div class="mid">考点速览</div>' +
      '<div class="label" style="margin-top:6px">点考点直接开练，解析里带记忆锚点</div></div>' + groups;
  }

  function showKp(id) {
    var kp = DB.byKp[id];
    if (!kp) return;
    var inner = '<div class="dots"><i></i><i></i><i></i></div>' +
      '<div class="label">' + esc(kp.moduleName) + "</div>" +
      '<div class="mid" style="margin:8px 0 14px">' + esc(kp.name) + "</div>" +
      (kp.keys && kp.keys.length ? kp.keys.map(function (k) { return '<div class="item"><div class="s">' + esc(k) + "</div></div>"; }).join("") : '<div class="empty">这个考点还没有要点摘要</div>') +
      (function () {
        var objN = kp.qids.filter(function (qid) { var q = DB.items[qid]; return q && isObj(q); }).length;
        var subN = kp.qids.length - objN;
        return '<button class="btn lime" style="margin-top:14px" data-act="kp-start" data-kp="' + id + '">练这个考点 · ' + (objN || subN) + " 题</button>" +
          (subN && objN ? '<div class="label" style="margin-top:8px;text-align:center">另有 ' + subN + " 道主观题，会在自评模式里出现</div>" : "");
      })() +
      '<button class="btn ghost" style="margin-top:10px" data-act="close">关闭</button>';
    document.getElementById("sheet-inner").innerHTML = inner;
    document.getElementById("sheet").hidden = false;
  }

  /* ---------- 错题 ---------- */
  function wrongView() {
    var due = dueList();
    var all = [];
    for (var id in PR().progress) {
      var p = PR().progress[id];
      if (p.box < 3) all.push({ q: DB.items[id], p: p });
    }
    all = all.filter(function (x) { return x.q; });
    all.sort(function (a, b) { return (a.p.box) - (b.p.box); });
    var rows = all.slice(0, 60).map(function (x) {
      return '<div class="item"><div class="s">' + esc(x.q.stem) + "</div>" +
        '<div class="m"><span>保持 ' + Math.round(retention(x.p) * 100) + "%</span><span>下次 " + nextReviewText(x.p) + "</span><span>错 " + (x.p.n - x.p.ok) + " 次</span><span>" + esc(DB.byKp[x.q.kp] ? DB.byKp[x.q.kp].name : "") + "</span></div></div>";
    }).join("");
    return '<div class="card" style="margin-top:8px;padding:18px">' +
        '<div class="mid">错题本</div>' +
        '<div class="label" style="margin-top:6px">' + due.length + " 题到期 · 共 " + all.length + " 题待消化</div>" +
        '<button class="btn lime" style="margin-top:14px" data-act="review">复习到期 ' + Math.min(20, due.length) + " 题</button></div>" +
      (rows || '<div class="empty">还没有错题，去首页开一轮吧</div>');
  }

  /* ---------- 我的 ---------- */
  function curveSvg() {
    var pts = [];
    for (var d = 0; d <= 30; d++) {
      var r = Math.exp(-d / 3.5);
      pts.push((8 + d * 9.4).toFixed(1) + " " + (96 - r * 78).toFixed(1));
    }
    return '<svg viewBox="0 0 300 112" style="width:100%;height:auto;margin-top:8px">' +
      '<path d="M' + pts.join(" L") + '" fill="none" stroke="#111" stroke-width="2.5" stroke-linecap="round"/>' +
      '<line x1="8" y1="96" x2="292" y2="96" stroke="#E9E6DE"/>' +
      '<text x="8" y="109" font-size="9" fill="#8A8A82">0 天</text>' +
      '<text x="128" y="109" font-size="9" fill="#8A8A82">7 天</text>' +
      '<text x="252" y="109" font-size="9" fill="#8A8A82">30 天</text></svg>';
  }

  var pendingAvatar = null;

  function showProfile() {
    var a = acct.accounts[acct.current];
    pendingAvatar = a.avatar;
    var picks = EMOJIS.map(function (e) {
      return '<button class="ava' + (a.avatar === e ? " on" : "") + '" data-act="ava-pick" data-v="' + e + '">' + e + "</button>";
    }).join("");
    document.getElementById("sheet-inner").innerHTML =
      '<div class="dots"><i></i><i></i><i></i></div>' +
      '<div class="label">编辑资料</div>' +
      '<div class="mid" style="margin:8px 0 14px">头像与昵称</div>' +
      '<div style="display:flex;justify-content:center;margin-bottom:14px" id="ava-preview">' + avatarHtml({ avatar: pendingAvatar }, 72) + "</div>" +
      '<div class="ava-grid">' + picks + "</div>" +
      '<label class="btn ghost" style="margin-top:12px;display:flex"><input id="ava-file" type="file" accept="image/*" style="display:none">上传图片</label>' +
      '<input id="prof-name" class="name-input" maxlength="12" value="' + esc(a.name) + '" placeholder="昵称">' +
      '<button class="btn lime" style="margin-top:12px" data-act="profile-save">保存</button>' +
      '<button class="btn ghost" style="margin-top:10px" data-act="close">取消</button>';
    document.getElementById("sheet").hidden = false; SFX.open();
    var f = document.getElementById("ava-file");
    if (f) f.addEventListener("change", onAvatarFile);
  }

  function onAvatarFile(e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    var img = new Image();
    var url = URL.createObjectURL(file);
    img.onload = function () {
      var c = document.createElement("canvas");
      c.width = 128; c.height = 128;
      var ctx = c.getContext("2d");
      var s = Math.min(img.width, img.height);
      ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 128, 128);
      pendingAvatar = c.toDataURL("image/jpeg", 0.82);
      var pv = document.getElementById("ava-preview");
      if (pv) pv.innerHTML = avatarHtml({ avatar: pendingAvatar }, 72);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }

  function meView() {
    var total = 0, ok = 0;
    for (var id in PR().progress) { var p = PR().progress[id]; total += p.n; ok += p.ok; }
    var acc = total ? Math.round(ok / total * 100) : 0;
    var done = todayDone();
    var seen = 0, sumR = 0;
    for (var qid in PR().progress) { var pp = PR().progress[qid]; if (pp.last) { seen++; sumR += retention(pp); } }
    var avgR = seen ? Math.round(sumR / seen * 100) : 0;
    var me = acct.current ? acct.accounts[acct.current] : null;
    var head = me
      ? '<div class="card profile-card">' +
          '<div class="pava">' + avatarHtml(me, 54) + "</div>" +
          '<div class="pinfo"><b>' + esc(me.name) + "</b><small>@" + esc(acct.current) + "</small></div>" +
          '<button class="chip" data-act="profile">编辑资料</button>' +
        "</div>"
      : '<div class="card">' +
          '<div style="display:flex;align-items:center;gap:14px">' +
            '<div class="pava">🙂</div>' +
            '<div class="pinfo"><b>未登录</b><small>进度保存在本机，登录后按账号分开</small></div>' +
          "</div>" +
          '<div style="margin-top:16px">' +
            '<button class="btn lime" style="height:46px" data-act="auth-open" data-m="login">登录</button>' +
          "</div></div>";
    return head +
      '<div class="card">' +
        '<div class="label">累计正确率</div><div class="big">' + acc + '%</div>' +
        '<div class="stat3"><div><b>' + total + "</b><small>累计做题</small></div><div><b>" + done + "</b><small>今日</small></div><div><b>" + (PR().sessions || 0) + "</b><small>学习轮次</small></div></div>" +
      "</div>" +
      '<div class="card"><div class="label">平均记忆保持度</div><div class="big">' + avgR + '%</div>' +
        '<div class="label" style="margin-top:10px;line-height:1.7">复习节点：10 分 → 30 分 → 12 时 → 1 天 → 2 天 → 4 天 → 7 天 → 15 天 → 30 天 → 60 天。答对一格，答错回到第一格。</div>' +
        curveSvg() +
        '<div class="label" style="margin-top:4px">曲线为典型遗忘曲线；每答对一次，下次复习就往右推一格。</div></div>' +
      '<div class="card"><div class="label" style="margin-bottom:12px">各模块正确率</div>' + moduleBars() + "</div>" +
      '<div class="card"><div class="label" style="margin-bottom:10px">设置</div>' +
        '<div class="row"><button class="btn ghost" data-act="goal">每日目标：' + (PR().daily.goal || 20) + " 题</button>" +
        '<button class="btn ghost" data-act="sfx">音效 ' + (store.settings && store.settings.sfx === false ? "关" : "开") + "</button></div>" +
        '<div class="vol-row"><span class="label">音量</span><input id="vol" type="range" min="0" max="100" value="' +
          Math.round(((store.settings && typeof store.settings.volume === "number") ? store.settings.volume : 0.7) * 100) + '"></div>' +
        '<div class="row" style="margin-top:10px"><button class="btn ghost" data-act="export">导出进度</button><button class="btn ghost" data-act="reset">清空进度</button></div>' +
        (acct.current ? '<div class="row" style="margin-top:10px"><button class="btn ghost" data-act="logout">退出登录</button></div>' : "") +
      "</div>";
  }

  /* ---------- 科目切换 ---------- */
  function showSubjectSheet() {
    var rows = SUBJECTS.map(function (s) {
      var on = s.id === store.current;
      return '<button class="sub-row' + (on ? " on" : "") + '" data-act="switch-subject" data-sid="' + s.id + '">' +
        '<span class="sub-name">' + esc(s.title) + "</span>" +
        '<span class="sub-meta">' + (s.total ? s.total + " 题 · " + s.kps + " 考点" : "") + "</span>" +
        (on ? '<span class="sub-check">✓</span>' : "") + "</button>";
    }).join("");
    document.getElementById("sheet-inner").innerHTML =
      '<div class="dots"><i></i><i></i><i></i></div>' +
      '<div class="label">切换学习科目</div>' +
      '<div class="mid" style="margin:8px 0 14px">三个科目进度独立</div>' +
      rows +
      '<button class="btn ghost" style="margin-top:10px" data-act="close">取消</button>';
    document.getElementById("sheet").hidden = false; SFX.open();
  }

  function switchSubject(sid) {
    if (!sid || sid === store.current) { closeSheet(); return; }
    if (!store.subs[sid]) store.subs[sid] = freshSub();
    store.current = sid;
    save(); closeSheet();
    S.screen = "home"; S.tab = "home"; S.sess = null; S.result = null; S.lastCfg = null;
    loadSubjectData(sid).then(function () {
      render();
      var nm = (SUBJECTS.filter(function (x) { return x.id === sid; })[0] || {}).title || "";
      toast("已切换到 " + nm);
    });
  }

  function weakPool() {
    var ids = [];
    weakKps().forEach(function (w) {
      var obj = w.kp.qids.filter(function (id) { var q = DB.items[id]; return q && isObj(q); });
      ids = ids.concat(pick(obj, 5));
    });
    return ids;
  }

  function showWeakConfirm(total, left) {
    var title = left > 0
      ? "薄弱考点共 " + total + " 题，今日目标还剩 " + left + " 题。"
      : "今日目标已完成，薄弱考点还有 " + total + " 题。";
    document.getElementById("sheet-inner").innerHTML =
      '<div class="dots"><i></i><i></i><i></i></div>' +
      '<div class="label">薄弱考点</div>' +
      '<div class="mid" style="margin:8px 0 8px">要一次做完吗？</div>' +
      '<p class="muted" style="line-height:1.7;margin-bottom:16px">' + title +
      "<br>一次做完会超出今日目标，但复习进度照常记录。</p>" +
      '<button class="btn lime" data-act="weak-all">全部做完 · ' + total + " 题</button>" +
      (left > 0 ? '<button class="btn ghost" style="margin-top:10px" data-act="weak-part" data-n="' + left + '">只做今日剩余 · ' + left + " 题</button>" : "") +
      '<button class="btn ghost" style="margin-top:10px" data-act="close">取消</button>';
    document.getElementById("sheet").hidden = false;
    SFX.open();
  }

  function showKpConfirm(kid, total, left) {
    var kp = DB.byKp[kid] || { name: "这个考点" };
    var title = left > 0 ? "这个考点共 " + total + " 题，今日目标还剩 " + left + " 题。" : "今日目标已完成，这个考点还有 " + total + " 题。";
    var sub = left > 0 ? "一次做完会超出今日目标，但复习进度照常记录。" : "额外练习不计入今日目标，但会计入复习计划。";
    document.getElementById("sheet-inner").innerHTML =
      '<div class="dots"><i></i><i></i><i></i></div>' +
      '<div class="label">' + esc(kp.name) + "</div>" +
      '<div class="mid" style="margin:8px 0 8px">要一次做完吗？</div>' +
      '<p class="muted" style="line-height:1.7;margin-bottom:16px">' + title + "<br>" + sub + "</p>" +
      '<button class="btn lime" data-act="kp-all" data-kp="' + kid + '">全部做完 · ' + total + " 题</button>" +
      (left > 0 ? '<button class="btn ghost" style="margin-top:10px" data-act="kp-part" data-kp="' + kid + '" data-n="' + left + '">只做今日剩余 · ' + left + " 题</button>" : "") +
      '<button class="btn ghost" style="margin-top:10px" data-act="close">取消</button>';
    document.getElementById("sheet").hidden = false;
    SFX.open();
  }

  /* ---------- 每日目标 ---------- */
  function showGoalEditor() {
    var g = PR().daily.goal || 20;
    var presets = [10, 15, 20, 30, 50, 100].map(function (v) {
      return '<button data-act="goal-preset" data-v="' + v + '" class="' + (v === g ? "on" : "") + '">' + v + "</button>";
    }).join("");
    document.getElementById("sheet-inner").innerHTML =
      '<div class="dots"><i></i><i></i><i></i></div>' +
      '<div class="label">每日目标</div>' +
      '<div class="mid" style="margin:8px 0 6px">每天练多少题？</div>' +
      '<div class="label" style="margin-bottom:14px">建议 15–30 题（约 8–15 分钟）；考前一个月可以加到 50。</div>' +
      '<input id="goal-input" class="goal-input" type="number" inputmode="numeric" min="1" max="200" value="' + g + '">' +
      '<div class="chips" style="margin-top:14px">' + presets + "</div>" +
      '<button class="btn lime" style="margin-top:4px" data-act="goal-save">保存</button>' +
      '<button class="btn ghost" style="margin-top:10px" data-act="close">取消</button>';
    document.getElementById("sheet").hidden = false; SFX.open();
    var inp = document.getElementById("goal-input");
    if (inp) { inp.focus(); inp.select(); }
  }

  function saveGoal() {
    var inp = document.getElementById("goal-input");
    var v = parseInt(inp ? inp.value : "", 10);
    if (!v || v < 1) { toast("请输入 1–200 之间的整数"); return; }
    v = Math.min(200, v);
    PR().daily.goal = v; save(); closeSheet(); render();
    toast("每日目标已设为 " + v + " 题");
  }

  /* ---------- 事件 ---------- */
  function onClick(e) {
    var t = e.target.closest("[data-act]");
    if (!t) return;
    var act = t.getAttribute("data-act");
    SFX.click();
    if (act === "reveal") { S.sess.revealed = true; SFX.reveal(); render(); return; }
    if (act === "self-ok" || act === "self-no") {
      var sok = act === "self-ok", ss = S.sess, sq = cur();
      ss.answers.push({ q: sq, ok: sok, picked: "" });
      markAnswer(sq.id, sok);
      if (sok) SFX.correct(); else SFX.wrong();
      if (ss.i + 1 >= ss.list.length) { finish(false); return; }
      ss.i++; ss.revealed = false; render(); return;
    }
    if (act === "pick-subject") { showSubjectSheet(); return; }
    if (act === "switch-subject") { switchSubject(t.getAttribute("data-sid")); return; }
    if (act === "toggle-ch") {
      var cid = t.getAttribute("data-ch");
      S.openCh = S.openCh || {};
      S.openCh[cid] = !S.openCh[cid];
      render(); return;
    }
    if (act === "auth-open") { showAuth(t.getAttribute("data-m")); return; }
    if (act === "auth-mode") { showAuth(t.getAttribute("data-m")); return; }
    if (act === "auth-submit") { submitAuth(); return; }
    if (act === "tab") { S.screen = "home"; S.tab = t.getAttribute("data-tab"); if (S.tab !== "home") S.screen = S.tab; render(); return; }
    if (act === "start") {
      var mm = t.getAttribute("data-mode");
      if (mm === "weak") {
        var pool = weakPool();
        var left = Math.max(0, (PR().daily.goal || 20) - todayDone());
        if (pool.length > left) { showWeakConfirm(pool.length, left); return; }
      }
      return startSession({ mode: mm });
    }
    if (act === "pick") {
      var v = t.getAttribute("data-v");
      if (S.sess.mode === "exam" || cur().type === "multi") {
        var p = S.sess.picked || [];
        var i = p.indexOf(v);
        if (i >= 0) p.splice(i, 1); else p.push(v);
        S.sess.picked = p; render(); return;
      }
      return judge([v]);
    }
    if (act === "submit") return submitMulti();
    if (act === "next") return next();
    if (act === "exam-next") {
      var s2 = S.sess, q2 = cur();
      if (!s2 || !q2 || !s2.picked.length) return;
      var ok2 = q2.type === "multi"
        ? s2.picked.slice().sort().join("") === q2.answer.split("").sort().join("")
        : s2.picked.join("") === q2.answer;
      s2.answers.push({ q: q2, ok: ok2, picked: s2.picked.join("") });
      markAnswer(q2.id, ok2);
      if (ok2) SFX.correct(); else SFX.wrong();
      if (s2.i + 1 >= s2.list.length) return finish(false);
      s2.i++; s2.picked = []; return render();
    }
    if (act === "handin") { if (confirm("交卷？还有 " + (S.sess.list.length - S.sess.answers.length) + " 题未答")) return finish(false); return; }
    if (act === "quit") { S.sess = null; S.screen = "home"; S.tab = "home"; clearInterval(S.timer); render(); return; }
    if (act === "kp") return showKp(t.getAttribute("data-kp"));
    if (act === "kp-start") {
      var kid0 = t.getAttribute("data-kp");
      var kp0 = DB.byKp[kid0];
      var obj0 = kp0.qids.filter(function (id) { var q = DB.items[id]; return q && isObj(q); });
      var total0 = obj0.length || kp0.qids.length;
      var left0 = Math.max(0, (PR().daily.goal || 20) - todayDone());
      if (total0 > left0) { showKpConfirm(kid0, total0, left0); return; }
      closeSheet();
      return startSession({ qids: kp0.qids });
    }
    if (act === "weak-all") { closeSheet(); startSession({ mode: "weak" }); return; }
    if (act === "weak-part") { closeSheet(); startSession({ mode: "weak", limit: parseInt(t.getAttribute("data-n"), 10) || 10 }); return; }
    if (act === "kp-all") { closeSheet(); startSession({ qids: DB.byKp[t.getAttribute("data-kp")].qids }); return; }
    if (act === "kp-part") {
      var kid1 = t.getAttribute("data-kp");
      var obj1 = DB.byKp[kid1].qids.filter(function (id) { var q = DB.items[id]; return q && isObj(q); });
      var n1 = parseInt(t.getAttribute("data-n"), 10) || 10;
      closeSheet();
      startSession({ qids: pick(obj1, n1) });
      return;
    }
    if (act === "close") return closeSheet();
    if (act === "review") { var ids = dueList().slice(0, 20).map(function (x) { return x.q.id; }); return startSession({ qids: ids }); }
    if (act === "again") {
      var cfg0 = S.lastCfg || { mode: "daily" };
      S.result = null; S.screen = "home"; S.tab = "home";
      startSession(cfg0);
      return;
    }
    if (act === "rest") { S.result = null; S.screen = "home"; S.tab = "home"; S.lastCfg = null; render(); return; }
    if (act === "profile") { showProfile(); return; }
    if (act === "ava-pick") {
      pendingAvatar = t.getAttribute("data-v");
      var pv = document.getElementById("ava-preview");
      if (pv) pv.innerHTML = avatarHtml({ avatar: pendingAvatar }, 72);
      var all = document.querySelectorAll(".ava");
      for (var ai = 0; ai < all.length; ai++) all[ai].classList.toggle("on", all[ai] === t);
      return;
    }
    if (act === "profile-save") {
      var nmEl = document.getElementById("prof-name");
      var nm = (nmEl ? nmEl.value : "").trim().slice(0, 12);
      if (!nm) { toast("昵称不能为空"); return; }
      var mea = acct.accounts[acct.current];
      mea.name = nm;
      if (pendingAvatar) mea.avatar = pendingAvatar;
      saveAcct(); closeSheet(); render(); toast("资料已更新");
      return;
    }
    if (act === "logout") {
      save(); acct.current = ""; saveAcct();
      store = loadStore("guest"); authMode = "login"; render(); toast("已退出，回到本机进度");
      return;
    }
    if (act === "sfx") { store.settings = store.settings || {}; store.settings.sfx = !(store.settings.sfx !== false); SFX.set(store.settings.sfx); save(); render(); return; }
    if (act === "goal") { showGoalEditor(); return; }
    if (act === "goal-preset") {
      var gi = document.getElementById("goal-input");
      if (gi) { gi.value = t.getAttribute("data-v"); gi.focus(); }
      return;
    }
    if (act === "goal-save") { saveGoal(); return; }
    if (act === "export") {
      try {
        var blob = new Blob([JSON.stringify(store)], { type: "application/json" });
        var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "guoxian-progress.json"; a.click();
      } catch (err) {}
      return;
    }
    if (act === "reset") { if (confirm("清空全部学习进度？")) { store = { v: 1, progress: {}, daily: { ymd: "", done: 0, goal: 20 }, sessions: 0 }; save(); render(); } return; }
  }
  function autoPlay() {
    if (!S.sess || S.screen === "result") return;
    var q = cur();
    if (!q) return finish(false);
    if (q.type === "multi") { S.sess.picked = q.answer.split(""); submitMulti(); }
    else judge(q.answer.split(""));
    setTimeout(function () {
      if (S.screen === "result") return;
      next();
      setTimeout(autoPlay, 150);
    }, 260);
  }
  function closeSheet() { document.getElementById("sheet").hidden = true; SFX.close(); }

  /* 结果页单独渲染 */
  var _body = body;
  body = function () { if (S.screen === "result") return resultView(); return _body(); };
})();
