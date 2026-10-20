global.window = {}; require('' + require('path').join(__dirname, '..') + '/js/highlight.js');
const c = require('' + require('path').join(__dirname, '..') + '/content/course.json'); let n = 0, bad = 0;
const unesc = s => s.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
for (const u of c.units) for (const l of u.lessons) for (const s of l.steps) for (const code of [s.code, s.solution, s.starter, ...(s.lines || [])].filter(Boolean)) {
  n++; if (unesc(window.PyHL.highlight(code)) !== code) { bad++; console.log('MISMATCH', l.id, code); }
}
console.log(`highlighter round-trip: ${n - bad}/${n} ok`);
