// The app always shows anaesthetists and surgeons as "Dr {name}", so a title
// typed into the name would read "Dr Dr Tan". Strip a leading "Dr" or "Dr."
// only as a whole word (any case, repeated), so "Drew Lim" and "Dražen" are
// untouched. No imports, so tests/names.test.ts can run it directly under Node.
export function stripDoctorTitle(name: string): string {
  let s = name.trim();
  let m: RegExpExecArray | null;
  while ((m = /^dr(?:\.\s*|\s+)/i.exec(s))) s = s.slice(m[0].length).trimStart();
  return s;
}
