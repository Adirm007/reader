/*
 * 批量截图：node tools/preview/shoot.mjs --out <目录> [--base http://localhost:8765/] [--src <完整版 json 的 URL>]
 * 需要：仓库根目录起一个静态服务（python -m http.server 8765），npm i playwright-core，以及本机 Chrome。
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const out = arg('out', 'shots');
const base = arg('base', 'http://localhost:8765/');
const src = arg('src', '');
const only = arg('only', '');
const chrome = arg('chrome', process.env.CHROME || '/usr/bin/google-chrome-stable');
fs.mkdirSync(out, { recursive: true });

const viewports = {
  mobile: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  desktop: { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 }
};
const states = [
  { name: 'sealed', letters: 'short', open: false },
  { name: 'short', letters: 'short', open: true },
  { name: 'long', letters: 'long', open: true }
];

const browser = await chromium.launch({ executablePath: chrome, args: ['--autoplay-policy=user-gesture-required'] });
for (const theme of ['cafe', 'summer', 'ink']) {
  for (const [vpName, vp] of Object.entries(viewports)) {
    for (const st of states) {
      const file = `${theme}-${vpName}-${st.name}.png`;
      if (only && !file.includes(only)) continue;
      const ctx = await browser.newContext(vp);
      const page = await ctx.newPage();
      page.on('pageerror', e => console.log(`[${file}] pageerror:`, e.message));
      const url = new URL('tools/preview/index.html', base);
      url.searchParams.set('bare', '1');
      url.searchParams.set('theme', theme);
      url.searchParams.set('letters', st.letters);
      if (src) url.searchParams.set('src', src);
      await page.goto(url.href, { waitUntil: 'networkidle' });
      const frame = await (await page.waitForSelector('.mes_text iframe')).contentFrame();
      await frame.waitForSelector('.envelope-casing', { state: 'attached' });
      await page.waitForTimeout(1200);
      if (st.open) {
        await frame.click('.envelope-casing', { force: true });
        await page.waitForTimeout(2600);
      }
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(out, file), fullPage: true, animations: 'disabled' });
      console.log('saved', file);
      await ctx.close();
    }
  }
}
await browser.close();
