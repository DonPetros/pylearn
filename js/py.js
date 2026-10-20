/* Main-thread wrapper around the Python worker. Python (Pyodide) is only downloaded
   the first time something calls Py.load() or Py.run(). */
(function () {
  let worker = null, readyP = null, seq = 0;
  const pending = new Map();
  const listeners = new Set();
  const state = { status: "idle", version: null, error: null };   // idle | loading | ready | error

  function set(status, extra) { Object.assign(state, { status }, extra || {}); listeners.forEach(f => f(state)); }

  function start() {
    worker = new Worker("js/py-worker.js", { type: "module" });
    set("loading");
    readyP = new Promise((resolve, reject) => {
      worker.onmessage = ev => {
        const m = ev.data;
        if (m.type === "ready") { set("ready", { version: m.version, error: null }); resolve(); }
        else if (m.type === "loaderror") { set("error", { error: m.error }); reject(new Error(m.error)); }
        else if (m.type === "result") { const p = pending.get(m.id); if (p) { pending.delete(m.id); clearTimeout(p.t); p.resolve(m.result); } }
      };
      worker.onerror = e => { set("error", { error: e.message || "worker error" }); reject(e); };
    });
    readyP.catch(() => {});
    return readyP;
  }

  function load() {
    if (!worker || state.status === "error") { if (worker) worker.terminate(); start(); }
    return readyP;
  }

  function restart() {
    if (worker) worker.terminate();
    pending.forEach(p => { clearTimeout(p.t); p.resolve({ out: "", error: "Timeout", error_type: "Timeout" }); });
    pending.clear();
    worker = null;
    return load();
  }

  async function run(code, opts) {
    opts = opts || {};
    await load();
    const id = ++seq;
    const timeout = opts.timeout || 8000;
    return new Promise(resolve => {
      const t = setTimeout(() => {
        pending.delete(id);
        restart();
        resolve({ out: "", error: "Timeout: your code ran for more than " + Math.round(timeout / 1000) + " seconds, so it was stopped. Check for a loop that never ends.", error_type: "Timeout", timeout: true });
      }, timeout);
      pending.set(id, { resolve, t });
      worker.postMessage({ id, code, stdin: opts.stdin || [], echo: opts.echo !== false, after: opts.after || null, interactive: !!opts.interactive, seed: opts.seed == null ? null : opts.seed });
    });
  }

  function norm(s) { return String(s).replace(/\r\n/g, "\n").split("\n").map(l => l.replace(/\s+$/, "")).join("\n").replace(/\n+$/, ""); }

  const TIPS = {
    NameError: "Python does not know that name. Check the spelling and capitals, and that the variable was created before this line. Text needs quotes.",
    SyntaxError: "Python could not read this line. Look for a missing colon, bracket, quote or comma.",
    IndentationError: "The spaces at the start of a line are wrong. Code inside if, for, while and def needs 4 spaces.",
    TypeError: "Two values of types that do not work together, such as adding text and a number. Convert with int() or str().",
    ValueError: "The value has the right type but wrong content, for example int(\"hello\").",
    ZeroDivisionError: "You divided by zero.",
    IndexError: "That position does not exist. Indexes start at 0.",
    KeyError: "That key is not in the dictionary.",
    EOFError: "The program asked for input but none was left.",
    FileNotFoundError: "That file does not exist yet. Write it first, and check the name.",
    AttributeError: "That value does not have that method. Check the spelling, for example .lower() not .lowercase().",
  };

  window.Py = { load, run, restart, norm, state, TIPS, onChange: f => { listeners.add(f); return () => listeners.delete(f); } };
})();
