import { expect, it } from 'vitest';
import { SIM_VERSION } from '../src/index';

it('exposes the sim version', () => {
  expect(SIM_VERSION).toBe(1);
});
