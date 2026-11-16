// Drives the built app end to end: new voice from a file, generate, save state, delete.
// Run: npm run build && npx tsx scripts/e2e-smoke.ts
// On an Intel Mac this takes around 20 minutes: each sentence takes several minutes to generate.
import { _electron as electron } from 'playwright-core';
import path from 'node:path';

const shot = (name: string) => path.resolve('proof', `e2e-${name}.png`);
const sample = process.env.E2E_SAMPLE ?? path.resolve('proof/sample-varied-66s.wav');

async function main() {
  const app = await electron.launch(process.env.E2E_APP ? { executablePath: process.env.E2E_APP } : { args: ['.'] });
  const page = await app.firstWindow();
  page.on('console', (m) => { if (m.type() === 'error') console.log('[console error]', m.text()); });
  page.on('pageerror', (e) => console.log('[page error]', e.message));
  await page.waitForSelector('.app, .center-screen .card');
  if (await page.locator('.center-screen .card').count()) {
    console.log('download screen:', (await page.locator('.center-screen .card p').first().innerText()).slice(0, 90));
    await page.screenshot({ path: shot('0-download') });
    await page.click('.center-screen button.primary');
    await page.waitForSelector('.app', { timeout: 1_800_000 });
    console.log('model download finished, main screen shown');
  }
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
  await page.waitForTimeout(1000);
  console.log('while saving:', await save.innerText());
  const tSave = Date.now();
  await page.waitForSelector('.voices li.selected:has-text("E2E test voice"), .sheet .error', { timeout: 600_000 });
  console.log(`voice saved and transcribed in ${((Date.now() - tSave) / 1000).toFixed(0)}s | error:`, await page.locator('.sheet .error').allInnerTexts());
  console.log('speed notice:', await page.locator('.composer p.muted.small').allInnerTexts());
  console.log('sliders on screen (expect 0):', await page.locator('.slider, input[type=range]').count());

  const gen = page.locator('.composer button.primary');
  console.log('generate disabled with empty text:', await gen.isDisabled());
  await page.fill('.composer textarea', 'Hello there, this is my cloned voice.');
  await page.click('.pill:has-text("Excited")');
  const before = await page.locator('.history li').count();
  const t = Date.now();
  await gen.click();
  await page.waitForTimeout(20_000);
  console.log('while generating:', await page.locator('.composer .row span.muted').innerText());
  await page.screenshot({ path: shot('3-generating') });
  await page.waitForFunction((n) => document.querySelectorAll('.history li').length > n || !!document.querySelector('.composer .error'), before, { timeout: 1_800_000 });
  console.log(`generation finished in ${((Date.now() - t) / 1000).toFixed(0)}s`);
  console.log('error shown:', await page.locator('.composer .error').allInnerTexts());
  console.log('newest history row:', await page.locator('.history li').first().innerText());
  await page.screenshot({ path: shot('4-done') });

  // cancel path
  await page.fill('.composer textarea', 'This one gets cancelled before it finishes, so nothing should be added to the history list.');
  await gen.click();
  await page.waitForSelector('.composer button.primary:has-text("Cancel")');
  await page.waitForTimeout(15_000);
  const tCancel = Date.now();
  await page.click('.composer button.primary:has-text("Cancel")');
  await page.waitForSelector('.composer button.primary:has-text("Generate")', { timeout: 30_000 });
  console.log(`cancel took ${((Date.now() - tCancel) / 1000).toFixed(1)}s | rows after cancel (expect +1 total):`, (await page.locator('.history li').count()) - before, '| error:', await page.locator('.composer .error').allInnerTexts());

  // the engine must work again after a cancel
  await page.fill('.composer textarea', 'Still working.');
  await page.click('.pill:has-text("Neutral")');
  const t2 = Date.now();
  await gen.click();
  await page.waitForFunction((n) => document.querySelectorAll('.history li').length > n || !!document.querySelector('.composer .error'), before + 1, { timeout: 1_800_000 });
  console.log(`generation after cancel finished in ${((Date.now() - t2) / 1000).toFixed(0)}s | rows (expect +2 total):`, (await page.locator('.history li').count()) - before, '| error:', await page.locator('.composer .error').allInnerTexts());
  if (process.env.E2E_KEEP) { await app.close(); return; }

  // clean up the test voice and its clip
  await page.locator('.history li').first().locator('button[aria-label=Delete]').click();
  await page.locator('.history li').first().locator('button[aria-label=Delete]').click();
  await page.click('.voice-actions button:has-text("Delete")');
  await page.click('.card button.primary:has-text("Delete voice")');
  await page.waitForFunction(() => !document.querySelector('.voices li.selected')?.textContent?.includes('E2E test voice'));
  console.log('voices left named E2E:', await page.locator('.voices li:has-text("E2E test voice")').count());
  await app.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
