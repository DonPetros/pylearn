const { webkit, chromium, devices } = require('playwright');
const fs = require('fs');
const PORT = (process.env.PORT || '8811');
const BASE = `http://127.0.0.1:${PORT}/`;
const SHOTS = '' + require('path').join(__dirname, '..') + '/screens/';
fs.mkdirSync(SHOTS, { recursive: true });
const results = [];
const ok = (name, cond, extra) => { results.push({ name, pass: !!cond, extra }); console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' :: ' + extra : '')); };

async function layout(p, name) {
  const r = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  ok(`no horizontal overflow: ${name}`, r.sw <= r.cw + 1, `${r.sw} vs ${r.cw}`);
}
async function tapTargets(p, name) {
  const small = await p.evaluate(() => [...document.querySelectorAll('button, a, input, textarea')].filter(e => {
    const r = e.getBoundingClientRect(); if (!r.width || !r.height) return false;
    if (e.closest('.blank') || e.classList.contains('blank') || e.closest('#tabbar[hidden]')) return false;
    const st = getComputedStyle(e); if (st.visibility === 'hidden' || st.display === 'none') return false;
    return r.height < 44 || r.width < 44;
  }).map(e => `${e.tagName.toLowerCase()}.${e.className}:${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`));
  ok(`tap targets >= 44px: ${name}`, small.length === 0, small.slice(0, 6).join(', '));
}
async function shot(p, file) { await p.waitForTimeout(350); await p.screenshot({ path: SHOTS + file, scale: 'css' }); console.log('  screenshot', file); }

async function waitFeedback(p) { await p.waitForSelector('.act.fb-ok, .act.fb-bad', { timeout: 60000 }); return (await p.getAttribute('.act', 'class')).includes('fb-ok'); }

async function answerStep(p, s) {
  if (s.type === 'mcq' || s.type === 'output') await p.click(`.opt[data-oi="${s.answer}"]`);
  else if (s.type === 'fill') { for (const a of s.answers) await p.locator('.chip:not(.used)', { hasText: a }).filter({ hasText: new RegExp('^' + a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') }).first().click(); }
  else if (s.type === 'order') { for (let k = 0; k < s.lines.length; k++) await p.click(`.pool .oline[data-i="${k}"]`); }
  else if (s.type === 'code') { await p.fill('.edw textarea', s.solution); }
}

async function solveLesson(p, lesson, hooks = {}) {
  await p.goto(BASE + '#/l/' + lesson.id);
  await p.waitForSelector('.step');
  let good = 0;
  for (let i = 0; i < lesson.steps.length; i++) {
    const s = lesson.steps[i];
    await p.waitForSelector(`.lbar .cnt:text-is("${i + 1}/${lesson.steps.length}")`);
    if (hooks.before) await hooks.before(i, s);
    if (s.type === 'card') { await p.click('[data-a=next]'); continue; }
    await answerStep(p, s);
    await p.click('[data-a=check]:not([disabled])');
    const right = await waitFeedback(p);
    if (right) good++; else console.log('   wrong on', lesson.id, i + 1, s.type, (await p.textContent('.act .fb')).slice(0, 200), s.type === 'code' ? await p.textContent('.tests') : '');
    if (hooks.after) await hooks.after(i, s, right);
    await p.click('[data-a=next]');
  }
  await p.waitForSelector('.done');
  return good === lesson.steps.filter(s => s.type !== 'card').length;
}

(async () => {
  const course = JSON.parse(fs.readFileSync('' + require('path').join(__dirname, '..') + '/content/course.json', 'utf8'));
  const lessons = course.units.flatMap(u => u.lessons);
  const browser = await webkit.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  // 1. home
  await p.goto(BASE);
  await p.waitForSelector('.unit');
  await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForSelector('.unit');
  ok('home shows 7 units', (await p.locator('.unit').count()) === 7);
  ok('home shows 25 lessons total', (await p.textContent('.stat.y .v')).trim() === '0/25');
  ok('Pyodide NOT loaded on home (lazy)', await p.evaluate(() => Py.state.status === 'idle'));
  await layout(p, 'home'); await tapTargets(p, 'home');
  await shot(p, '01-home-course-map.png');

  // 2. lesson u1l1 covers: card, output, mcq, fill, order, code
  const l1 = lessons[0];
  let sawWrong = false, hintShown = false;
  const allOk = await solveLesson(p, l1, {
    before: async (i, s) => {
      if (i === 0) { await layout(p, 'lesson card'); await tapTargets(p, 'lesson card'); await shot(p, '02-lesson-card.png'); }
      if (s.type === 'output' && !sawWrong) {
        // deliberately wrong first, then use the hint, then try again
        const wrong = s.answer === 0 ? 1 : 0;
        await p.click(`.opt[data-oi="${wrong}"]`);
        await p.click('[data-a=check]');
        const r = await waitFeedback(p);
        ok('wrong answer gives "Not quite" feedback', !r && (await p.textContent('.act .fb')).includes('Not quite'));
        await shot(p, '03-exercise-wrong-feedback.png');
        await p.click('[data-a=retry]');
        await p.click('[data-a=hint]');
        hintShown = await p.isVisible('.hint');
        sawWrong = true;
      }
      if (s.type === 'order') { /* fill the order exercise then screenshot after check (in after) */ }
    },
    after: async (i, s, right) => {
      if (s.type === 'order') { await layout(p, 'order exercise'); await shot(p, '04-exercise-correct-feedback.png'); }
      if (s.type === 'code') {
        ok('code challenge passes with Pyodide', right);
        ok('Pyodide loaded lazily for the challenge', await p.evaluate(() => Py.state.status === 'ready'));
        await p.evaluate(() => window.scrollTo(0, 0));
        await layout(p, 'code challenge'); await tapTargets(p, 'code challenge');
        await shot(p, '05-code-challenge.png');
      }
    },
  });
  ok('hint button shows a hint', hintShown);
  ok('lesson 1 completed (all exercise types)', allOk);
  const xp1 = await p.evaluate(() => PyLearn.progress.xp);
  ok('XP awarded after lesson 1', xp1 > 0, 'xp=' + xp1);

  // 3. a wrong code submission is detected
  await p.goto(BASE + '#/l/u1l6');
  const l6 = lessons.find(l => l.id === 'u1l6');
  const ci = l6.steps.findIndex(s => s.type === 'code');
  for (let i = 0; i < ci; i++) {
    const s = l6.steps[i];
    await p.waitForSelector(`.lbar .cnt:text-is("${i + 1}/${l6.steps.length}")`);
    if (s.type === 'card') { await p.click('[data-a=next]'); continue; }
    await answerStep(p, s); await p.click('[data-a=check]'); await waitFeedback(p); await p.click('[data-a=next]');
  }
  await p.fill('.edw textarea', 'a = input()\nb = input()\nprint(a + b)');
  await p.click('[data-a=check]:not([disabled])');
  const r6 = await waitFeedback(p);
  const tests6 = await p.textContent('.tests');
  ok('wrong challenge code fails its tests', !r6 && tests6.includes('expected: 9') && tests6.includes('got:      45'), tests6.replace(/\s+/g, ' ').slice(0, 120));
  await p.click('[data-a=retry]');
  // Run button with input() inside a challenge
  await p.fill('.edw textarea', 'n = int(input("n? "))\nprint(n * 2)');
  await p.click('.runb');
  await p.waitForSelector('.cw .inrow:not([hidden])');
  await p.fill('.cw .inrow input', '21'); await p.press('.cw .inrow input', 'Enter');
  await p.waitForFunction(() => document.querySelector('.cw pre').textContent.includes('42'));
  ok('Run button in a challenge supports input()', (await p.textContent('.cw pre')).includes('n? 21'));

  // 4. every lesson end to end (real Python 3 in the browser)
  let passedLessons = 1;
  for (const l of lessons.slice(1)) {
    const res = await solveLesson(p, l);
    if (res) passedLessons++; else console.log('   lesson failed:', l.id);
  }
  ok(`all ${lessons.length} lessons completed in the browser with every answer accepted`, passedLessons === lessons.length, `${passedLessons}/${lessons.length}`);

  // 5. playground with input()
  await p.goto(BASE + '#/play');
  await p.waitForSelector('.edw textarea');
  const prog = 'name = input("Name? ")\nage = int(input("Age? "))\nif age >= 18:\n    print(f"{name} is an adult")\nelse:\n    print(f"{name} is under 18")\nfor i in range(1, 4):\n    print("Line", i)';
  await p.fill('.edw textarea', prog);
  await p.click('[data-a=run]');
  await p.waitForSelector('.cw .inrow:not([hidden])');
  await p.fill('.cw .inrow input', 'Sam'); await p.press('.cw .inrow input', 'Enter');
  await p.waitForFunction(() => document.querySelector('.cw pre').textContent.includes('Age? '));
  await p.waitForSelector('.cw .inrow:not([hidden])');
  await p.fill('.cw .inrow input', '19'); await p.press('.cw .inrow input', 'Enter');
  await p.waitForFunction(() => document.querySelector('.cw pre').textContent.includes('Line 3'));
  const out = await p.textContent('.cw pre');
  ok('playground runs code with two input() calls', out.includes('Name? Sam') && out.includes('Age? 19') && out.includes('Sam is an adult'), JSON.stringify(out));
  ok('input box hidden after program ends', !(await p.isVisible('.cw .inrow')));
  await layout(p, 'playground'); await tapTargets(p, 'playground');
  await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await shot(p, '06-playground.png');
  // tab key inserts 4 spaces
  await p.fill('.edw textarea', ''); await p.focus('.edw textarea'); await p.keyboard.type('if True:'); await p.keyboard.press('Enter'); await p.keyboard.type('x = 1'); await p.keyboard.press('Enter'); await p.keyboard.press('Backspace'); await p.keyboard.press('Tab'); 
  const tv = await p.inputValue('.edw textarea');
  ok('editor auto-indents after a colon and Tab inserts 4 spaces', tv === 'if True:\n    x = 1\n    ', JSON.stringify(tv));
  // errors are explained
  await p.fill('.edw textarea', 'print(score)');
  await p.click('[data-a=run]');
  await p.waitForFunction(() => document.querySelector('.cw pre').textContent.includes('NameError'));
  ok('errors show the type, line and a plain-English tip', (await p.textContent('.cw pre')).includes("(line 1)") && (await p.textContent('.cw .tip')).length > 10);
  // infinite loop is stopped
  await p.fill('.edw textarea', 'while True:\n    pass');
  const t0 = Date.now();
  await p.click('[data-a=run]');
  await p.waitForFunction(() => document.querySelector('.cw pre').textContent.includes('Timeout'), null, { timeout: 30000 });
  ok('infinite loop stopped by timeout', true, `${Date.now() - t0} ms`);
  await p.fill('.edw textarea', 'print("back")');
  await p.click('[data-a=run]');
  await p.waitForFunction(() => document.querySelector('.cw pre').textContent.includes('back'), null, { timeout: 60000 });
  ok('Python works again after a timeout', true);
  await p.fill('.edw textarea', 'print("saved code")');
  await p.waitForTimeout(500);

  // 6. persistence after reload
  const before = await p.evaluate(() => JSON.parse(localStorage.getItem('pylearn:v1')));
  await p.reload(); await p.goto(BASE); await p.waitForSelector('.unit');
  const after = await p.evaluate(() => JSON.parse(localStorage.getItem('pylearn:v1')));
  ok('progress persists after reload', after.xp === before.xp && Object.keys(after.done).length === lessons.length && (await p.textContent('.stat.y .v')).trim() === `${lessons.length}/${lessons.length}`, `xp=${after.xp} streak=${after.streak}`);
  ok('daily streak recorded', after.streak === 1 && after.lastDay);
  await p.goto(BASE + '#/play'); await p.waitForSelector('.edw textarea');
  ok('playground code persists after reload', (await p.inputValue('.edw textarea')) === 'print("saved code")');

  // 7. settings + reset
  await p.goto(BASE + '#/me'); await p.waitForSelector('.sw');
  await p.click('.sw[data-s=large]');
  ok('larger text setting applies', await p.evaluate(() => document.documentElement.classList.contains('large')));
  await p.click('.sw[data-s=large]');
  await tapTargets(p, 'progress/settings');
  await p.click('[data-a=reset]'); await p.click('.sheet [data-a=yes]');
  await p.reload(); await p.waitForSelector('.sw');
  const reset = await p.evaluate(() => JSON.parse(localStorage.getItem('pylearn:v1')));
  ok('reset progress clears XP and lessons', reset.xp === 0 && Object.keys(reset.done).length === 0);

  ok('no JavaScript errors during the run', errors.length === 0, errors.slice(0, 5).join(' | '));
  await browser.close();

  const failed = results.filter(r => !r.pass);
  fs.writeFileSync('' + require('path').join(__dirname, '..') + '/screens/test-results.json', JSON.stringify({ browser: 'WebKit (Playwright) with iPhone 13 profile', date: new Date().toISOString(), results }, null, 1));
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
