/* ───────────────────────────────────────────────────────────────────────────
   Forza Tunes — telemetry integration
   - Live telemetry panel, mounted above the Lap Diagnostics column
   - Auto-fills the calculator inputs from the car you're driving
   - Wraps the Car Specifications block in a collapsible accordion
   - Telemetry-assisted diagnostics: detects symptoms (tire overheating,
     under/oversteer bias, suspension bottoming) and flags them in the
     existing diagnostics system.
   ─────────────────────────────────────────────────────────────────────────── */
(function () {
  "use strict";

  // ── helpers ───────────────────────────────────────────────────────────────
  function piToClass(pi) {
    if (pi >= 999) return "X";
    if (pi >= 901) return "S2";
    if (pi >= 801) return "S1";
    if (pi >= 701) return "A";
    if (pi >= 601) return "B";
    if (pi >= 501) return "C";
    return "D";
  }

  function tempColour(c) {
    if (c < 65) return "#4aa3ff";
    if (c < 80) return "#3fd07a";
    if (c <= 100) return "#7dff9b";
    if (c <= 115) return "#ffd23f";
    return "#ff5a5a";
  }

  // Paint a shift-light strip (green → yellow → red, blink at the limiter).
  function paintShift(id, frac) {
    var el = document.getElementById(id);
    if (!el) return;
    var leds = el.querySelectorAll("i");
    var lit = Math.round(frac * leds.length);
    for (var n = 0; n < leds.length; n++) {
      leds[n].className = n < lit ? (n < leds.length * 0.6 ? "on g" : n < leds.length * 0.85 ? "on y" : "on r") : "";
    }
    el.classList.toggle("redline", frac >= 0.97);
  }

  // ── styles ────────────────────────────────────────────────────────────────
  var css =
    "#ft-panel{font-family:var(--font-mono);font-size:11px;color:var(--text);" +
    "background:var(--surface);border:1px solid var(--border);border-radius:10px;" +
    "padding:12px 13px;margin-bottom:14px}" +
    "#ft-panel .ft-hd{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}" +
    "#ft-panel .ft-stat{font-weight:700;letter-spacing:.4px;font-size:11px}" +
    "#ft-panel .ft-dot{color:#ff5a5a}#ft-panel.live .ft-dot{color:#3fd07a}" +
    "#ft-panel label.ft-af{display:flex;align-items:center;gap:5px;font-size:10px;color:var(--text-dim);cursor:pointer}" +
    "#ft-panel .ft-big{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:8px;text-align:center}" +
    "#ft-panel .ft-cell .v{font-size:20px;font-weight:700;color:var(--val);line-height:1.1}" +
    "#ft-panel .ft-cell .k{font-size:9px;color:var(--muted);letter-spacing:.5px}" +
    "#ft-panel .ft-rpm{height:6px;background:var(--bg);border-radius:3px;overflow:hidden;margin-bottom:9px}" +
    "#ft-panel .ft-rpm i{display:block;height:100%;background:linear-gradient(90deg,#3fd07a,#ffd23f,#ff5a5a);width:0%}" +
    "#ft-panel .ft-pt{display:flex;justify-content:space-between;font-size:10px;color:var(--text-dim);margin-bottom:10px}" +
    "#ft-panel .ft-pt b{color:var(--val)}" +
    "#ft-panel .ft-tires{display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-bottom:10px}" +
    "#ft-panel .ft-tire{background:var(--bg2);border-radius:5px;padding:5px 0;text-align:center}" +
    "#ft-panel .ft-tire .tv{font-weight:700;font-size:14px}#ft-panel .ft-tire .tk{font-size:8px;color:var(--muted)}" +
    "#ft-panel .ft-bal{margin-bottom:11px}" +
    "#ft-panel .ft-bal .lbl{display:flex;justify-content:space-between;font-size:9px;color:var(--muted);margin-bottom:3px}" +
    "#ft-panel .ft-balbar{position:relative;height:6px;background:var(--bg);border-radius:3px}" +
    "#ft-panel .ft-balbar i{position:absolute;top:-2px;width:10px;height:10px;border-radius:50%;background:var(--val);left:50%;transform:translateX(-50%);transition:left .15s}" +
    "#ft-panel .ft-dsec{border-top:1px solid var(--border);padding-top:9px}" +
    "#ft-panel .ft-dsec .dh{display:flex;justify-content:space-between;align-items:center;font-size:9px;letter-spacing:.5px;color:var(--muted);margin-bottom:7px}" +
    "#ft-panel .ft-reset{cursor:pointer;color:var(--muted);text-decoration:underline;font-size:9px}" +
    "#ft-panel .ft-find{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:5px 0;border-bottom:1px dashed var(--border)}" +
    "#ft-panel .ft-find:last-child{border-bottom:0}" +
    "#ft-panel .ft-find .ftxt{flex:1;font-size:10px;color:var(--text-dim);line-height:1.35}" +
    "#ft-panel .ft-find .ftime{flex:none;color:var(--muted);font-size:9px;width:50px}" +
    "#ft-panel .ft-flag{flex:none;font-family:inherit;font-size:9px;border:1px solid var(--border-hi);background:transparent;color:var(--text-dim);" +
    "border-radius:5px;padding:3px 7px;cursor:pointer;white-space:nowrap}" +
    "#ft-panel .ft-flag:hover{border-color:var(--acc);color:var(--acc)}" +
    "#ft-panel .ft-flag.done{border-color:var(--up);color:var(--up);cursor:default}" +
    "#ft-panel .ft-stress{flex:none;font-size:8px;font-weight:700;letter-spacing:.5px;padding:2px 5px;border-radius:4px}" +
    "#ft-panel .ft-stress.s1{background:rgba(74,163,255,.16);color:#7db8ff}" +
    "#ft-panel .ft-stress.s2{background:rgba(240,160,32,.18);color:#ffc560}" +
    "#ft-panel .ft-stress.s3{background:rgba(229,48,48,.20);color:#ff6b6b}" +
    "#ft-panel .ft-clean{font-size:10px;color:var(--muted);padding:4px 0}" +
    /* accordion */
    "details.ft-acc>summary.ft-acc-sum{list-style:none;cursor:pointer;display:flex;align-items:center;justify-content:space-between;" +
    "font-family:var(--font-mono);font-size:12px;font-weight:700;letter-spacing:.4px;color:var(--text);" +
    "background:var(--surface);border:1px solid var(--border);border-radius:9px;padding:10px 13px;margin-bottom:12px;user-select:none}" +
    "details.ft-acc>summary.ft-acc-sum::-webkit-details-marker{display:none}" +
    "details.ft-acc>summary .ft-chev{transition:transform .2s;color:var(--muted)}" +
    "details.ft-acc[open]>summary .ft-chev{transform:rotate(90deg)}" +
    "details.ft-acc>summary .ft-acc-hint{font-size:9px;font-weight:400;color:var(--muted);margin-left:auto;margin-right:10px}" +
    /* gear telemetry panel */
    "#ft-gpanel{font-family:var(--font-mono);color:var(--text)}" +
    "#ft-gpanel .gh{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}" +
    "#ft-gpanel .gh .t{font-size:11px;font-weight:700;letter-spacing:.4px}" +
    "#ft-gpanel .gh .s{font-size:10px;color:var(--muted)}" +
    "#ft-gpanel .grow1{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;text-align:center;margin-bottom:10px}" +
    "#ft-gpanel .grow1 .v{font-size:18px;font-weight:700;color:var(--val);line-height:1.1}#ft-gpanel .grow1 .k{font-size:9px;color:var(--muted)}" +
    "#ft-gpanel .gmeas{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:11px}" +
    "#ft-gpanel .gm{background:var(--bg2);border-radius:6px;padding:6px 9px;display:flex;justify-content:space-between;gap:6px;font-size:10px;color:var(--text-dim)}" +
    "#ft-gpanel .gm b{color:var(--val)}" +
    "#ft-gpanel .gratlbl{font-size:9px;letter-spacing:.5px;color:var(--muted);margin-bottom:6px}" +
    "#ft-gpanel #ftg-ratios{display:grid;grid-template-columns:repeat(4,1fr);gap:5px;margin-bottom:11px}" +
    "#ft-gpanel .ftg-grow{background:var(--bg2);border-radius:5px;padding:5px 4px;text-align:center;display:flex;flex-direction:column;gap:2px;font-size:10px;color:var(--text-dim)}" +
    "#ft-gpanel .ftg-grow span:first-child{color:var(--muted);font-size:9px}" +
    "#ft-gpanel .gbtns{display:flex;gap:10px;align-items:center}" +
    "#ft-gpanel .gapply{flex:1;font-family:inherit;font-size:11px;border:1px solid var(--acc);background:var(--acc-bg);color:var(--acc);border-radius:6px;padding:7px;cursor:pointer}" +
    "#ft-gpanel .gapply:hover{background:rgba(45,148,224,.22)}" +
    "#ft-gpanel .greset{font-size:9px;color:var(--muted);cursor:pointer;text-decoration:underline}" +
    "#ft-gpanel .ftg-srow{display:grid;grid-template-columns:1fr auto 92px;gap:8px;align-items:center;padding:4px 2px;border-bottom:1px dashed var(--border);font-size:11px;color:var(--text-dim)}" +
    "#ft-gpanel .ftg-srow:last-child{border-bottom:0}" +
    "#ft-gpanel .ftg-srow.fd{border-bottom:1px solid var(--border-hi);margin-bottom:2px}" +
    "#ft-gpanel .ftg-srow .sv{font-weight:700;color:var(--val);text-align:right;font-variant-numeric:tabular-nums}" +
    "#ft-gpanel .ftg-srow .sa{text-align:right;font-size:10px}" +
    "#ft-gpanel .ar.up{color:var(--warn)}#ft-gpanel .ar.dn{color:var(--acc)}#ft-gpanel .ar.ok{color:var(--up)}" +
    "#ft-gpanel .glegend{font-size:9px;color:var(--muted);margin:8px 0 2px;line-height:1.45}" +
    /* tire traction */
    "#ft-gpanel .tt-lbl{display:flex;justify-content:space-between;align-items:center}" +
    "#ft-gpanel .tt-dt{font-size:9px;letter-spacing:0;color:var(--muted);font-weight:400;text-transform:none}" +
    "#ft-gpanel .tirebay{position:relative;display:grid;grid-template-columns:1fr 46px 1fr;grid-template-rows:1fr 1fr;gap:16px 12px;margin:4px 0 0}" +
    "#ft-gpanel .axlecap{position:absolute;left:50%;transform:translateX(-50%);font-size:8px;letter-spacing:2px;color:var(--muted)}" +
    "#ft-gpanel .axlecap.front{top:-12px}#ft-gpanel .axlecap.rear{bottom:-12px}" +
    "#ft-gpanel .wheel{position:relative;min-height:84px;border-radius:9px;padding:8px 10px;background:var(--bg2);border:1px solid var(--border);border-left:3px solid var(--border-hi);transition:.25s;display:flex;flex-direction:column}" +
    "#ft-gpanel .wheel .pos{font-size:9px;color:var(--muted);letter-spacing:1px}" +
    "#ft-gpanel .wheel .state{font-size:11px;font-weight:700;margin:2px 0 7px;white-space:nowrap}" +
    "#ft-gpanel .wheel .slip{height:6px;border-radius:3px;background:var(--bg);overflow:hidden}" +
    "#ft-gpanel .wheel .slip i{display:block;height:100%;width:0%;border-radius:3px;transition:width .15s,background .2s}" +
    "#ft-gpanel .wheel .note{font-size:8.5px;color:var(--muted);margin-top:auto;padding-top:5px;white-space:nowrap}" +
    "#ft-gpanel .wheel.driven{border-left-color:#3fd07a;background:rgba(63,208,122,.06);box-shadow:0 0 14px rgba(63,208,122,.08)}" +
    "#ft-gpanel .wheel.driven .state{color:#3fd07a}#ft-gpanel .wheel.driven .slip i{background:#3fd07a}" +
    "#ft-gpanel .wheel.driven.spin .slip i{background:#ff5a5a}" +
    "#ft-gpanel .wheel.idle{opacity:.5}#ft-gpanel .wheel.idle .state{color:var(--muted)}" +
    "#ft-gpanel .wheel.mismatch{border-left-color:#f0a020;border-color:rgba(240,160,32,.4);border-style:dashed;background:rgba(240,160,32,.05)}" +
    "#ft-gpanel .wheel.mismatch .state{color:#f0a020}#ft-gpanel .wheel.mismatch .note{color:#f0a020}" +
    "#ft-gpanel .spine{display:flex;justify-content:center}#ft-gpanel .spine .rail{width:3px;background:var(--border-hi);border-radius:2px}" +
    "#ft-gpanel .spine.lit .rail{background:#3fd07a;box-shadow:0 0 8px rgba(63,208,122,.5)}" +
    "#ft-gpanel .hub{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:14px;height:14px;border-radius:50%;background:var(--bg2);border:2px solid var(--border-hi);z-index:2;transition:.25s}" +
    "#ft-gpanel .hub.lit{border-color:#3fd07a;box-shadow:0 0 10px rgba(63,208,122,.55)}" +
    "#ft-gpanel .ttwarn{display:none;align-items:center;gap:9px;margin-top:13px;padding:9px 11px;border-radius:8px;background:rgba(240,160,32,.1);border:1px solid rgba(240,160,32,.4);font-size:10.5px;color:#ffce7a;line-height:1.4}" +
    "#ft-gpanel .ttwarn.show{display:flex}#ft-gpanel .ttwarn .ic{flex:none;font-size:14px}#ft-gpanel .ttwarn b{color:var(--val)}" +
    "#ft-gpanel .ttwarn .ttfix{margin-left:auto;flex:none;font-family:inherit;font-size:10px;border:1px solid rgba(240,160,32,.6);background:transparent;color:#ffce7a;border-radius:6px;padding:5px 9px;cursor:pointer;white-space:nowrap}" +
    "#ft-gpanel .ttwarn .ttfix:hover{background:rgba(240,160,32,.18)}" +
    "#ft-gpanel .ttwidth{margin-top:13px;border-top:1px dashed var(--border);padding-top:11px}" +
    "#ft-gpanel .ttwrow{display:grid;grid-template-columns:50px 1fr auto;gap:10px;align-items:center;padding:5px 0;font-size:11px}" +
    "#ft-gpanel .ttwrow .ax{color:var(--muted);font-size:9px;letter-spacing:1px}" +
    "#ft-gpanel .ttwrow .verdict{font-weight:700}#ft-gpanel .ttwrow .why{color:var(--muted);font-size:9px;text-align:right}" +
    "#ft-gpanel .ttwrow .verdict.wider{color:var(--up)}#ft-gpanel .ttwrow .verdict.narrow{color:var(--acc)}" +
    "#ft-gpanel .ttwrow .verdict.ok{color:var(--text)}#ft-gpanel .ttwrow .verdict.na{color:var(--muted);font-weight:400}" +
    /* diagnostics tab layout */
    ".diag-layout{display:grid;grid-template-columns:minmax(360px,1fr) minmax(380px,1.05fr);gap:16px;align-items:start}" +
    ".diag-right{display:flex;flex-direction:column;gap:16px;min-width:0}" +
    /* F1 telemetry cluster */
    "#ft-panel .ft-carline{font-size:9px;color:var(--muted);font-variant-numeric:tabular-nums}" +
    ".ft-shift{display:flex;gap:3px;justify-content:center;padding:7px 8px;background:var(--bg);border-radius:7px;margin-bottom:12px}" +
    ".ft-shift i{flex:1;height:9px;border-radius:2px;background:var(--border)}" +
    ".ft-shift i.on.g{background:#3fd07a;box-shadow:0 0 7px #3fd07a}" +
    ".ft-shift i.on.y{background:#ffd23f;box-shadow:0 0 7px #ffd23f}" +
    ".ft-shift i.on.r{background:#ff5a5a;box-shadow:0 0 7px #ff5a5a}" +
    ".ft-shift.redline{animation:ftblink .16s steps(1) infinite}" +
    "@keyframes ftblink{50%{opacity:.2}}" +
    ".ft-cluster{display:flex;align-items:stretch;gap:12px;margin-bottom:12px}" +
    ".ft-gearwrap{flex:none;width:88px;border-radius:12px;background:linear-gradient(160deg,var(--bg2),var(--bg));border:1px solid var(--border);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:8px 0}" +
    ".ft-gear{font-size:48px;font-weight:800;color:var(--val);line-height:1}" +
    ".ft-gearlbl{font-size:8px;letter-spacing:1.5px;color:var(--muted);margin-top:3px}" +
    ".ft-dials{flex:1;display:flex;flex-direction:column;gap:8px;justify-content:center}" +
    ".ft-dial{display:flex;align-items:baseline;justify-content:space-between;background:var(--bg2);border-radius:8px;padding:8px 13px}" +
    ".ft-dial .dv{font-size:27px;font-weight:800;color:var(--val);font-variant-numeric:tabular-nums}" +
    ".ft-dial .dk{font-size:9px;color:var(--muted);letter-spacing:1.5px}" +
    "#ft-panel .ft-pedals{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px}" +
    "#ft-panel .ft-ped{display:flex;flex-direction:column;gap:4px}" +
    "#ft-panel .ft-ped .pl{font-size:8px;letter-spacing:1px;color:var(--muted)}" +
    "#ft-panel .ft-ped .pbar{height:9px;background:var(--bg);border-radius:4px;overflow:hidden}" +
    "#ft-panel .ft-ped .pbar i{display:block;height:100%;width:0%}" +
    "#ft-panel .ft-ped .pbar i.thr{background:#3fd07a}" +
    "#ft-panel .ft-ped .pbar i.brk{background:#ff5a5a}" +
    /* dedicated suggestions card */
    "#sugCard{display:none;border:1px solid var(--acc) !important;box-shadow:0 0 20px var(--acc-bg)}" +
    "#sugCard.show{display:block}" +
    "#sugCard .sug-sym{font-size:11px;color:var(--acc);font-weight:600;margin-left:8px}" +
    "#sugCard .sug-group{margin-bottom:11px}" +
    "#sugCard .sug-group:last-child{margin-bottom:0}" +
    "#sugCard .sug-group-lbl{font-size:9px;letter-spacing:.7px;color:var(--muted);text-transform:uppercase;border-bottom:1px solid var(--border);padding-bottom:4px;margin-bottom:6px}" +
    "#sugCard .sug-aero{color:var(--muted);font-size:9px}" +
    "@media (max-width:820px){.diag-layout{grid-template-columns:1fr}}" +
    /* record controller */
    ".rc-hd{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}" +
    ".rc-title{font-size:9px;letter-spacing:.5px;color:var(--muted);font-weight:700}" +
    ".rc-timer{font-size:12px;color:var(--val);font-variant-numeric:tabular-nums}" +
    ".rc-bar{height:5px;background:var(--bg);border-radius:3px;overflow:hidden;margin-bottom:8px}" +
    ".rc-bar i{display:block;height:100%;width:30%;border-radius:3px;background:#ff5a5a;transform:translateX(-120%)}" +
    ".rc-bar.rec-live i{animation:rcsweep 1.1s linear infinite}" +
    "@keyframes rcsweep{from{transform:translateX(-120%)}to{transform:translateX(360%)}}" +
    ".rc-btns{display:flex;gap:6px;margin-bottom:10px}" +
    ".rc-btn{flex:1;font-family:inherit;font-size:10px;border:1px solid var(--border-hi);background:transparent;color:var(--text-dim);border-radius:6px;padding:6px;cursor:pointer}" +
    ".rc-btn:hover:not(:disabled){border-color:var(--acc);color:var(--acc)}" +
    ".rc-btn.rec{border-color:rgba(255,90,90,.55);color:#ff7a7a}" +
    ".rc-btn.rec:hover:not(:disabled){border-color:#ff5a5a;color:#ff5a5a}" +
    ".rc-btn:disabled{opacity:.4;cursor:default}" +
    ".grc{margin-bottom:13px}" +
    ".grc-note{font-size:10px;color:var(--text-dim);line-height:1.5;margin-bottom:9px;padding:8px 10px;background:var(--bg2);border-radius:6px;border-left:2px solid var(--acc)}" +
    "#tab-gear .spec-grid .field label{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}";

  function mountStyles() {
    var style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
  }

  // Telemetry card markup now lives in index.html (#ft-panel on the Diagnostics
  // tab); this just wires its events.
  function bindPanel() {
    var findings = document.getElementById("ft-findings");
    if (findings) findings.addEventListener("click", function (e) {
      var btn = e.target.closest(".ft-flag");
      if (btn && btn.dataset.sym) flagSymptom(btn.dataset.sym);
    });
    var rec = document.getElementById("rc-record");
    var stop = document.getElementById("rc-stop");
    var rst = document.getElementById("rc-reset");
    if (rec) rec.addEventListener("click", function () { diagRec.start(); renderLog(); });
    if (stop) stop.addEventListener("click", function () { diagRec.stop(); });
    if (rst) rst.addEventListener("click", function () { diagRec.reset(); });
  }

  // Wrap the Car Specifications block (.setup-wrap) in a collapsible accordion.
  function mountAccordion() {
    var sw = document.querySelector(".setup-wrap");
    if (!sw || sw.dataset.ftAcc) return;
    sw.dataset.ftAcc = "1";
    var det = document.createElement("details");
    det.className = "ft-acc";
    det.open = true;
    var sum = document.createElement("summary");
    sum.className = "ft-acc-sum";
    sum.innerHTML =
      '<span class="ft-chev">▸</span>&nbsp; Car Specifications' +
      '<span class="ft-acc-hint">click to collapse</span>';
    sw.parentNode.insertBefore(det, sw);
    det.appendChild(sum);
    det.appendChild(sw);
  }

  // ── diagnostics symptom helpers ─────────────────────────────────────────────
  function symBtn(id) {
    return document.querySelector('.sym-btn[data-id="' + id + '"]');
  }
  function isFlagged(id) {
    var b = symBtn(id);
    return !!(b && b.classList.contains("on"));
  }
  function flagSymptom(id) {
    var b = symBtn(id);
    if (b && !b.classList.contains("on")) b.click(); // uses the calculator's own handler
    renderLog();
  }

  // ── rolling analysis state ──────────────────────────────────────────────────
  // Counter-based so each finding is an honest "fraction of the time condition X
  // was true while in phase Y". Thresholds are conservative; may want real-game
  // calibration once we have driving logs.
  function freshAn() {
    return {
      samples: 0, t: [null, null, null, null], bottom: 0,
      // braking phase
      nBrake: 0, cFrontLock: 0, cRearLock: 0, cDive: 0, cDarty: 0,
      prevSteerBrake: null, prevSteerDeltaBrake: 0,
      // power phase
      nPower: 0, cPowerSpin: 0, insideSum: 0, insideN: 0,
      nCornerPower: 0, cExitUnder: 0, cExitOver: 0,
      // cornering balance by phase
      nCornerBrake: 0, cEntryUnder: 0, cEntryOver: 0,
      nCornerCoast: 0, cMidUnder: 0, cMidOver: 0,
      // misc
      nLatLoad: 0, cBodyRoll: 0, cLowGrip: 0,
      nHiStraight: 0, cHiWobble: 0, prevYawHi: null,
      suspPrev: [null, null, null, null], suspDir: [0, 0, 0, 0], suspRev: 0,
      nUpshift: 0, cGearDrop: 0, prevGear: 0
    };
  }
  var an = freshAn();
  var history = [], prevActive = {};

  function resetAnalysis() {
    an = freshAn();
    history = [];
    prevActive = {};
    renderLog();
  }

  function phaseOf(t) {
    if (t.brake > 35 && t.accel < 30) return "brake";
    if (t.accel > 60 && t.brake < 15) return "power";
    return "coast";
  }
  // Driven axle indices: FWD = fronts, RWD/AWD = rears (where spin shows most).
  function drivenIdx(dt) { return dt === "FWD" ? [0, 1] : [2, 3]; }

  // Reusable Record/Stop/Reset controller; timer shows elapsed m:s:ms.
  // (The same factory will drive the gear tab's recorder in Phase 4.)
  function makeRecorder(ids, onReset) {
    var recording = false, accMs = 0, startPerf = 0, raf = 0;
    function fmt(ms) {
      var m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000), x = Math.floor(ms % 1000);
      return m + ":" + String(s).padStart(2, "0") + ":" + String(x).padStart(3, "0");
    }
    function cur() { return accMs + (recording ? performance.now() - startPerf : 0); }
    function paint() {
      var t = document.getElementById(ids.timer); if (t) t.textContent = fmt(cur());
      if (recording) raf = requestAnimationFrame(paint);
    }
    function ui() {
      var rec = document.getElementById(ids.rec), stop = document.getElementById(ids.stop), bar = document.getElementById(ids.bar);
      if (rec) rec.disabled = recording;
      if (stop) stop.disabled = !recording;
      if (bar) bar.classList.toggle("rec-live", recording);
    }
    return {
      isRecording: function () { return recording; },
      start: function () { if (recording) return; recording = true; startPerf = performance.now(); ui(); paint(); },
      stop: function () { if (!recording) return; accMs = cur(); recording = false; cancelAnimationFrame(raf); ui(); paint(); },
      reset: function () { recording = false; accMs = 0; cancelAnimationFrame(raf); var t = document.getElementById(ids.timer); if (t) t.textContent = "0:00:000"; ui(); if (onReset) onReset(); }
    };
  }
  var diagRec = makeRecorder({ timer: "rc-timer", bar: "rc-bar", rec: "rc-record", stop: "rc-stop" }, resetAnalysis);

  function accumulate(t) {
    if (!t.isRaceOn) return;
    var a = 0.05;
    for (var i = 0; i < 4; i++) {
      an.t[i] = an.t[i] == null ? t.tireTempC[i] : an.t[i] + a * (t.tireTempC[i] - an.t[i]);
    }
    var bottomed = 0;
    for (var j = 0; j < 4; j++) {
      if (t.suspTravel[j] <= 0.04 || t.suspTravel[j] >= 0.96) bottomed = 1;
    }
    an.bottom += a * (bottomed - an.bottom);
    an.samples++;

    var sr = t.slipRatio || [0, 0, 0, 0];
    var sa = t.slipAngle || [0, 0, 0, 0];
    var cs = t.combinedSlip || [0, 0, 0, 0];
    var ws = t.wheelSpeed || [0, 0, 0, 0];
    var steer = t.steer || 0;
    var frontSA = (Math.abs(sa[0]) + Math.abs(sa[1])) / 2;
    var rearSA = (Math.abs(sa[2]) + Math.abs(sa[3])) / 2;
    var lat = Math.abs(t.accelLat || 0);
    var cornering = lat > 3.5 || Math.abs(steer) > 18;
    var phase = phaseOf(t);
    var dn = drivenIdx(t.drivetrain);

    // ── braking phase ──────────────────────────────────────────────
    if (phase === "brake" && t.speedKmh > 25) {
      an.nBrake++;
      if (Math.min(sr[0], sr[1]) < -0.5) an.cFrontLock++;            // e3
      if (Math.min(sr[2], sr[3]) < -0.5) an.cRearLock++;            // e4
      var fc = (t.suspTravel[0] + t.suspTravel[1]) / 2;
      var rc = (t.suspTravel[2] + t.suspTravel[3]) / 2;
      if (fc - rc > 0.22) an.cDive++;                              // e7
      if (an.prevSteerBrake != null) {                            // e5 (steer reversals)
        var d = steer - an.prevSteerBrake;
        if (Math.abs(d) > 6 && an.prevSteerDeltaBrake &&
          Math.sign(d) !== Math.sign(an.prevSteerDeltaBrake)) an.cDarty++;
        if (Math.abs(d) > 1) an.prevSteerDeltaBrake = d;
      }
      an.prevSteerBrake = steer;
      if (cornering) {
        an.nCornerBrake++;
        if (frontSA > rearSA + 0.4 && frontSA > 0.8) an.cEntryUnder++; // e1
        if (rearSA > frontSA + 0.4 && rearSA > 0.8) an.cEntryOver++;   // e2
      }
    }

    // ── power phase ────────────────────────────────────────────────
    if (phase === "power" && t.speedKmh > 20) {
      an.nPower++;
      var drivenSpin = Math.max(sr[dn[0]], sr[dn[1]]);
      if (drivenSpin > 0.5) an.cPowerSpin++;
      // Inside-wheel spin: only when there's real longitudinal slip, so we don't
      // mistake the normal outer/inner wheel-speed gap in a corner for wheelspin.
      if (drivenSpin > 0.3) {
        var wl = Math.abs(ws[dn[0]]), wr = Math.abs(ws[dn[1]]), wm = Math.max(wl, wr);
        if (wm > 1) { an.insideSum += Math.abs(wl - wr) / wm; an.insideN++; } // x3
      }
      if (cornering) {
        an.nCornerPower++;
        if (frontSA > rearSA + 0.4 && frontSA > 1.0) an.cExitUnder++; // x2
        if (rearSA > frontSA + 0.4 && rearSA > 1.0) an.cExitOver++;   // x1
      }
    }

    // ── mid-corner (coasting) balance ──────────────────────────────
    if (phase === "coast" && cornering && t.speedKmh > 25) {
      an.nCornerCoast++;
      if (frontSA > rearSA + 0.4 && frontSA > 0.8) an.cMidUnder++;  // m1
      if (rearSA > frontSA + 0.4 && rearSA > 0.8) an.cMidOver++;    // m2
    }

    // ── body roll under lateral load ───────────────────────────────
    if (lat > 5 && t.speedKmh > 30) {
      an.nLatLoad++;
      var rollF = Math.abs(t.suspTravel[0] - t.suspTravel[1]);
      var rollR = Math.abs(t.suspTravel[2] - t.suspTravel[3]);
      if (Math.max(rollF, rollR) > 0.33) an.cBodyRoll++;            // m3
    }

    // ── general lack of grip (3+ tires sliding) ────────────────────
    if (((cs[0] > 1) + (cs[1] > 1) + (cs[2] > 1) + (cs[3] > 1)) >= 3) an.cLowGrip++; // t4

    // ── high-speed straight-line instability ───────────────────────
    if (t.speedKmh > 120 && Math.abs(steer) < 16) {
      an.nHiStraight++;
      if (an.prevYawHi != null &&
        Math.sign(t.yawRate) !== Math.sign(an.prevYawHi) &&
        Math.abs(t.yawRate) > 0.08) an.cHiWobble++;                // s1
      an.prevYawHi = t.yawRate;
    }

    // ── suspension oscillation (bouncy / underdamped) ──────────────
    for (var k = 0; k < 4; k++) {
      if (an.suspPrev[k] != null) {
        var dir = Math.sign(t.suspTravel[k] - an.suspPrev[k]);
        if (dir !== 0 && an.suspDir[k] !== 0 && dir !== an.suspDir[k]) an.suspRev++; // b3
        if (dir !== 0) an.suspDir[k] = dir;
      }
      an.suspPrev[k] = t.suspTravel[k];
    }

    // ── falls between gears (post-upshift RPM drops below powerband) ─
    if (an.prevGear > 0 && t.gear > an.prevGear && t.gear >= 2) {
      an.nUpshift++;
      if (t.maxRpm > 0 && t.rpm / t.maxRpm < 0.55) an.cGearDrop++;  // s3
    }
    if (t.gear > 0) an.prevGear = t.gear;
  }

  // Stress level 1/2/3 (low/mid/high) from how far a signal sits past its
  // firing threshold — drives the LOW/MID/HIGH badge on each captured issue.
  function lvl(x, a, b) { return x < a ? 1 : x < b ? 2 : 3; }

  function computeFindings() {
    var f = [];
    if (an.samples < 30) return f;
    var R = function (c, n) { return n > 0 ? c / n : 0; };
    var fAvg = (an.t[0] + an.t[1]) / 2, rAvg = (an.t[2] + an.t[3]) / 2;
    var r;

    // tires + bottoming (original detectors)
    if (fAvg > 105) f.push({ sym: "t1", level: lvl(fAvg, 115, 125), text: "Front tires hot (" + Math.round(fAvg) + "°C) — overheating front" });
    if (rAvg > 105) f.push({ sym: "t2", level: lvl(rAvg, 115, 125), text: "Rear tires hot (" + Math.round(rAvg) + "°C) — overheating rear" });
    if (an.bottom > 0.15) f.push({ sym: "b2", level: lvl(an.bottom, 0.30, 0.50), text: "Suspension hitting its limit — bottoming out" });

    // braking
    if (an.nBrake > 30) {
      r = R(an.cFrontLock, an.nBrake); if (r > 0.15) f.push({ sym: "e3", level: lvl(r, 0.30, 0.50), text: "Front wheels locking under braking" });
      r = R(an.cRearLock, an.nBrake); if (r > 0.15) f.push({ sym: "e4", level: lvl(r, 0.30, 0.50), text: "Rear wheels locking under braking" });
      r = R(an.cDive, an.nBrake); if (r > 0.30) f.push({ sym: "e7", level: lvl(r, 0.45, 0.65), text: "Nose diving hard under braking" });
      r = R(an.cDarty, an.nBrake); if (r > 0.12) f.push({ sym: "e5", level: lvl(r, 0.25, 0.40), text: "Darty / nervous under braking" });
    }
    // corner entry
    if (an.nCornerBrake > 20) {
      r = R(an.cEntryUnder, an.nCornerBrake); if (r > 0.30) f.push({ sym: "e1", level: lvl(r, 0.45, 0.65), text: "Understeer on corner entry / turn-in" });
      r = R(an.cEntryOver, an.nCornerBrake); if (r > 0.30) f.push({ sym: "e2", level: lvl(r, 0.45, 0.65), text: "Oversteer / snap on corner entry" });
    }
    // mid corner
    if (an.nCornerCoast > 20) {
      r = R(an.cMidUnder, an.nCornerCoast); if (r > 0.30) f.push({ sym: "m1", level: lvl(r, 0.45, 0.65), text: "Mid-corner understeer" });
      r = R(an.cMidOver, an.nCornerCoast); if (r > 0.30) f.push({ sym: "m2", level: lvl(r, 0.45, 0.65), text: "Mid-corner oversteer" });
    }
    // corner exit / power
    if (an.nCornerPower > 20) {
      r = R(an.cExitOver, an.nCornerPower); if (r > 0.25) f.push({ sym: "x1", level: lvl(r, 0.40, 0.60), text: "Power-on oversteer — rear steps out on throttle" });
      r = R(an.cExitUnder, an.nCornerPower); if (r > 0.30) f.push({ sym: "x2", level: lvl(r, 0.45, 0.65), text: "Power-on understeer — pushes wide on throttle" });
    }
    r = R(an.insideSum, an.insideN); if (an.insideN > 20 && r > 0.15) f.push({ sym: "x3", level: lvl(r, 0.25, 0.40), text: "Inside wheel spinning up under power" });

    // chassis / grip / speed
    r = R(an.cBodyRoll, an.nLatLoad); if (an.nLatLoad > 30 && r > 0.35) f.push({ sym: "m3", level: lvl(r, 0.50, 0.70), text: "Excess body roll through corners" });
    r = R(an.cLowGrip, an.samples); if (r > 0.20) f.push({ sym: "t4", level: lvl(r, 0.40, 0.60), text: "General lack of grip — tires sliding" });
    if (fAvg < 60 && rAvg < 60 && an.samples > 60) f.push({ sym: "t3", level: lvl(60 - Math.min(fAvg, rAvg), 8, 18), text: "Tires running cold — greasy / low grip" });
    r = R(an.cHiWobble, an.nHiStraight); if (an.nHiStraight > 40 && r > 0.08) f.push({ sym: "s1", level: lvl(r, 0.16, 0.28), text: "Unstable / wandering at high speed" });
    r = R(an.suspRev, an.samples); if (an.samples > 120 && r > 0.55) f.push({ sym: "b3", level: lvl(r, 0.65, 0.78), text: "Bouncy / floaty — slow to settle" });
    r = R(an.cGearDrop, an.nUpshift); if (an.nUpshift > 3 && r > 0.5) f.push({ sym: "s3", level: lvl(r, 0.70, 0.90), text: "Falls out of powerband between gears" });

    return f;
  }

  // ── rendering ───────────────────────────────────────────────────────────────
  var panel, lastPacket = 0, lastVitals = 0, lastFindings = 0, lastGear = 0;

  function renderVitals(t) {
    panel.classList.toggle("live", !!t.isRaceOn);
    document.getElementById("ft-status").textContent = t.isRaceOn ? "Live" : "In menu / paused";

    document.getElementById("ft-gear").textContent = t.gear === 0 ? "R" : t.gear >= 11 ? "N" : t.gear;
    document.getElementById("ft-speed").textContent = Math.round(t.speedKmh);
    document.getElementById("ft-rpmv").textContent = Math.round(t.rpm);

    paintShift("ft-shift", t.maxRpm > 0 ? t.rpm / t.maxRpm : 0);

    // throttle / brake (telemetry reports 0–255)
    document.getElementById("ft-thr").style.width = Math.round((t.accel || 0) / 255 * 100) + "%";
    document.getElementById("ft-brk").style.width = Math.round((t.brake || 0) / 255 * 100) + "%";

    document.getElementById("ft-pwr").textContent = t.powerHp > 0 ? Math.round(t.powerHp) : "—";
    document.getElementById("ft-trq").textContent = t.torqueNm > 0 ? Math.round(t.torqueNm) : "—";
    document.getElementById("ft-boost").textContent = isFinite(t.boost) ? t.boost.toFixed(1) : "—";
    document.getElementById("ft-car").textContent =
      (t.pi > 0 ? "PI " + t.pi + " " + piToClass(t.pi) : "PI —") +
      (t.drivetrain ? " · " + t.drivetrain : "") +
      (t.carOrdinal > 0 ? " · #" + t.carOrdinal : "");

    for (var i = 0; i < 4; i++) {
      var c = t.tireTempC[i];
      var cell = document.getElementById("ft-t" + i);
      cell.textContent = Math.round(c);
      cell.style.color = tempColour(c);
    }

    var front = (Math.abs(t.slipAngle[0]) + Math.abs(t.slipAngle[1])) / 2;
    var rear = (Math.abs(t.slipAngle[2]) + Math.abs(t.slipAngle[3])) / 2;
    var diff = front - rear;
    var pos = Math.max(0, Math.min(100, 50 + diff * 12));
    document.getElementById("ft-baldot").style.left = pos + "%";
    document.getElementById("ft-baltxt").textContent =
      Math.abs(diff) < 0.4 ? "balanced" : diff > 0 ? "understeer" : "oversteer";
  }

  function fmtClock(ts) {
    return new Date(ts).toTimeString().slice(0, 8);
  }

  // Edge-trigger: when a symptom first becomes active, append it to the rolling
  // log (newest first, max 10) so there's time to stop and act on it later.
  function tickDiagnostics() {
    var current = computeFindings();
    var nowActive = {};
    current.forEach(function (f) { nowActive[f.sym] = f; });
    Object.keys(nowActive).forEach(function (sym) {
      if (prevActive[sym]) return; // already active on the previous tick
      var recent = history.find(function (h) { return h.sym === sym; });
      if (recent && Date.now() - recent.t < 6000) return; // debounce flicker
      history.unshift({ sym: sym, text: nowActive[sym].text, level: nowActive[sym].level, t: Date.now() }); // uncapped: keeps all until Reset
    });
    prevActive = nowActive;
    renderLog();
  }

  function renderLog() {
    var box = document.getElementById("ft-findings");
    if (!box) return;
    if (history.length === 0) {
      var msg = !diagRec.isRecording() && an.samples === 0 ? "Press ● Record, then drive."
        : an.samples < 30 ? "Recording… drive a few corners." : "No issues logged yet.";
      box.innerHTML = '<div class="ft-clean">' + msg + "</div>";
      return;
    }
    box.innerHTML = history
      .map(function (h) {
        var done = isFlagged(h.sym);
        var lv = h.level || 1;
        var sName = lv >= 3 ? "HIGH" : lv === 2 ? "MID" : "LOW";
        return (
          '<div class="ft-find"><span class="ftime">' + fmtClock(h.t) + "</span>" +
          '<span class="ft-stress s' + lv + '" title="Stress level">' + sName + "</span>" +
          '<span class="ftxt">' + h.text + "</span>" +
          '<button class="ft-flag' + (done ? " done" : "") + '" data-sym="' + h.sym + '">' +
          (done ? "✓" : "Flag") + "</button></div>"
        );
      })
      .join("");
  }

  // ── gear telemetry ──────────────────────────────────────────────────────────
  // Measures redline, peak-power RPM, top speed, gear count and per-gear ratios
  // from live driving, then pushes them into the Gear Ratio calculator inputs.
  function freshGearData() {
    return {
      maxRpm: 0, topSpeed: 0, maxGear: 0, powerByRpm: {}, gearRatio: {}, drivetrain: "",
      // tire traction: per-axle wheelspin counts during low-gear full-throttle launch
      spin: { front: { spin: 0, n: 0 }, rear: { spin: 0, n: 0 } }
    };
  }
  var gearData = freshGearData();
  function resetGearData() { gearData = freshGearData(); }

  // Last telemetry packet seen — lets the tire panel re-render on a drive-mode
  // change even between packets (and when sitting in a menu).
  var lastTel = { isRaceOn: false, drivetrain: "", slipRatio: [0, 0, 0, 0], accel: 0, speedKmh: 0, gear: 0 };

  var gearRec = makeRecorder({ timer: "grc-timer", bar: "grc-bar", rec: "grc-record", stop: "grc-stop" }, resetGearData);

  // Drivetrain toggle → show only the driven-axle width field(s) and feed the
  // hidden #g-width (FWD=front, RWD/AWD=rear) that calcGears + suggestions use.
  function syncGearWidth() {
    var on = document.querySelector("#gdSeg button.on");
    var dt = on ? on.dataset.gd : "RWD";
    // Always show both width fields — staggered (different front/rear) widths are common.
    var ff = document.getElementById("gwf-field"), rf = document.getElementById("gwr-field");
    if (ff) ff.style.display = "";
    if (rf) rf.style.display = "";
    var fw = parseFloat((document.getElementById("g-width-front") || {}).value);
    var rw = parseFloat((document.getElementById("g-width-rear") || {}).value);
    var drivesFront = dt === "FWD";          // gearing uses the DRIVEN axle's tire
    var driven = drivesFront ? fw : rw;       // RWD/AWD → rear
    var hidden = document.getElementById("g-width");
    if (hidden && isFinite(driven)) { hidden.value = driven; hidden.dispatchEvent(new Event("input", { bubbles: true })); }
    // Mark which width the gear math actually reads.
    var mf = document.getElementById("wdrv-f"), mr = document.getElementById("wdrv-r");
    if (mf) mf.textContent = drivesFront ? "· gearing" : "";
    if (mr) mr.textContent = drivesFront ? "" : "· gearing";
  }

  function accumulateGear(t) {
    if (!t.isRaceOn) return;
    if (t.drivetrain) gearData.drivetrain = t.drivetrain;
    if (t.maxRpm > gearData.maxRpm) gearData.maxRpm = t.maxRpm;
    if (t.speedKmh > gearData.topSpeed) gearData.topSpeed = t.speedKmh;
    if (t.gear >= 1 && t.gear <= 10 && t.gear > gearData.maxGear) gearData.maxGear = t.gear;
    // Power curve: keep the max hp seen in each 100-rpm bin (needs full throttle).
    if (t.accel > 200 && t.rpm > 1000 && t.powerHp > 0) {
      var bin = Math.round(t.rpm / 100) * 100;
      if (t.powerHp > (gearData.powerByRpm[bin] || 0)) gearData.powerByRpm[bin] = t.powerHp;
    }
    // Per-gear ratio (rpm per km/h), smoothed, only under load and moving.
    if (t.gear >= 1 && t.gear <= 10 && t.speedKmh > 20 && t.accel > 120) {
      var r = t.rpm / t.speedKmh;
      var prev = gearData.gearRatio[t.gear];
      gearData.gearRatio[t.gear] = prev == null ? r : prev + 0.1 * (r - prev);
    }
    // Tire traction: per-axle wheelspin during a low-gear full-throttle launch
    // (where wheel torque — and the width-vs-power question — peaks).
    var sr = t.slipRatio || [0, 0, 0, 0], dt = t.drivetrain;
    if (t.accel > 200 && t.speedKmh > 10 && t.gear >= 1 && t.gear <= 2) {
      if (dt === "FWD" || dt === "AWD") { gearData.spin.front.n++; if (Math.max(sr[0], sr[1]) > 0.5) gearData.spin.front.spin++; }
      if (dt === "RWD" || dt === "AWD") { gearData.spin.rear.n++; if (Math.max(sr[2], sr[3]) > 0.5) gearData.spin.rear.spin++; }
    }
  }

  function computePeakRpm() {
    var best = 0, bestRpm = 0;
    for (var b in gearData.powerByRpm) {
      if (gearData.powerByRpm[b] > best) { best = gearData.powerByRpm[b]; bestRpm = +b; }
    }
    return { rpm: bestRpm, hp: best };
  }

  function gnum(id, d) { var v = parseFloat((document.getElementById(id) || {}).value); return isFinite(v) ? v : d; }

  function tireCircM() {
    var w = gnum("g-width", 245), a = gnum("g-aspect", 45), r = gnum("g-rim", 18);
    return Math.PI * (r * 0.0254 + 2 * (w * (a / 100) / 1000)); // metres
  }

  function ordinal(n) {
    var s = ["th", "st", "nd", "rd"], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  // Build a concrete suggested gearbox in the game's own units:
  // Final Drive + per-gear ratio, with the top gear normalised to 1.00 so the
  // numbers are directly typeable. Per-gear arrows compare the calculator's
  // optimal spacing to what you're actually running (measured per-gear ratio).
  // total_ratio (gear x final) = (rpm / speed_kmh) * tireCirc_m * 0.06
  function computeGearSuggestions() {
    var redRPM = gnum("g-red", 0), peakRPM = gnum("g-peak", 0);
    var numG = Math.round(gnum("g-gears", 6));
    var topKph = gnum("g-topspd", 0);
    if (gearUnitsImperial()) topKph *= 1.60934;
    if (redRPM <= peakRPM || peakRPM <= 0 || numG < 2 || topKph <= 0) return null;

    var k = tireCircM() * 0.06;
    var shiftR = redRPM / peakRPM;
    var fd = (redRPM * k) / topKph; // top-gear total → set top gear ratio = 1.00
    var gears = [];
    for (var g = 1; g <= numG; g++) {
      var gmax = topKph / Math.pow(shiftR, numG - g); // optimal redline speed in gear g
      var totalOpt = (redRPM * k) / gmax;
      var action = "";
      var meas = gearData.gearRatio[g];
      if (meas) {
        var totalMeas = meas * k;
        var diff = (totalOpt - totalMeas) / totalMeas;
        action = Math.abs(diff) < 0.04 ? "ok" : diff > 0 ? "short" : "tall";
      }
      gears.push({ g: g, ratio: totalOpt / fd, action: action });
    }
    return { fd: fd, gears: gears };
  }

  function gearUnitsImperial() {
    var lbl = document.getElementById("g-spd-lbl");
    return lbl ? /mph/i.test(lbl.textContent) : false;
  }

  function setCalcField(id, value) {
    var el = document.getElementById(id);
    if (!el) return;
    el.value = String(value);
    el.dispatchEvent(new Event("input", { bubbles: true })); // triggers calcGears()
  }

  function applyGearMeasurements() {
    var imp = gearUnitsImperial();
    var peak = computePeakRpm();
    if (gearData.maxRpm > 0) setCalcField("g-red", Math.round(gearData.maxRpm));
    if (peak.rpm > 0) setCalcField("g-peak", peak.rpm);
    if (gearData.topSpeed > 0) {
      var v = imp ? gearData.topSpeed * 0.621371 : gearData.topSpeed;
      setCalcField("g-topspd", Math.round(v));
    }
    if (gearData.maxGear >= 4) setCalcField("g-gears", String(Math.min(10, gearData.maxGear)));
    if (gearData.drivetrain) {
      var seg = document.getElementById("gdSeg");
      if (seg) {
        seg.querySelectorAll("button").forEach(function (x) { x.classList.toggle("on", x.dataset.gd === gearData.drivetrain); });
        syncGearWidth();
      }
    }
    var btn = document.getElementById("ftg-apply");
    if (btn) { btn.textContent = "✓ Applied — see calculator"; setTimeout(function () { btn.textContent = "Apply measured → calculator"; }, 1800); }
  }

  // Gear card markup now lives in index.html (#ft-gpanel on the Gear Ratios
  // tab); this just wires its buttons.
  function bindGearPanel() {
    var apply = document.getElementById("ftg-apply");
    if (apply) apply.addEventListener("click", applyGearMeasurements);
    var grec = document.getElementById("grc-record");
    var gstop = document.getElementById("grc-stop");
    var grst = document.getElementById("grc-reset");
    if (grec) grec.addEventListener("click", function () { gearRec.start(); });
    if (gstop) gstop.addEventListener("click", function () { gearRec.stop(); });
    if (grst) grst.addEventListener("click", function () { gearRec.reset(); });
    var seg = document.getElementById("gdSeg");
    if (seg) seg.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-gd]"); if (!b) return;
      seg.querySelectorAll("button").forEach(function (x) { x.classList.toggle("on", x === b); });
      syncGearWidth();
      renderTireTraction(lastTel); // reflect the new selection immediately
    });
    ["g-width-front", "g-width-rear"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener("input", syncGearWidth);
    });
    // "Match car" → set the drive-mode selector to the car's actual drivetrain.
    var matchBtn = document.getElementById("ftg-warnfix");
    if (matchBtn) matchBtn.addEventListener("click", function () {
      var dt = lastTel && lastTel.drivetrain;
      if (!dt || !seg) return;
      seg.querySelectorAll("button").forEach(function (x) { x.classList.toggle("on", x.dataset.gd === dt); });
      syncGearWidth();
      renderTireTraction(lastTel);
    });
    syncGearWidth(); // initialise hidden #g-width + show/hide axle fields
    renderTireTraction(lastTel); // initial paint (idle state until telemetry arrives)
  }

  // ── tire traction ───────────────────────────────────────────────────────────
  function gdSelected() {
    var on = document.querySelector("#gdSeg button.on");
    return on ? on.dataset.gd : "RWD";
  }
  function drivenOf(dt) {
    return dt === "FWD" ? { FL: 1, FR: 1 } : dt === "RWD" ? { RL: 1, RR: 1 } : { FL: 1, FR: 1, RL: 1, RR: 1 };
  }

  // Live 4-wheel panel: driven wheels (per the car's actual drivetrain) animate
  // their longitudinal slip; a wheel the user's selected mode expects to drive
  // but the car doesn't is flagged amber (drive-mode mismatch).
  function renderTireTraction(t) {
    if (!document.getElementById("ftg-w-FL")) return;
    var sel = gdSelected();
    var haveLive = !!(t.isRaceOn && t.drivetrain);
    var actualDt = haveLive ? t.drivetrain : sel; // no live data → trust the selection
    var actual = drivenOf(actualDt), expected = drivenOf(sel);
    var sr = t.slipRatio || [0, 0, 0, 0];
    var ws = ["FL", "FR", "RL", "RR"];
    ws.forEach(function (w, i) {
      var el = document.getElementById("ftg-w-" + w);
      var st = el.querySelector(".state"), bar = el.querySelector(".slip i"), note = el.querySelector(".note");
      el.className = "wheel";
      if (actual[w]) {
        var slip = Math.max(0, sr[i]);
        var spinning = slip > 0.5 && t.accel > 150;
        el.classList.add("driven"); if (spinning) el.classList.add("spin");
        st.textContent = spinning ? "SPINNING" : "DRIVEN";
        bar.style.width = Math.round(Math.min(1, slip) * 100) + "%";
        note.textContent = spinning ? "breaking traction" : (t.accel > 100 ? "putting power down" : "driven axle");
      } else if (expected[w] && haveLive) {
        el.classList.add("mismatch");
        st.textContent = "NO DRIVE"; bar.style.width = "0%"; note.textContent = "car is " + actualDt;
      } else {
        el.classList.add("idle");
        st.textContent = "rolling"; bar.style.width = "0%"; note.textContent = "not driven";
      }
    });
    document.getElementById("ftg-sp-F").classList.toggle("lit", !!actual.FL);
    document.getElementById("ftg-sp-R").classList.toggle("lit", !!actual.RL);
    document.getElementById("ftg-hub").classList.toggle("lit", actualDt === "AWD");
    document.getElementById("ftg-dtxt").textContent = haveLive
      ? actualDt + " · " + (actualDt === "FWD" ? "front driven" : actualDt === "RWD" ? "rear driven" : "all four driven")
      : "";

    var warn = document.getElementById("ftg-warn");
    if (haveLive && sel !== actualDt) {
      warn.classList.add("show");
      var ghost = sel === "AWD" && actualDt === "RWD" ? "front wheels aren’t driven"
        : sel === "AWD" && actualDt === "FWD" ? "rear wheels aren’t driven"
        : sel === "FWD" && actualDt === "RWD" ? "the front axle isn’t driven at all"
        : sel === "RWD" && actualDt === "FWD" ? "the rear axle isn’t driven at all"
        : "the driven axle doesn’t match";
      document.getElementById("ftg-warntxt").innerHTML = "You selected <b>" + sel + "</b> — car reports <b>" + actualDt + "</b>. " + ghost + ".";
    } else warn.classList.remove("show");

    renderWidthVerdict("ftg-wr-front", "front", actualDt);
    renderWidthVerdict("ftg-wr-rear", "rear", actualDt);
  }

  // Per-axle width call. Driven axle uses the measured low-gear spin from the
  // recorded pull; the non-driven axle is a balance question → defer to Diagnostics.
  function renderWidthVerdict(rowId, axle, actualDt) {
    var row = document.getElementById(rowId); if (!row) return;
    var v = row.querySelector(".verdict"), why = row.querySelector(".why");
    var driven = axle === "front" ? (actualDt === "FWD" || actualDt === "AWD") : (actualDt === "RWD" || actualDt === "AWD");
    if (!driven) { v.className = "verdict na"; v.textContent = "—"; why.textContent = "not driven · see Diagnostics"; return; }
    var a = gearData.spin[axle], pct = a.n > 0 ? Math.round(100 * a.spin / a.n) : 0;
    if (a.n < 25) { v.className = "verdict ok"; v.textContent = "hold throttle…"; why.textContent = "record a low-gear pull"; return; }
    if (pct > 25) { v.className = "verdict wider"; v.textContent = "▶ Go wider (1 tier)"; why.textContent = "too much power for this width · spun " + pct + "%"; }
    else if (pct < 5) { v.className = "verdict narrow"; v.textContent = "◀ Could go narrower"; why.textContent = "not enough power to need this width"; }
    else { v.className = "verdict ok"; v.textContent = "✓ About right"; why.textContent = "power matched to grip · spun " + pct + "%"; }
  }

  function renderGearPanel(t) {
    if (!document.getElementById("ft-gpanel")) return;
    document.getElementById("ftg-status").textContent = t.isRaceOn ? "measuring…" : "in menu / paused";
    document.getElementById("ftg-gear").textContent = t.gear === 0 ? "R" : t.gear >= 11 ? "N" : t.gear;
    document.getElementById("ftg-rpm").textContent = Math.round(t.rpm);
    document.getElementById("ftg-spd").textContent = Math.round(t.speedKmh);
    paintShift("ftg-shift", t.maxRpm > 0 ? t.rpm / t.maxRpm : 0);
    renderTireTraction(t);

    var imp = gearUnitsImperial();
    var unit = imp ? " mph" : " km/h";
    var peak = computePeakRpm();
    document.getElementById("ftg-red").textContent = gearData.maxRpm > 0 ? Math.round(gearData.maxRpm) : "—";
    document.getElementById("ftg-peak").textContent = peak.rpm > 0 ? peak.rpm : "—";
    var ts = gearData.topSpeed > 0 ? (imp ? gearData.topSpeed * 0.621371 : gearData.topSpeed) : 0;
    document.getElementById("ftg-top").textContent = ts > 0 ? Math.round(ts) + unit : "—";
    document.getElementById("ftg-gears").textContent = gearData.maxGear >= 1 ? gearData.maxGear : "—";

    var rows = "";
    for (var g = 1; g <= gearData.maxGear; g++) {
      var ratio = gearData.gearRatio[g];
      var spd = ratio && gearData.maxRpm > 0 ? gearData.maxRpm / ratio : 0; // km/h at redline in gear g
      if (imp) spd *= 0.621371;
      rows += '<div class="ftg-grow"><span>G' + g + "</span><span>" + (spd > 0 ? Math.round(spd) + unit : "—") + "</span></div>";
    }
    if (rows) document.getElementById("ftg-ratios").innerHTML = rows;

    var sug = computeGearSuggestions();
    var sbox = document.getElementById("ftg-suggest");
    if (sbox) {
      if (!sug) {
        sbox.innerHTML = '<div class="ft-clean">enter tire size to get suggestions</div>';
      } else {
        var h = '<div class="ftg-srow fd"><span>Final Drive</span><span class="sv">' + sug.fd.toFixed(2) + '</span><span class="sa"></span></div>';
        sug.gears.forEach(function (x) {
          // short = raise the ratio (drag slider right) for more acceleration;
          // tall  = lower the ratio (drag slider left) for more top speed.
          var a =
            x.action === "short" ? '<span class="ar up" title="Raise the ratio — drag the slider right">▶ shorten</span>' :
            x.action === "tall"  ? '<span class="ar dn" title="Lower the ratio — drag the slider left">◀ lengthen</span>' :
            x.action === "ok"    ? '<span class="ar ok">✓ good</span>' : "";
          h += '<div class="ftg-srow"><span>' + ordinal(x.g) + '</span><span class="sv">' + x.ratio.toFixed(2) + '</span><span class="sa">' + a + "</span></div>";
        });
        sbox.innerHTML = h;
      }
    }
  }

  // ── telemetry stream ────────────────────────────────────────────────────────
  function onTelemetry(t) {
    lastPacket = Date.now();
    lastTel = t;
    if (diagRec.isRecording()) accumulate(t);
    if (gearRec.isRecording()) accumulateGear(t);

    var now = Date.now();
    if (now - lastVitals >= 66) { lastVitals = now; renderVitals(t); }      // ~15fps
    if (now - lastGear >= 200) { lastGear = now; renderGearPanel(t); }      // ~5fps
    if (diagRec.isRecording() && now - lastFindings >= 1000) { lastFindings = now; tickDiagnostics(); } // 1fps
  }

  function watchdog() {
    if (Date.now() - lastPacket > 1500) {
      panel.classList.remove("live");
      document.getElementById("ft-status").textContent = "Waiting for Forza…";
    }
  }

  // ── boot ──────────────────────────────────────────────────────────────────
  function boot() {
    mountStyles();
    mountAccordion();
    panel = document.getElementById("ft-panel");
    window.ftRefreshLog = renderLog; // let index.html repaint the log (Flag ✓ → Flag on clear)
    bindPanel();
    bindGearPanel();
    setInterval(watchdog, 1000);

    var tries = 0;
    var iv = setInterval(function () {
      if (window.runtime && window.runtime.EventsOn) {
        clearInterval(iv);
        window.runtime.EventsOn("telemetry", onTelemetry);
      } else if (++tries > 600) {
        clearInterval(iv);
        document.getElementById("ft-status").textContent = "runtime unavailable";
      }
    }, 50);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
