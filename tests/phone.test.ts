// Run with: npm test  (Node's built-in test runner; Node 22.18+ strips TS types)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalisePhone } from '../src/lib/phone.ts';

// Rule: strip spaces, dashes, brackets and dots. Then:
//   8 digits                      -> +65 + digits
//   10 digits starting with 65    -> + digits
//   starts with 00                -> replace 00 with +
//   starts with +                 -> keep (+65 must have exactly 8 digits after 65)
//   anything else                 -> null (caller shows an error; nothing is saved)
// Output is E.164 with no spaces, e.g. +6591234567.
export const cases: [input: string, expected: string | null][] = [
  // From the agreed rule table
  ['6512 3456', '+6565123456'],
  ['65123456', '+6565123456'],
  ['0065 9123 4567', '+6591234567'],
  ['+65 9123 4567', '+6591234567'],
  ['(9123) 4567', '+6591234567'],
  ['9123.4567', '+6591234567'],
  ['65 9123 4567', '+6591234567'],

  // Other valid Singapore formats
  ['91234567', '+6591234567'],
  ['9123-4567', '+6591234567'],
  ['  9123 4567  ', '+6591234567'],
  ['+6591234567', '+6591234567'],
  ['6123 4567', '+6561234567'],
  ['3123 4567', '+6531234567'],
  ['659123 4567', '+6591234567'],

  // Non-Singapore numbers keep their country code
  ['+44 20 7946 0958', '+442079460958'],
  ['0044 20 7946 0958', '+442079460958'],

  // Rejected: never guess
  ['', null],
  ['   ', null],
  ['9123456', null],          // 7 digits
  ['912345678', null],        // 9 digits
  ['1234567890', null],       // 10 digits, not starting with 65
  ['65 1234 567', null],      // 9 digits starting with 65
  ['+65 9123 456', null],     // +65 with 7 digits
  ['+65 9123 45678', null],   // +65 with 9 digits
  ['+1234567', null],         // too short for E.164
  ['9123 4567 ext 2', null],  // letters
  ['abc', null],
];

for (const [input, expected] of cases) {
  test(`normalisePhone(${JSON.stringify(input)}) -> ${expected}`, () => {
    assert.equal(normalisePhone(input), expected);
  });
}
