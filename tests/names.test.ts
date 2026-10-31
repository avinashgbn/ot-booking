// Run with: npm test  (Node's built-in test runner; Node 22.18+ strips TS types)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripDoctorTitle } from '../src/lib/names.ts';

const cases: [input: string, expected: string][] = [
  // Title removed
  ['Dr Tan', 'Tan'],
  ['Dr. Tan', 'Tan'],
  ['Dr.Tan', 'Tan'],
  ['DR TAN', 'TAN'],
  ['dr. tan wei ming', 'tan wei ming'],
  ['Dr Dr Tan', 'Tan'],
  ['  Dr   Tan  ', 'Tan'],
  ['Dr.', ''],

  // Names that only start with the letters "Dr" are untouched
  ['Drew Lim', 'Drew Lim'],
  ['Dražen', 'Dražen'],
  ['Drummond Lee', 'Drummond Lee'],
  ['DREW', 'DREW'],

  // Only a leading title is removed
  ['Tan Dr', 'Tan Dr'],
  ['Andrew Tan', 'Andrew Tan'],
  ['Tan', 'Tan'],
  ['  Tan  ', 'Tan'],
];

for (const [input, expected] of cases) {
  test(`stripDoctorTitle(${JSON.stringify(input)}) -> ${JSON.stringify(expected)}`, () => {
    assert.equal(stripDoctorTitle(input), expected);
  });
}
