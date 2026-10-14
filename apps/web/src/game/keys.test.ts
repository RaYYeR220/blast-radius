import { describe, expect, it } from 'vitest';
import { typing } from './keys';

describe('typing', () => {
  it('is true in text fields, so shortcuts never eat a name', () => {
    expect(typing({ tagName: 'INPUT', type: 'text' } as unknown as EventTarget)).toBe(true);
    expect(typing({ tagName: 'TEXTAREA' } as unknown as EventTarget)).toBe(true);
    expect(typing({ tagName: 'DIV', isContentEditable: true } as unknown as EventTarget)).toBe(true);
  });

  it('is false on a slider or a button, so the replay keys keep working after a scrub', () => {
    expect(typing({ tagName: 'INPUT', type: 'range' } as unknown as EventTarget)).toBe(false);
    expect(typing({ tagName: 'BUTTON', type: 'submit' } as unknown as EventTarget)).toBe(false);
    expect(typing(null)).toBe(false);
  });
});
