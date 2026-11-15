import { expect, it } from 'vitest';
import { PRESETS } from '../../src/shared/presets';

it('has the six expressions in order', () => {
  expect(Object.keys(PRESETS)).toEqual(['neutral', 'happy', 'sad', 'excited', 'angry', 'calm']);
});
it('neutral has no tone instruction and every other expression has one', () => {
  expect(PRESETS.neutral.instruction).toBeNull();
  for (const [id, p] of Object.entries(PRESETS)) if (id !== 'neutral') expect(p.instruction).toMatch(/tone$/);
});
