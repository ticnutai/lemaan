// Cloze deletion parsing for flashcards.
// Syntax: {{c1::answer text}} or {{c1::answer::hint}}
// Multiple cloze numbers can appear; the prompt hides cloze N while showing others.

export interface ClozePart {
  kind: "text" | "cloze";
  text: string;       // raw text (for "text") or answer (for "cloze")
  index?: number;     // cloze number (1-based)
  hint?: string;
}

const CLOZE_RE = /\{\{c(\d+)::([\s\S]+?)(?:::([\s\S]+?))?\}\}/g;

export function parseCloze(input: string): ClozePart[] {
  if (!input.includes("{{c")) return [{ kind: "text", text: input }];
  const parts: ClozePart[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  CLOZE_RE.lastIndex = 0;
  while ((m = CLOZE_RE.exec(input))) {
    if (m.index > last) parts.push({ kind: "text", text: input.slice(last, m.index) });
    parts.push({
      kind: "cloze",
      text: m[2],
      index: parseInt(m[1], 10),
      hint: m[3],
    });
    last = m.index + m[0].length;
  }
  if (last < input.length) parts.push({ kind: "text", text: input.slice(last) });
  return parts;
}

export function hasCloze(input: string): boolean {
  return /\{\{c\d+::/.test(input);
}

export function clozeIndices(input: string): number[] {
  const set = new Set<number>();
  let m: RegExpExecArray | null;
  const re = /\{\{c(\d+)::/g;
  while ((m = re.exec(input))) set.add(parseInt(m[1], 10));
  return [...set].sort((a, b) => a - b);
}

// Render cloze parts: hide cloze with given index (replace with placeholder),
// show all other cloze answers as plain text. When `revealAll` is true, show all.
export function renderCloze(
  parts: ClozePart[],
  hiddenIndex: number,
  revealAll = false,
): string {
  return parts
    .map((p) => {
      if (p.kind === "text") return p.text;
      if (revealAll) return p.text;
      if (p.index === hiddenIndex) return p.hint ? `[…${p.hint}]` : "[…]";
      return p.text;
    })
    .join("");
}
