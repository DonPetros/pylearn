/* Small code editor: textarea + line numbers, Tab = 4 spaces, auto-indent, phone key row. */
(function () {
  const IND = "    ";
  function createEditor(opts) {
    opts = opts || {};
    const wrap = document.createElement("div");
    wrap.innerHTML = `<div class="ed"><div class="gut" aria-hidden="true">1</div>
      <textarea spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off" wrap="off" aria-label="${opts.label || "Code editor"}"></textarea></div>
      <div class="keys" role="toolbar" aria-label="Code keys"></div>`;
    const ta = wrap.querySelector("textarea"), gut = wrap.querySelector(".gut"), keys = wrap.querySelector(".keys");
    const minRows = opts.minRows || 8;
    ta.value = opts.value || "";

    let booted = false;
    function refresh() {
      const n = ta.value.split("\n").length;
      let s = ""; for (let i = 1; i <= n; i++) s += i + (i < n ? "\n" : "");
      gut.textContent = s;
      ta.rows = Math.max(minRows, n + 1);
      if (booted && opts.onChange) opts.onChange(ta.value);
    }
    function insert(text, back) {
      ta.focus();
      let ok = false;
      try { ok = text === "" ? document.execCommand("delete", false) : document.execCommand("insertText", false, text); } catch (e) { ok = false; }
      if (!ok) { ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, "end"); }
      if (back) { const p = ta.selectionStart - back; ta.setSelectionRange(p, p); }
      refresh();
    }
    function lineStart(pos) { return ta.value.lastIndexOf("\n", pos - 1) + 1; }
    function dedent() {
      const ls = lineStart(ta.selectionStart);
      const m = /^ {1,4}/.exec(ta.value.slice(ls));
      if (!m) return;
      const caret = ta.selectionStart;
      ta.setSelectionRange(ls, ls + m[0].length);
      insert("");
      const p = Math.max(ls, caret - m[0].length); ta.setSelectionRange(p, p);
    }
    ta.addEventListener("keydown", e => {
      if (e.key === "Tab") { e.preventDefault(); if (e.shiftKey) dedent(); else insert(IND); return; }
      if (e.key === "Enter" && !e.isComposing) {
        e.preventDefault();
        const pos = ta.selectionStart, ls = lineStart(pos), before = ta.value.slice(ls, pos);
        let ind = /^ */.exec(before)[0];
        if (/:\s*(#.*)?$/.test(before)) ind += IND;
        insert("\n" + ind);
        return;
      }
      if (e.key === "Backspace" && ta.selectionStart === ta.selectionEnd) {
        const pos = ta.selectionStart, ls = lineStart(pos), before = ta.value.slice(ls, pos);
        if (before.length && /^ +$/.test(before)) {
          e.preventDefault();
          const cut = before.length % 4 || 4;
          ta.setSelectionRange(pos - cut, pos); insert("");
        }
      }
    });
    ta.addEventListener("input", refresh);
    ta.addEventListener("scroll", () => { gut.scrollTop = ta.scrollTop; });

    const K = [["Tab", IND, 0], ["Undent", null, 0], [":", ":", 0], ["( )", "()", 1], ['" "', '""', 1], ["[ ]", "[]", 1], ["{ }", "{}", 1],
               ["=", " = ", 0], ["==", " == ", 0], ["#", "# ", 0], ["_", "_", 0], ["print", "print()", 1], ["input", "input()", 1], ['f" "', 'f""', 1]];
    K.forEach(([label, text, back]) => {
      const b = document.createElement("button");
      b.type = "button"; b.textContent = label; b.setAttribute("aria-label", "Insert " + label);
      b.addEventListener("pointerdown", e => e.preventDefault());   // keep the keyboard open
      b.addEventListener("click", () => { if (text === null) dedent(); else insert(text, back); });
      keys.appendChild(b);
    });
    refresh();
    booted = true;
    return { el: wrap, textarea: ta, get: () => ta.value, set: v => { ta.value = v; refresh(); }, focus: () => ta.focus() };
  }
  window.createEditor = createEditor;
})();
