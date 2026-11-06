// Deterministic checks around the model call; no API key needed.

// Control and invisible characters, which could hide an instruction from readers and the patterns below.
const INVISIBLE = /[\p{Cc}\p{Cf}]/gu;
const KEEP = new Set(['\n', '\t']);

export const RESUME_TAG = 'resume_text';

export function cleanResume(text: string) {
  return text
    .normalize('NFKC')
    .replace(INVISIBLE, (c) => (KEEP.has(c) ? c : ''))
    // The document must not be able to close its own delimiter and write outside it.
    .replace(new RegExp(`</?\\s*${RESUME_TAG}[^>]*>`, 'gi'), '')
    .trim();
}

const MIN_CHARS = 40;
const MIN_LETTER_RATIO = 0.5;

// Skips the model for unusable text; \p{L} so non-Latin resumes pass.
export function unusableReason(text: string): string | null {
  if (!text) return 'No resume text on file.';
  if (text.length < MIN_CHARS) return 'Resume text is too short to summarise.';
  const letters = text.match(/\p{L}/gu)?.length ?? 0;
  const nonSpace = text.replace(/\s/g, '').length;
  if (letters / nonSpace < MIN_LETTER_RATIO) return 'Resume text looks garbled or corrupted.';
  return null;
}

const INJECTION_PATTERNS = [
  /\b(ignore|disregard|forget|override)\b.{0,40}\b(instructions?|prompts?|rules|guidelines|context)\b/i,
  /\b(system|developer)\s+(prompt|message|instructions?)\b/i,
  /\byou\s+are\s+(now\s+)?(an?\s+)?(ai|assistant|language\s+model|chatbot|llm)\b/i,
  /\b(as|dear|attention|note\s+to)\s+(an?\s+|the\s+)?(ai|llm|language\s+model|assistant|chatbot|screener)\b/i,
  /\b(rate|rank|score|mark|recommend|hire|shortlist|advance)\b.{0,40}\b(this|the)\s+(candidate|applicant)\b/i,
];

// A warning for the recruiter, not the defence: it fires even if the model was fooled.
export function looksLikeInjection(text: string) {
  return INJECTION_PATTERNS.some((p) => p.test(text));
}

// Skills are requested verbatim, so one missing from the text was invented or planted.
export function groundedSkills(skills: string[], text: string) {
  const haystack = text.toLowerCase();
  return skills.filter((s) => haystack.includes(s.trim().toLowerCase()));
}
