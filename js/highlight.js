/* Tiny Python syntax highlighter (no dependencies). */
(function () {
  const KW = new Set("and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield".split(" "));
  const BOOL = new Set(["True", "False", "None"]);
  const BI = new Set("print input int float str bool len range type list tuple dict set enumerate open sum min max abs round sorted reversed zip map filter isinstance".split(" "));
  const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const RE = /(#[^\n]*)|([rRbBfF]{0,2}"""[\s\S]*?"""|[rRbBfF]{0,2}'''[\s\S]*?'''|[rRbBfF]{0,2}"(?:\\.|[^"\\\n])*"?|[rRbBfF]{0,2}'(?:\\.|[^'\\\n])*'?)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_]\w*)|(\s+)|([^\sA-Za-z_\d])/g;
  function span(cls, t) { return `<span class="tok-${cls}">${esc(t)}</span>`; }
  function fstr(t) {
    // highlight {expressions} inside f-strings
    let out = "", i = 0, m, re = /\{[^{}]*\}/g;
    while ((m = re.exec(t))) {
      out += span("s", t.slice(i, m.index)) + span("se", "{") + highlight(m[0].slice(1, -1)) + span("se", "}");
      i = m.index + m[0].length;
    }
    return out + span("s", t.slice(i));
  }
  function highlight(code) {
    let out = "", m, prev = "";
    const re = new RegExp(RE.source, "g");   // own regex per call: f-strings call highlight() recursively
    while ((m = re.exec(code))) {
      const [t, com, str, num, word, ws] = m;
      if (com) out += span("c", t);
      else if (str) out += /^[rRbB]*[fF]/.test(str) ? fstr(t) : span("s", t);
      else if (num) out += span("n", t);
      else if (word) {
        if (KW.has(t)) out += span("k", t);
        else if (BOOL.has(t)) out += span("bool", t);
        else if (prev === "def") out += span("f", t);
        else if (BI.has(t) && code[re.lastIndex] === "(") out += span("b", t);
        else out += esc(t);
        prev = t;
        continue;
      } else if (ws) out += t;
      else out += span("o", t);
      if (!ws) prev = t;
    }
    return out;
  }
  window.PyHL = { highlight, esc };
})();
