/* 过线计划 · 音效系统
   设计原则：安静、有质感、不抢注意力。全部 WebAudio 合成，无音频文件。
   总线：master gain → compressor → destination，避免叠加削波。 */
window.SFX = (function () {
  var ctx = null, master = null, comp = null;
  var on = true, vol = 0.7, lastAt = {};
  var CB = {};

  function ac() {
    if (!on) return null;
    try {
      if (!ctx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = vol;
        comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -18;
        comp.knee.value = 24;
        comp.ratio.value = 3;
        comp.attack.value = 0.004;
        comp.release.value = 0.18;
        master.connect(comp);
        comp.connect(ctx.destination);
      }
      if (ctx.state === "suspended") ctx.resume();
      return ctx;
    } catch (e) { return null; }
  }

  function throttle(key, ms) {
    var t = Date.now();
    if (lastAt[key] && t - lastAt[key] < ms) return false;
    lastAt[key] = t;
    return true;
  }

  /* 单个音符：指数衰减包络，起音 8ms，避免爆音 */
  function tone(freq, dur, type, peak, delay, slideTo) {
    var c = ac(); if (!c) return;
    var t0 = c.currentTime + (delay || 0);
    var o = c.createOscillator(), g = c.createGain();
    o.type = type || "sine";
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak || 0.08), t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.03);
  }

  /* 噪声：用于纸页、开合、轻微摩擦 */
  function air(dur, peak, hp, delay) {
    var c = ac(); if (!c) return;
    var len = Math.floor(c.sampleRate * dur);
    if (len <= 0) return;
    var buf = c.createBuffer(1, len, c.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) {
      var k = 1 - i / len;
      d[i] = (Math.random() * 2 - 1) * k * k;
    }
    var src = c.createBufferSource(); src.buffer = buf;
    var f = c.createBiquadFilter(); f.type = "highpass"; f.frequency.value = hp || 900;
    var g = c.createGain();
    var t0 = c.currentTime + (delay || 0);
    g.gain.setValueAtTime(peak || 0.05, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t0);
  }

  function buzz(ms) {
    try { if (navigator.vibrate) navigator.vibrate(ms || 8); } catch (e) {}
  }

  var api = {
    init: function (opt) {
      opt = opt || {};
      on = opt.enabled !== false;
      vol = typeof opt.volume === "number" ? opt.volume : 0.7;
      if (master) master.gain.value = vol;
    },
    set: function (v) { on = !!v; if (!on) { try { if (ctx && ctx.state === "running") ctx.suspend(); } catch (e) {} } else ac(); },
    setVolume: function (v) {
      vol = Math.max(0, Math.min(1, v));
      if (master) master.gain.setTargetAtTime(vol, ctx.currentTime, 0.05);
    },
    enabled: function () { return on; },

    /* —— 界面 —— */
    tap: function () { if (!throttle("tap", 45)) return; tone(520, 0.045, "triangle", 0.05); },
    select: function () { if (!throttle("sel", 40)) return; tone(660, 0.05, "sine", 0.06, 0, 720); },
    open: function () { air(0.16, 0.05, 700); tone(392, 0.12, "sine", 0.045); },
    close: function () { air(0.13, 0.04, 600); tone(330, 0.1, "sine", 0.035, 0, 300); },
    reveal: function () { air(0.18, 0.045, 1200); tone(523, 0.09, "triangle", 0.05); tone(784, 0.12, "triangle", 0.04, 0.05); },

    /* —— 答题 —— */
    correct: function () {
      if (!throttle("ok", 90)) return;
      tone(784, 0.1, "sine", 0.055);
      tone(1175, 0.16, "sine", 0.04, 0.06);
      buzz(10);
    },
    wrong: function () {
      if (!throttle("no", 140)) return;
      tone(220, 0.16, "sine", 0.05, 0, 174);
      air(0.09, 0.03, 400);
      buzz(22);
    },
    streak: function (n) {
      var base = 660 + Math.min(4, (n || 3) - 3) * 80;
      tone(base, 0.07, "triangle", 0.04);
      tone(base * 1.5, 0.1, "triangle", 0.035, 0.06);
    },

    /* —— 计时 —— */
    tick: function () { if (!throttle("tick", 800)) return; tone(880, 0.025, "sine", 0.025); },
    warn: function () { tone(1046, 0.06, "square", 0.03); tone(784, 0.1, "square", 0.025, 0.09); },

    /* —— 收尾 —— */
    complete: function () {
      [523, 659, 784].forEach(function (f, i) { tone(f, 0.22, "triangle", 0.055, i * 0.1); });
    }
  };

  /* 旧 API 兼容 */
  api.click = api.tap;
  api.finish = api.complete;
  api.lose = function () { tone(392, 0.18, "sine", 0.04, 0, 330); };
  api.speakWord = function () {};
  return api;
})();
