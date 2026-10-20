const { chromium, devices } = require('playwright');
const fs = require('fs');
const BASE = `http://127.0.0.1:${(process.env.PORT || '8811')}/`;
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'], serviceWorkers: 'allow' });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(BASE); await p.waitForSelector('.unit');
  await p.evaluate(() => navigator.serviceWorker.ready);
  await p.reload(); await p.waitForSelector('.unit');   // page now controlled by the SW
  const controlled = await p.evaluate(() => !!navigator.serviceWorker.controller);
  await p.goto(BASE + '#/play'); await p.waitForSelector('.edw textarea');
  await p.fill('.edw textarea', 'print(sum(range(5)))'); await p.click('[data-a=run]');
  await p.waitForFunction(() => document.querySelector('.cw pre').textContent.includes('10'), null, { timeout: 90000 });
  const cached = await p.evaluate(async () => { const out = {}; for (const k of await caches.keys()) out[k] = (await (await caches.open(k)).keys()).length; return out; });
  await ctx.setOffline(true);
  await p.goto(BASE); await p.reload(); await p.waitForSelector('.unit', { timeout: 15000 });
  const homeOffline = await p.locator('.unit').count();
  await p.goto(BASE + '#/l/u2l1'); await p.waitForSelector('.step');
  await p.goto(BASE + '#/play'); await p.waitForSelector('.edw textarea');
  await p.fill('.edw textarea', 'print("offline", 6 * 7)'); await p.click('[data-a=run]');
  let pyOffline = false;
  try { await p.waitForFunction(() => document.querySelector('.cw pre').textContent.includes('offline 42'), null, { timeout: 60000 }); pyOffline = true; } catch (e) {}
  console.log(JSON.stringify({ controlled, cached, homeOffline, pyOffline, errs }, null, 1));
  await b.close();
})();
