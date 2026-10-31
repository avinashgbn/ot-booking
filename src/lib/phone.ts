// Normalise a phone number to E.164 (e.g. +6591234567), or return null if it
// can't be read safely — callers show an error rather than save a guess.
// No imports, so tests/phone.test.ts can run it directly under Node.
//
// Strip spaces, dashes, brackets and dots, then:
//   8 digits                    -> +65 + digits
//   10 digits starting with 65  -> + digits (the only case a leading 65 is a country code)
//   starts with 00              -> + (international prefix)
//   starts with +               -> as entered; +65 must have exactly 8 digits after it
export function normalisePhone(input: string): string | null {
  const s = input.replace(/[\s\-().]/g, '');
  let e164: string;

  if (s.startsWith('+')) e164 = s;
  else if (s.startsWith('00')) e164 = '+' + s.slice(2);
  else if (/^\d{8}$/.test(s)) e164 = '+65' + s;
  else if (/^65\d{8}$/.test(s)) e164 = '+' + s;
  else return null;

  if (!/^\+[1-9]\d{7,14}$/.test(e164)) return null;
  if (e164.startsWith('+65') && e164.length !== 11) return null;
  return e164;
}

export const INVALID_PHONE_MESSAGE = 'Enter an 8-digit Singapore number, or a full number starting with +';
