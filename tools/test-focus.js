'use strict';
// npm run test:ui (Edge on Windows; install Playwright Chromium on Linux).
const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require(process.argv[2] || 'playwright');

(async function () {
  const browser = await chromium.launch({
    headless: true,
    channel: process.env.BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined)
  });
  try {
    const page = await browser.newPage({viewport: {width: 1920, height: 1080}});
    const app = process.argv[3] || path.resolve(__dirname, '../app');
    await page.goto(pathToFileURL(path.join(app, 'index.html')).href);
    await page.waitForFunction(() => !document.getElementById('blue-toggle').disabled);
    async function settled() {
      await page.waitForFunction(() => !document.body.classList.contains('busy'));
    }
    async function focused(id) {
      assert.equal(await page.evaluate(() => document.activeElement.id), id);
    }

    for (let attempt = 0; attempt < 4; attempt++) {
      await page.focus('#blue-toggle');
      const before = await page.getAttribute('#blue-toggle', 'aria-checked');
      await page.keyboard.press('Enter');
      await settled();
      assert.notEqual(await page.getAttribute('#blue-toggle', 'aria-checked'), before);
      await focused('blue-toggle');
    }
    console.log('PASS: repeated OK toggles preserve blue light button focus');

    await page.focus('#resume');
    await page.keyboard.press('Enter');
    await settled();
    await focused('blue-toggle');
    console.log('PASS: resume returns focus to an enabled control');

    await page.focus('#dim-now');
    await page.keyboard.press('Enter'); await settled();
    await focused('dim-now');
    await page.focus('#brighten-now');
    await page.keyboard.press('Enter'); await settled();
    await focused('dim-now');
    assert.equal(await page.textContent('#currentBrightness'), '100');
    console.log('PASS: brightness limit moves focus to the opposite control');

    await page.focus('#blue-toggle');
    await page.keyboard.press('Enter');
    await page.focus('#enabled');
    await settled();
    await focused('enabled');
    console.log('PASS: an in-flight request does not steal newly moved focus');

    await page.click('[data-time="start"][data-step="15"]');
    await page.focus('#save');
    await page.keyboard.press('Enter'); await settled();
    await focused('enabled');
    console.log('PASS: saving returns focus to the schedule switch');

    for (const viewport of [{width:1920,height:1080}, {width:1280,height:720}]) {
      await page.setViewportSize(viewport);
      for (const expanded of [false, true]) {
        const current = await page.getAttribute('#manageBrightness', 'aria-checked') === 'true';
        if (current !== expanded) await page.click('#manageBrightness');
        await page.waitForTimeout(150);
        const size = await page.evaluate(() => ({width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight}));
        assert.ok(size.width <= viewport.width && size.height <= viewport.height, JSON.stringify({viewport, expanded, size}));
      }
    }
    console.log('PASS: collapsed and expanded settings fit 1080p and 720p');
  } finally {
    await browser.close();
  }
}()).catch(function (error) { console.error(error); process.exitCode = 1; });
