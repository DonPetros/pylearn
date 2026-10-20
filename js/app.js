/* PyLearn app: routing, lessons, exercises, playground, progress. */
(function () {
  "use strict";
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = PyHL.esc;
  const view = $("#view");
  const KEY = "pylearn:v1";
  let COURSE = null, LESSONS = [], cleanup = [];

  /* ---------- progress ---------- */
  const blank = () => ({ xp: 0, done: {}, streak: 0, best: 0, lastDay: null, days: 0, settings: { large: false, calm: false }, hideInstall: false });
  let P = load();
  function load() { try { return Object.assign(blank(), JSON.parse(localStorage.getItem(KEY)) || {}); } catch (e) { return blank(); } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch (e) {} }
  function day(d) { d = d || new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function yesterday() { const d = new Date(); d.setDate(d.getDate() - 1); return day(d); }
  function liveStreak() { return (P.lastDay === day() || P.lastDay === yesterday()) ? P.streak : 0; }
  function markActive() {
    const t = day();
    if (P.lastDay === t) return;
    P.streak = P.lastDay === yesterday() ? P.streak + 1 : 1;
    P.best = Math.max(P.best || 0, P.streak);
    P.lastDay = t; P.days = (P.days || 0) + 1;
  }
  function applySettings() {
    document.documentElement.classList.toggle("large", !!P.settings.large);
    document.documentElement.classList.toggle("calm", !!P.settings.calm);
  }
  applySettings();

  /* ---------- helpers ---------- */
  function md(t) {
    return esc(t).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
  }
  function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function h(html) { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; }
  function codeBlock(code, opts) {
    opts = opts || {};
    return `<div class="code"><div class="hd"><i style="background:#ff2bd6"></i><i style="background:#f9f871"></i><i style="background:#00f0ff"></i><span class="lbl">${opts.label || "main.py"}</span>${opts.tryIt ? '<button class="try" type="button">Try it</button>' : ""}</div><pre>${PyHL.highlight(code)}</pre></div>`;
  }
  function outBlock(out, err) {
    return `<div class="code out"><div class="hd"><span class="lbl">OUTPUT</span></div><pre>${esc(out || "")}${err ? `<span class="err">${out ? "\n" : ""}${esc(err)}</span>` : ""}</pre></div>`;
  }
  function lessonById(id) { return LESSONS.find(l => l.id === id); }
  function nextLesson() { return LESSONS.find(l => !P.done[l.id]) || null; }
  function unitDone(u) { return u.lessons.filter(l => P.done[l.id]).length; }

  function modal(html, wire) {
    const m = $("#modal");
    m.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${html}</div>`;
    m.hidden = false;
    const close = () => { m.hidden = true; m.innerHTML = ""; };
    m.onclick = e => { if (e.target === m) close(); };
    wire(m, close);
  }

  /* ---------- Python loading indicator ---------- */
  function pyStatus(el) {
    function paint(s) {
      if (!el.isConnected) return;
      if (s.status === "loading") el.innerHTML = `<div class="loading"><div class="spin"></div><div>Loading Python... <span class="muted small">The first time this downloads about 10 MB. After that it works offline.</span></div></div>`;
      else if (s.status === "error") el.innerHTML = `<div class="loading" style="color:var(--bad)">Python could not load. Check your connection, then try again. <button class="btn sm ghost" type="button">Retry</button></div>`;
      else el.innerHTML = "";
      const b = el.querySelector("button"); if (b) b.onclick = () => Py.load();
    }
    paint(Py.state);
    const off = Py.onChange(paint); cleanup.push(off);
  }

  /* ---------- interactive console ---------- */
  function makeConsole(title) {
    const el = h(`<div class="console"><div class="hd"><span>${title || "OUTPUT"}</span><span class="cs"></span></div><pre aria-live="polite"><span class="sys">Press Run to see the output here.</span></pre><div class="inrow" hidden><input type="text" autocapitalize="off" autocorrect="off" autocomplete="off" spellcheck="false" enterkeyhint="send" aria-label="Type your input"><button class="btn sm" type="button">Enter</button></div></div>`);
    const pre = $("pre", el), row = $(".inrow", el), inp = $("input", row), btn = $("button", row), cs = $(".cs", el);
    let token = 0;
    function paint(res) {
      let html = esc(res.out || "");
      if (res.error) {
        const type = res.error_type || "";
        const line = res.line ? ` (line ${res.line})` : "";
        html += `<span class="err">${res.out && !res.out.endsWith("\n") ? "\n" : ""}${esc(res.error)}${line}</span>`;
        if (Py.TIPS[type]) html += `<span class="tip">${esc(Py.TIPS[type])}</span>`;
      }
      pre.innerHTML = html || '<span class="sys">(no output)</span>';
    }
    async function run(code, preset) {
      const my = ++token;
      const stdin = (preset || []).slice();
      const seed = Math.floor(Math.random() * 1e9);
      row.hidden = true;
      if (Py.state.status !== "ready") pre.innerHTML = '<span class="sys">Starting Python...</span>';
      cs.textContent = "RUNNING";
      for (let guard = 0; guard < 60; guard++) {
        const res = await Py.run(code, { stdin, echo: true, interactive: true, seed });
        if (my !== token) return;
        paint(res);
        if (!res.need_input) break;
        cs.textContent = "WAITING FOR INPUT";
        row.hidden = false; inp.value = ""; inp.focus({ preventScroll: true });
        el.scrollIntoView({ block: "nearest", behavior: "smooth" });
        const v = await new Promise(resolve => {
          const go = () => { inp.onkeydown = null; btn.onclick = null; resolve(inp.value); };
          inp.onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); go(); } };
          btn.onclick = go;
        });
        if (my !== token) return;
        row.hidden = true; stdin.push(v); cs.textContent = "RUNNING";
      }
      cs.textContent = "";
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
    function clear() { token++; row.hidden = true; cs.textContent = ""; pre.innerHTML = '<span class="sys">Press Run to see the output here.</span>'; }
    return { el, run, clear, paint };
  }

  /* ---------- exercises ---------- */
  // Each controller: { el, ready():bool, check():{ok}, answerHtml?, reveal?() , onChange }
  function mcqCtrl(s, onChange) {
    const order = shuffle(s.options.map((_, i) => i));
    let sel = null;
    const el = h(`<div><div class="opts" role="radiogroup"></div></div>`);
    const box = $(".opts", el);
    order.forEach((oi, pos) => {
      const b = h(`<button type="button" class="opt${s.mono ? " mono" : ""}" role="radio" aria-checked="false"><span class="ol">${"ABCD"[pos]}</span><span class="ot">${s.mono ? esc(s.options[oi]) : md(s.options[oi])}</span></button>`);
      b.onclick = () => { sel = oi; box.querySelectorAll(".opt").forEach(x => { x.classList.remove("sel"); x.setAttribute("aria-checked", "false"); }); b.classList.add("sel"); b.setAttribute("aria-checked", "true"); onChange(); };
      b.dataset.oi = oi; box.appendChild(b);
    });
    return {
      el, ready: () => sel !== null,
      check() {
        const ok = sel === s.answer;
        box.classList.add("locked");
        box.querySelectorAll(".opt").forEach(x => { const oi = +x.dataset.oi; if (oi === sel) x.classList.add(ok ? "right" : "wrong"); });
        return { ok };
      },
      retry() { sel = null; box.classList.remove("locked"); box.querySelectorAll(".opt").forEach(x => x.classList.remove("sel", "right", "wrong")); onChange(); },
      reveal() { box.classList.add("locked"); box.querySelectorAll(".opt").forEach(x => { if (+x.dataset.oi === s.answer) x.classList.add("right"); }); },
    };
  }

  function fillCtrl(s, onChange) {
    const n = s.answers.length;
    const vals = new Array(n).fill(null);   // chip index per blank
    const bank = shuffle(s.answers.concat(s.distractors));
    let code = s.code, i = 0;
    code = code.replace(/___/g, () => `BLANKxx${i++}`);
    let html = PyHL.highlight(code).replace(/BLANKxx(\d+)/g, (_, k) => `<button type="button" class="blank" data-b="${k}" aria-label="Blank ${+k + 1}">&nbsp;</button>`);
    const el = h(`<div><div class="code fillcode"><div class="hd"><span class="lbl">main.py</span></div><pre>${html}</pre></div><div class="chips"></div></div>`);
    const chips = $(".chips", el);
    const blanks = [...el.querySelectorAll(".blank")];
    bank.forEach((t, ci) => {
      const c = h(`<button type="button" class="chip">${esc(t)}</button>`);
      c.onclick = () => { const k = vals.indexOf(null); if (k < 0) return; vals[k] = ci; paint(); onChange(); };
      c.dataset.ci = ci; chips.appendChild(c);
    });
    blanks.forEach(b => b.onclick = () => { const k = +b.dataset.b; if (vals[k] !== null) { vals[k] = null; paint(); onChange(); } });
    function paint() {
      const nextK = vals.indexOf(null);
      blanks.forEach(b => { const k = +b.dataset.b; const v = vals[k]; b.textContent = v === null ? "\u00a0" : bank[v]; b.classList.toggle("filled", v !== null); b.classList.toggle("next", k === nextK); b.classList.remove("right", "wrong"); });
      chips.querySelectorAll(".chip").forEach(c => c.classList.toggle("used", vals.includes(+c.dataset.ci)));
    }
    paint();
    return {
      el, ready: () => !vals.includes(null),
      check() {
        let ok = true;
        blanks.forEach(b => { const k = +b.dataset.b; const good = bank[vals[k]] === s.answers[k]; ok = ok && good; b.classList.add(good ? "right" : "wrong"); });
        el.classList.add("locked"); chips.style.pointerEvents = "none"; blanks.forEach(b => b.disabled = true);
        return { ok };
      },
      retry() { vals.fill(null); chips.style.pointerEvents = ""; blanks.forEach(b => b.disabled = false); paint(); onChange(); },
      reveal() { s.answers.forEach((a, k) => { vals[k] = bank.indexOf(a); }); paint(); blanks.forEach(b => b.classList.add("right")); },
    };
  }

  function orderCtrl(s, onChange) {
    const idx = s.lines.map((_, i) => i);
    let pool = shuffle(idx); let tries = 0;
    while (pool.every((v, i) => v === i) && tries++ < 10) pool = shuffle(idx);
    const picked = [];
    const el = h(`<div><div class="olist" aria-label="Your program"></div><div class="pool"></div></div>`);
    const list = $(".olist", el), poolEl = $(".pool", el);
    let locked = false;
    function line(i, inList, pos) { return h(`<button type="button" class="oline" data-i="${i}">${inList ? `<span class="n">${pos + 1}</span>` : ""}<span>${PyHL.highlight(s.lines[i])}</span></button>`); }
    function paint() {
      list.innerHTML = ""; poolEl.innerHTML = "";
      picked.forEach((i, pos) => { const b = line(i, true, pos); b.onclick = () => { if (locked) return; picked.splice(pos, 1); paint(); onChange(); }; list.appendChild(b); });
      pool.forEach(i => { const b = line(i, false); if (picked.includes(i)) b.classList.add("used"); b.onclick = () => { if (locked) return; picked.push(i); paint(); onChange(); }; poolEl.appendChild(b); });
    }
    paint();
    return {
      el, ready: () => picked.length === s.lines.length,
      check() {
        locked = true;
        const ok = picked.every((v, k) => s.lines[v] === s.lines[k]);
        list.querySelectorAll(".oline").forEach((b, k) => b.classList.add(s.lines[picked[k]] === s.lines[k] ? "right" : "wrong"));
        return { ok };
      },
      retry() { locked = false; picked.length = 0; paint(); onChange(); },
      reveal() { locked = true; picked.length = 0; idx.forEach(i => picked.push(i)); paint(); list.querySelectorAll(".oline").forEach(b => b.classList.add("right")); },
    };
  }

  function codeCtrl(s, onChange) {
    const el = h(`<div><div class="edw"></div><div class="row" style="margin-top:6px"><button type="button" class="btn sm ghost runb">Run my code</button></div><div class="pys"></div><div class="cw"></div><div class="tests"></div></div>`);
    const ed = createEditor({ value: s.starter || "", minRows: 5, label: "Your code", onChange: () => onChange() });
    $(".edw", el).appendChild(ed.el);
    const con = makeConsole("OUTPUT");
    $(".cw", el).appendChild(con.el);
    pyStatus($(".pys", el));
    Py.load();
    const firstStdin = (s.tests.find(t => t.stdin) || {}).stdin;
    $(".runb", el).onclick = () => { con.run(ed.get()); };
    const testsEl = $(".tests", el);
    return {
      el, async: true,
      ready: () => ed.get().trim().length > 0,
      async check() {
        const code = ed.get();
        testsEl.innerHTML = '<div class="loading"><div class="spin"></div>Checking your code...</div>';
        for (const r of (s.require || [])) {
          if (!code.includes(r.text)) { testsEl.innerHTML = `<div class="test f">${esc(r.msg)}</div>`; return { ok: false, msg: r.msg }; }
        }
        const rows = []; let ok = true, firstFail = null;
        for (let k = 0; k < s.tests.length; k++) {
          const t = s.tests[k];
          const res = await Py.run(code, { stdin: t.stdin || [], echo: false, after: t.after || null, timeout: 6000 });
          const got = res.error ? (Py.norm(res.out) ? Py.norm(res.out) + "\n" : "") + res.error : Py.norm(res.out);
          const pass = !res.error && !res.need_input && Py.norm(res.out) === Py.norm(t.expected);
          if (!pass) { ok = false; if (!firstFail) firstFail = { t, got, res }; }
          const inp = t.stdin ? `input: ${t.stdin.join(", ")}` : t.after ? `checker runs: ${t.after.split("\n").join("; ")}` : "no input";
          rows.push(`<div class="test ${pass ? "p" : "f"}">Test ${k + 1} ${pass ? "passed" : "failed"} (${esc(inp)})${pass ? "" : `\nexpected: ${esc(t.expected)}\ngot:      ${esc(got || "(nothing)")}`}</div>`);
        }
        testsEl.innerHTML = rows.join("");
        let msg = null;
        if (!ok && firstFail) {
          const r = firstFail.res;
          if (r.error_type === "EOFError") msg = "Your code asked for more input than the test gives. Check how many times you call input().";
          else if (r.error_type && Py.TIPS[r.error_type]) msg = Py.TIPS[r.error_type];
          else if (Py.norm(firstFail.got).toLowerCase() === Py.norm(firstFail.t.expected).toLowerCase()) msg = "Nearly: only the capital letters are different.";
          else msg = "Compare your output with the expected output above, character by character.";
        }
        return { ok, msg };
      },
      retry() { testsEl.innerHTML = ""; onChange(); },
      reveal() { ed.set(s.solution); testsEl.innerHTML = '<div class="test">Model answer loaded into the editor. Read it, run it, then press Continue.</div>'; },
      solution: true,
    };
  }

  /* ---------- lesson runner ---------- */
  function renderLesson(id) {
    const lesson = lessonById(id);
    if (!lesson) { location.hash = "#/"; return; }
    document.body.classList.add("lesson");
    if (lesson.steps.some(s => s.type === "code")) Py.load();   // start downloading Python early for lessons that need it
    const L = { lesson, i: 0, xp: 0, results: [] };
    const act = h(`<div class="act"></div>`);
    document.body.appendChild(act);
    cleanup.push(() => act.remove(), () => document.body.classList.remove("lesson"));

    function bar() {
      return `<div class="lbar"><button class="x" type="button" aria-label="Leave lesson">&times;</button><div class="prog">${lesson.steps.map((s, k) => `<i class="${k < L.i ? (L.results[k] === "c" ? "d" : "d") : k === L.i ? "c" : ""}"></i>`).join("")}</div><span class="cnt">${L.i + 1}/${lesson.steps.length}</span></div>`;
    }
    function leave() {
      if (L.i === 0) { location.hash = "#/"; return; }
      modal(`<h3>Leave this lesson?</h3><p>Your place in this lesson will not be saved.</p><div class="row"><button class="btn ghost" data-a="stay">Keep going</button><button class="btn mg" data-a="go">Leave</button></div>`, (m, close) => {
        m.querySelector('[data-a=stay]').onclick = close;
        m.querySelector('[data-a=go]').onclick = () => { close(); location.hash = "#/"; };
      });
    }
    function show() {
      const s = lesson.steps[L.i];
      const isEx = s.type !== "card";
      let tries = 0, hinted = false, ctrl = null, checking = false;
      let mode = "ask";  // ask | ok | bad | revealed
      let fbMsg = "";
      const kinds = { mcq: "Quick question", output: "What does it print?", fill: "Fill the gaps", order: "Put in order", code: "Code challenge" };
      let body = "";
      if (!isEx) {
        body = `<div class="kind c">Learn</div><h3>${esc(s.title)}</h3><p>${md(s.text)}</p>`;
        if (s.code) body += `<div class="cblk">${codeBlock(s.code, { tryIt: true })}${s.note ? `<div class="note">${esc(s.note)}</div>` : ""}${outBlock(s.out, s.error)}</div>`;
      } else {
        body = `<div class="kind">${kinds[s.type]}</div><div class="q">${md(s.q)}</div>`;
        if (s.code && s.type !== "fill") body += codeBlock(s.code);
      }
      view.innerHTML = bar() + `<section class="step">${body}<div class="ctl"></div><div class="hw"></div></section>`;
      $(".lbar .x").onclick = leave;
      window.scrollTo(0, 0);
      if (!isEx && s.code) {
        const t = $(".try", view);
        t.onclick = () => {
          const blk = $(".cblk", view);
          const ed = createEditor({ value: s.code, minRows: 4 });
          const con = makeConsole();
          const st = h('<div></div>');
          const run = h('<button class="btn sm" type="button" style="margin-top:6px">Run</button>');
          blk.innerHTML = ""; blk.append(ed.el, run, st, con.el);
          pyStatus(st); Py.load();
          run.onclick = () => con.run(ed.get());
        };
      }
      const upd = () => paintAct();
      if (isEx) {
        ctrl = ({ mcq: mcqCtrl, output: mcqCtrl, fill: fillCtrl, order: orderCtrl, code: codeCtrl })[s.type](s, upd);
        $(".ctl", view).appendChild(ctrl.el);
      }
      function paintAct() {
        if (isEx && !ctrl) return;
        act.className = "act" + (mode === "ok" || mode === "revealed" ? " fb-ok" : mode === "bad" ? " fb-bad" : "");
        let fb = "";
        if (mode === "ok") fb = `<div class="fb" role="status"><div class="ft"><span class="mark">&#10003;</span>Correct<span class="xp">+${stepXp()} XP</span></div><div class="fe">${md(s.explain)}</div></div>`;
        if (mode === "bad") fb = `<div class="fb" role="status"><div class="ft"><span class="mark">&times;</span>Not quite</div><div class="fe">${md(fbMsg || s.hint)}</div></div>`;
        if (mode === "revealed") fb = `<div class="fb" role="status"><div class="ft" style="color:var(--yl)">Answer shown</div><div class="fe">${md(s.explain)}</div></div>`;
        let btns = "";
        if (!isEx) btns = `<button class="btn solid" data-a="next">Continue</button>`;
        else if (mode === "ask") btns = `<button class="btn ghost hintb" data-a="hint"${hinted ? " disabled" : ""}>Hint</button><button class="btn solid" data-a="check"${ctrl.ready() && !checking ? "" : " disabled"}>${checking ? "Checking..." : "Check"}</button>`;
        else if (mode === "bad") btns = (tries >= 2 ? `<button class="btn ghost" data-a="reveal">Show answer</button>` : "") + `<button class="btn mg solid" data-a="retry">Try again</button>`;
        else btns = `<button class="btn solid" data-a="next">Continue</button>`;
        act.innerHTML = fb + `<div class="in">${btns}</div>`;
        act.querySelectorAll("[data-a]").forEach(b => b.onclick = () => action(b.dataset.a));
        view.style.paddingBottom = (act.offsetHeight + 24) + "px";
      }
      function stepXp() { return tries === 0 && !hinted ? 10 : 5; }
      async function action(a) {
        if (a === "next") {
          if (isEx && mode === "ok") { L.xp += stepXp(); L.results[L.i] = "c"; }
          L.i++;
          if (L.i >= lesson.steps.length) finish(); else show();
        } else if (a === "hint") {
          hinted = true;
          $(".hw", view).innerHTML = `<div class="hint"><b>HINT</b>${md(s.hint)}</div>`;
          paintAct();
        } else if (a === "check") {
          checking = true; paintAct();
          const r = await ctrl.check();
          checking = false;
          if (r.ok) mode = "ok"; else { tries++; mode = "bad"; fbMsg = r.msg || s.hint; }
          paintAct();
        } else if (a === "retry") {
          mode = "ask"; ctrl.retry(); paintAct();
        } else if (a === "reveal") {
          ctrl.reveal(); mode = "revealed"; L.results[L.i] = "r"; paintAct();
        }
      }
      paintAct();
    }
    function finish() {
      const first = !P.done[lesson.id];
      const bonus = first ? 20 : 5;
      const gained = first ? L.xp + bonus : bonus;
      P.xp += gained;
      P.done[lesson.id] = { at: Date.now(), xp: Math.max((P.done[lesson.id] || {}).xp || 0, L.xp) };
      markActive(); save();
      act.remove();
      document.body.classList.remove("lesson");
      const nx = nextLesson();
      view.innerHTML = `<section class="done step"><div class="tag">Lesson complete</div><div class="big">${esc(lesson.title)}</div>
        <div class="xpb">+${gained} XP</div><div class="muted small">${first ? "Includes a 20 XP bonus for finishing" : "Practice round: 5 XP"}</div>
        <div class="stats"><div class="stat c"><div class="v">${P.xp}</div><div class="k">Total XP</div></div><div class="stat m"><div class="v">${liveStreak()}</div><div class="k">Day streak</div></div><div class="stat y"><div class="v">${Object.keys(P.done).length}/${LESSONS.length}</div><div class="k">Lessons</div></div></div>
        ${nx ? `<a class="btn solid block" href="#/l/${nx.id}">Next: ${esc(nx.title)}</a>` : `<div class="muted">You have finished every lesson available.</div>`}
        <a class="btn ghost block" href="#/">Back to course map</a></section>`;
      window.scrollTo(0, 0);
    }
    show();
  }

  /* ---------- home ---------- */
  function renderHome() {
    const nx = nextLesson();
    const curUnit = nx ? COURSE.units.find(u => u.lessons.includes(nx)) : null;
    const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
    const standalone = window.navigator.standalone || matchMedia("(display-mode: standalone)").matches;
    let html = `<div class="top"><div><div class="tag">QHO444 companion</div><h1 class="logo">PY<b>LEARN</b></h1></div></div>`;
    if (isIOS && !standalone && !P.hideInstall) html += `<div class="banner"><div><b>Install:</b> tap the Share button in Safari, then <b>Add to Home Screen</b>. It then opens full screen, and lessons work offline.</div><button type="button" aria-label="Dismiss" data-a="hide">&times;</button></div>`;
    html += `<div class="stats"><div class="stat c"><div class="v">${P.xp}</div><div class="k">XP</div></div><div class="stat m"><div class="v">${liveStreak()}</div><div class="k">Day streak</div></div><div class="stat y"><div class="v">${Object.keys(P.done).length}/${LESSONS.length}</div><div class="k">Lessons</div></div></div>`;
    if (nx) html += `<a class="next" href="#/l/${nx.id}"><span class="tag">${Object.keys(P.done).length ? "Continue" : "Start here"}: ${esc(curUnit.week)}</span><div class="t">${esc(nx.title)}</div><div class="s">${nx.steps.length} steps, about ${Math.max(2, Math.round(nx.steps.length * 0.5))} minutes</div><div class="btn solid block go">${Object.keys(P.done).length ? "Continue" : "Start"}</div></a>`;
    else html += `<div class="next"><div class="t">All lessons done</div><div class="s">Replay any lesson for practice, or try the Playground.</div></div>`;
    html += `<h2 class="h">Course map</h2>`;
    COURSE.units.forEach((u, ui) => {
      const d = unitDone(u), n = u.lessons.length, open = (curUnit ? curUnit === u : ui === 0);
      html += `<div class="unit${d === n ? " done" : ""}${open ? " open" : ""}" data-u="${u.id}"><button type="button" aria-expanded="${open}"><span class="unum">${d === n ? "&#10003;" : ui + 1}</span><span class="uinfo"><span class="t">${esc(u.title)}${u.status === "partial" ? '<span class="pill">Preview</span>' : ""}</span><span class="s" style="display:block">${esc(u.week)} &middot; ${esc(u.blurb)}</span><span class="bar"><i style="width:${Math.round(d / n * 100)}%"></i></span></span><span class="chev">&gt;</span></button><div class="lessons">`;
      u.lessons.forEach((l, li) => {
        const done = !!P.done[l.id], cur = nx && nx.id === l.id;
        html += `<a class="lrow${done ? " done" : ""}${cur ? " cur" : ""}" href="#/l/${l.id}"><span class="dot">${done ? "&#10003;" : li + 1}</span><span class="lt">${esc(l.title)}</span><span class="lm">${l.steps.length} steps</span></a>`;
      });
      if (u.status === "partial") html += `<div class="soon">More lessons for this week are on the way.</div>`;
      html += `</div></div>`;
    });
    html += `<div class="foot">Real Python runs on your phone. Your progress stays on this device.</div>`;
    view.innerHTML = html;
    view.querySelectorAll(".unit>button").forEach(b => b.onclick = () => { const u = b.parentElement; u.classList.toggle("open"); b.setAttribute("aria-expanded", u.classList.contains("open")); });
    const hb = view.querySelector('[data-a=hide]'); if (hb) hb.onclick = () => { P.hideInstall = true; save(); renderHome(); };
  }

  /* ---------- playground ---------- */
  const PLAY_KEY = "pylearn:play";
  const PLAY_DEFAULT = '# Write Python here, then press Run\nname = input("What is your name? ")\nprint(f"Hello, {name}!")\n\nfor i in range(3, 0, -1):\n    print(i)\nprint("Lift off")\n';
  function renderPlay() {
    let saved = null; try { saved = localStorage.getItem(PLAY_KEY); } catch (e) {}
    view.innerHTML = `<div class="top"><div><div class="tag">Free coding</div><h1 class="logo" style="font-size:22px">PLAY<b>GROUND</b></h1></div><button type="button" class="btn sm ghost" data-a="reset">New</button></div><div class="edw"></div><div class="row" style="margin-top:6px"><button type="button" class="btn solid" data-a="run">Run</button><button type="button" class="btn ghost" data-a="clear" style="flex:0 0 96px">Clear</button></div><div class="pys"></div><div class="cw"></div><p class="muted small" style="margin-top:12px">When your program calls input(), a box appears under the output. Type your answer and press Enter.</p>`;
    let tmr = null;
    const ed = createEditor({ value: saved == null ? PLAY_DEFAULT : saved, minRows: 10, label: "Playground code", onChange: v => { clearTimeout(tmr); tmr = setTimeout(() => { try { localStorage.setItem(PLAY_KEY, v); } catch (e) {} }, 300); } });
    $(".edw", view).appendChild(ed.el);
    const con = makeConsole("OUTPUT");
    $(".cw", view).appendChild(con.el);
    pyStatus($(".pys", view));
    Py.load();
    view.querySelector('[data-a=run]').onclick = () => con.run(ed.get());
    view.querySelector('[data-a=clear]').onclick = () => con.clear();
    view.querySelector('[data-a=reset]').onclick = () => modal(`<h3>Start a new program?</h3><p>This clears the editor.</p><div class="row"><button class="btn ghost" data-a="no">Cancel</button><button class="btn mg" data-a="yes">Clear editor</button></div>`, (m, close) => {
      m.querySelector('[data-a=no]').onclick = close;
      m.querySelector('[data-a=yes]').onclick = () => { ed.set(""); try { localStorage.setItem(PLAY_KEY, ""); } catch (e) {} con.clear(); close(); };
    });
  }

  /* ---------- progress + settings ---------- */
  function renderMe() {
    const total = LESSONS.length, done = Object.keys(P.done).length;
    let html = `<div class="top"><div><div class="tag">Stats and settings</div><h1 class="logo" style="font-size:22px">PRO<b>GRESS</b></h1></div></div>
      <div class="stats"><div class="stat c"><div class="v">${P.xp}</div><div class="k">XP</div></div><div class="stat m"><div class="v">${liveStreak()}</div><div class="k">Streak</div></div><div class="stat y"><div class="v">${P.best || 0}</div><div class="k">Best streak</div></div></div>
      <div class="card"><div class="muted small" style="margin-bottom:6px">Lessons completed: ${done} of ${total}</div><div class="ulist">`;
    COURSE.units.forEach(u => { html += `<div class="ur"><span>${esc(u.week)}: ${esc(u.title)}</span><span>${unitDone(u)}/${u.lessons.length}</span></div>`; });
    html += `</div></div><h2 class="h">Settings</h2><div class="card">
      <div class="set"><div class="st"><b>Larger text</b><span>Makes text and code bigger</span></div><button type="button" class="sw" role="switch" aria-label="Larger text" aria-checked="${!!P.settings.large}" data-s="large"></button></div>
      <div class="set"><div class="st"><b>Calm mode</b><span>Less glow and no animations</span></div><button type="button" class="sw" role="switch" aria-label="Calm mode" aria-checked="${!!P.settings.calm}" data-s="calm"></button></div>
      <div class="set"><div class="st"><b>Python for offline use</b><span class="pyst">Not downloaded yet</span></div><button type="button" class="btn sm" data-a="py">Download</button></div>
      </div><div class="card"><div class="set"><div class="st"><b>Reset progress</b><span>Deletes XP, streak and completed lessons on this device</span></div><button type="button" class="btn sm bad" data-a="reset">Reset</button></div></div>
      <div class="foot">PyLearn v1 &middot; ${COURSE.units.length} units, ${total} lessons &middot; No account, nothing leaves your device.</div>`;
    view.innerHTML = html;
    view.querySelectorAll(".sw").forEach(b => b.onclick = () => { const k = b.dataset.s; P.settings[k] = !P.settings[k]; save(); applySettings(); b.setAttribute("aria-checked", P.settings[k]); });
    const pst = $(".pyst", view), pb = view.querySelector('[data-a=py]');
    function paintPy(s) {
      if (!pst.isConnected) return;
      pst.textContent = s.status === "ready" ? `Ready (Python ${s.version})` : s.status === "loading" ? "Downloading..." : s.status === "error" ? "Download failed. Check your connection." : "Not loaded yet. Downloads about 10 MB once.";
      pb.disabled = s.status === "ready" || s.status === "loading";
      pb.textContent = s.status === "ready" ? "Done" : "Download";
    }
    paintPy(Py.state); cleanup.push(Py.onChange(paintPy));
    pb.onclick = () => Py.load();
    view.querySelector('[data-a=reset]').onclick = () => modal(`<h3>Reset all progress?</h3><p>This deletes your XP, streak and completed lessons on this device. It cannot be undone.</p><div class="row"><button class="btn ghost" data-a="no">Cancel</button><button class="btn bad" data-a="yes">Reset everything</button></div>`, (m, close) => {
      m.querySelector('[data-a=no]').onclick = close;
      m.querySelector('[data-a=yes]').onclick = () => { const s = P.settings; P = blank(); P.settings = s; save(); close(); renderMe(); };
    });
  }

  /* ---------- router ---------- */
  function route() {
    cleanup.forEach(f => { try { f(); } catch (e) {} }); cleanup = [];
    $("#modal").hidden = true;
    view.style.paddingBottom = "";
    const hsh = location.hash || "#/";
    let tab = "learn", m;
    if ((m = hsh.match(/^#\/l\/(\w+)/))) renderLesson(m[1]);
    else if (hsh.startsWith("#/play")) { tab = "play"; renderPlay(); }
    else if (hsh.startsWith("#/me")) { tab = "me"; renderMe(); }
    else renderHome();
    document.querySelectorAll("#tabbar a").forEach(a => { a.classList.toggle("on", a.dataset.tab === tab); a.setAttribute("aria-current", a.dataset.tab === tab ? "page" : "false"); });
    window.scrollTo(0, 0);
  }

  async function init() {
    try {
      COURSE = await (await fetch("content/course.json")).json();
    } catch (e) {
      view.innerHTML = `<p style="padding:20px">The lessons could not be loaded. Check your connection and reload.</p>`; return;
    }
    LESSONS = COURSE.units.flatMap(u => u.lessons);
    window.addEventListener("hashchange", route);
    route();
  }
  init();

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }
  window.PyLearn = { get progress() { return P; } };
})();
