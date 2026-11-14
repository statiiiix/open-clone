// Checks the recording screen with Chromium's fake microphone (a beeping test tone).
import { _electron as electron } from 'playwright-core';
import path from 'node:path';

async function main() {
  const app = await electron.launch({ args: ['.', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  const page = await app.firstWindow();
  page.on('pageerror', (e) => console.log('[page error]', e.message));
  await page.waitForSelector('.app');
  await page.click('.new-voice');
  await page.fill('.sheet input[placeholder="My voice"]', 'Recorded voice');
  await page.screenshot({ path: path.resolve('proof/e2e-rec-0-start.png') });
  await page.click('.rec-start');
  await page.waitForSelector('.recorder');
  await page.waitForTimeout(4000);
  console.log('hint at 4s:', await page.locator('.recorder > p.small').innerText());
  await page.waitForTimeout(7500);
  console.log('hint at 11s:', await page.locator('.recorder > p.small').innerText(), '| timer:', await page.locator('.rec-time').innerText());
  await page.screenshot({ path: path.resolve('proof/e2e-rec-1-recording.png') });
  await page.click('.rec-stop');
  await page.waitForSelector('.sheet .sample-ok, .sheet .error');
  console.log('after stop:', await page.locator('.sheet .sample-ok, .sheet .error, .sheet .warn').allInnerTexts());
  await page.screenshot({ path: path.resolve('proof/e2e-rec-2-done.png') });
  await app.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
