// Drives the built app end to end: new voice from a file, generate, save state, delete.
// Run: npm run build && npx tsx scripts/e2e-smoke.ts   (needs the model already downloaded)
import { _electron as electron } from 'playwright-core';
import path from 'node:path';

const shot = (name: string) => path.resolve('proof', `e2e-${name}.png`);
const sample = process.env.E2E_SAMPLE ?? path.resolve('proof/model/default_voice.wav');

async function main() {
  const app = await electron.launch({ args: ['.'] });
  const page = await app.firstWindow();
  page.on('console', (m) => { if (m.type() === 'error') console.log('[console error]', m.text()); });
  page.on('pageerror', (e) => console.log('[page error]', e.message));
  await page.waitForSelector('.app, .center-screen .card');
  if (await page.locator('.center-screen .card').count()) throw new Error('Model is missing: the download screen is showing.');
  await page.screenshot({ path: shot('1-empty') });

  await page.click('.new-voice');
  await page.fill('.sheet input[placeholder="My voice"]', 'E2E test voice');
  const save = page.locator('.sheet button[type=submit]');
  console.log('save disabled before sample+consent:', await save.isDisabled());
  await page.setInputFiles('.sheet input[type=file]', sample);
  await page.waitForSelector('.sheet p.small:has-text("seconds"), .sheet .error');
  console.log('sample status:', await page.locator('.sheet .drop ~ p').allInnerTexts());
  console.log('save disabled before consent:', await save.isDisabled());
  await page.check('.sheet .check input');
  await page.screenshot({ path: shot('2-new-voice') });
  await save.click();
  await page.waitForSelector('.voices li.selected:has-text("E2E test voice")');

  const gen = page.locator('.composer button.primary');
  console.log('generate disabled with empty text:', await gen.isDisabled());
  await page.fill('.composer textarea', 'Hello there. This is my cloned voice.');
  await page.click('.pill:has-text("Excited")');
  console.log('sliders after Excited:', await page.locator('.slider output').allInnerTexts());
  const before = await page.locator('.history li').count();
  const t = Date.now();
  await gen.click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: shot('3-generating') });
  await page.waitForFunction((n) => document.querySelectorAll('.history li').length > n || !!document.querySelector('.composer .error'), before, { timeout: 600_000 });
  console.log(`generation finished in ${((Date.now() - t) / 1000).toFixed(0)}s`);
  console.log('error shown:', await page.locator('.composer .error').allInnerTexts());
  console.log('newest history row:', await page.locator('.history li').first().innerText());
  await page.screenshot({ path: shot('4-done') });

  // cancel path
  await page.fill('.composer textarea', 'This one gets cancelled before it finishes, so nothing should be added to the history list.');
  await gen.click();
  await page.waitForSelector('.composer button.primary:has-text("Cancel")');
  await page.waitForTimeout(3000);
  await page.click('.composer button.primary:has-text("Cancel")');
  await page.waitForSelector('.composer button.primary:has-text("Generate")', { timeout: 120_000 });
  console.log('rows after cancel (expect +1 total):', (await page.locator('.history li').count()) - before, '| error:', await page.locator('.composer .error').allInnerTexts());

  // clean up the test voice and its clip
  await page.locator('.history li').first().locator('button[aria-label=Delete]').click();
  await page.click('.voice-actions button:has-text("Delete")');
  await page.click('.card button.primary:has-text("Delete voice")');
  await page.waitForFunction(() => !document.querySelector('.voices li.selected')?.textContent?.includes('E2E test voice'));
  console.log('voices left named E2E:', await page.locator('.voices li:has-text("E2E test voice")').count());
  await app.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
