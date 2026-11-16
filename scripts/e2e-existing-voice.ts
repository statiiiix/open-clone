// Generates one sentence with a voice that already exists in the app (default: the first one),
// e.g. a voice saved by an older version that has no transcript yet.
// Run: E2E_APP=<path to app binary> E2E_VOICE=<name> npx tsx scripts/e2e-existing-voice.ts
import { _electron as electron } from 'playwright-core';

const TEXT = process.env.E2E_TEXT ?? 'The weather is lovely today, so I am going for a long walk by the river.';

async function main() {
  const app = await electron.launch(process.env.E2E_APP ? { executablePath: process.env.E2E_APP } : { args: ['.'] });
  const page = await app.firstWindow();
  page.on('pageerror', (e) => console.log('[page error]', e.message));
  await page.waitForSelector('.app');
  const name = process.env.E2E_VOICE;
  if (name) await page.click(`.voices li button.voice:has-text("${name}")`);
  console.log('voice:', await page.locator('.voices li.selected button.voice').innerText(), '| note:', await page.locator('.voices li.selected .voice-note').allInnerTexts());
  await page.fill('.composer textarea', TEXT);
  if (process.env.E2E_EXPRESSION) await page.click(`.pill:has-text("${process.env.E2E_EXPRESSION}")`);
  const before = await page.locator('.history li').count();
  const t = Date.now();
  await page.click('.composer button.primary');
  await page.waitForFunction((n) => document.querySelectorAll('.history li').length > n || !!document.querySelector('.composer .error'), before, { timeout: 1_800_000 });
  console.log(`finished in ${((Date.now() - t) / 1000).toFixed(0)}s | error:`, await page.locator('.composer .error').allInnerTexts());
  console.log('newest row:', (await page.locator('.history li').first().innerText()).replace(/\n/g, ' | '));
  await app.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
