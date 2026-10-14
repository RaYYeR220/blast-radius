import { describe, expect, it } from 'vitest';
import { cleanName } from '../src/names';

describe('cleanName', () => {
  it('keeps simple handles', () => {
    expect(cleanName('neo_42', 'abcd')).toBe('neo_42');
  });
  it('collapses whitespace and strips what it cannot show', () => {
    expect(cleanName('  ada   lovelace 🚀 ', 'abcd')).toBe('ada lovelace');
  });
  it('caps the length at 16', () => {
    expect(cleanName('x'.repeat(40), 'abcd')).toBe('x'.repeat(16));
  });
  it('falls back to an anonymous tag when too short or empty', () => {
    expect(cleanName('', 'abcd')).toBe('anon-abcd');
    expect(cleanName('🚀🚀', 'abcd')).toBe('anon-abcd');
    expect(cleanName('ab', 'abcd')).toBe('anon-abcd');
  });
  it('refuses blocked words', () => {
    expect(cleanName('Nazi99', 'abcd')).toBe('anon-abcd');
  });
  it('accepts non-string input without throwing', () => {
    expect(cleanName(undefined as unknown as string, 'zz12')).toBe('anon-zz12');
  });
});
