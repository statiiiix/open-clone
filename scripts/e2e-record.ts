// Checks the recording screen with Chromium's fake microphone (a beeping test tone):
// stopping early is refused, and a full recording stops by itself at one minute and is accepted.
import { _electron as electron } from 'playwright-core';
import path from 'node:path';

/** Wait until the recording has been read and judged. */
const settled = (page: import('playwright-core').Page) =>
  page.waitForFunction(() => {
    const el = document.querySelector('.sheet .sample-ok, .sheet .error');
    return !!el && !el.textContent?.includes('Reading audio');
  }, undefined, { timeout: 120000 });

async function main() {
  const app = await electron.launch({ args: ['.', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  const page = await app.firstWindow();
  page.on('pageerror', (e) => console.log('[page error]', e.message));
  await page.waitForSelector('.app');
  await page.click('.new-voice');
  await page.fill('.sheet input[placeholder="My voice"]', 'Recorded voice');
  await page.click('.rec-start');
  await page.waitForSelector('.recorder');
  await page.waitForTimeout(11000);
  console.log('at 11s:', await page.locator('.recorder > p.small').innerText(), '| timer:', await page.locator('.rec-time').innerText(), '| coach:', await page.locator('.rec-coach').innerText(), '| script paragraphs:', await page.locator('.script p').count());
  await page.screenshot({ path: path.resolve('proof/e2e-rec-1-recording.png') });
  await page.click('.rec-stop');
  await settled(page);
  console.log('stopped early:', await page.locator('.sheet .sample-ok, .sheet .error').allInnerTexts());

  await page.click('.rec-start');
  await page.waitForSelector('.recorder');
  const started = Date.now();
  await settled(page);
  console.log(`full recording stopped by itself after ${((Date.now() - started) / 1000).toFixed(0)}s:`, await page.locator('.sheet .sample-ok, .sheet .error').allInnerTexts());
  await page.screenshot({ path: path.resolve('proof/e2e-rec-2-done.png') });
  await app.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
