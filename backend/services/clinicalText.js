/**
 * backend/services/clinicalText.js
 *
 * Shared text utilities for clinical symptom matching.
 *
 * The important thing here is negation. The previous red-flag guard matched
 * keywords with a word-boundary regex and nothing else, so a transcript in
 * which the ASHA worker carefully *ruled out* every danger sign —
 *
 *     "no vaginal bleeding, no convulsions, denies difficulty breathing"
 *
 * — produced three severe red flags, forced requires_doctor_referral, and
 * pinned the patient at risk_level 'alert' with a score of 10.0 for a week.
 * In the field that is alert fatigue, and alert fatigue is how the real
 * emergency gets missed.
 *
 * Negation is handled in both directions because English and Hindi place the
 * negator on opposite sides of the thing being negated:
 *
 *     English   "no bleeding"          → cue BEFORE the match
 *     Hindi     "खून नहीं बह रहा"       → cue AFTER the match
 *     Hinglish  "bleeding nahi hai"    → cue AFTER the match
 */

// Negation cues that appear BEFORE the symptom (English word order).
const PRE_NEGATION_CUES = [
  'no', 'not', 'none', 'never', 'without', 'denies', 'denied', 'deny',
  'negative', 'absent', 'ruled', 'excludes', 'excluded', 'free',
  'nil', 'zero', 'lacks', 'lacking', 'apart', 'besides',
  'koi', 'bina', 'binaa'
];

// Negation cues that appear AFTER the symptom (Hindi / Hinglish word order).
const POST_NEGATION_CUES = [
  'nahi', 'nahin', 'nai', 'naa', 'na',
  'नहीं', 'नही', 'ना', 'न', 'बिना', 'नहि'
];

// Cues that may appear on either side.
const BIDIRECTIONAL_CUES = ['कोई', 'बिल्कुल'];

// Words that close a negation scope: "no bleeding but severe headache"
// must not mark the headache as negated.
const SCOPE_BREAKERS = [
  'but', 'however', 'though', 'although', 'except', 'apart', 'still',
  'yet', 'while', 'whereas', 'unfortunately',
  'लेकिन', 'परंतु', 'मगर', 'पर', 'किंतु', 'फिर'
];

/**
 * Improvement words. When one of these sits between the symptom and a
 * negator, the negation attaches to the improvement, not to the symptom:
 *
 *   "सिरदर्द ठीक नहीं हो रहा"   the headache is NOT GETTING BETTER — present
 *   "headache is not improving"  present, not absent
 *   "सिरदर्द नहीं है"            no headache — genuinely absent
 *
 * Without this, a symptom the mother is actively complaining about is read
 * as ruled out, which is the most dangerous direction to get wrong.
 */
const IMPROVEMENT_WORDS = [
  'better', 'improving', 'improved', 'improve', 'resolving', 'resolved',
  'gone', 'going', 'settling', 'subsiding', 'easing', 'fine', 'ok', 'okay',
  'ठीक', 'कम', 'बेहतर', 'आराम', 'सही'
];

// Words that carry a negation scope forward across a list:
// "no bleeding or convulsions" — the "or" keeps the "no" in force.
const SCOPE_CONTINUERS = ['or', 'and', 'nor', 'ya', 'aur', 'और', 'या'];

const PRE_WINDOW = 4;   // tokens to look back
const POST_WINDOW = 3;  // tokens to look ahead

/**
 * Splits text into tokens with their character offsets, treating any
 * non-letter/non-digit character as a separator. Works for Latin and
 * Devanagari alike (\w is ASCII-only in JS regex, so it is avoided here).
 */
function tokenize(text) {
  const tokens = [];
  const re = /[^\s.,;:!?()[\]{}"'`।॥\-–—/\\]+/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    tokens.push({ value: m[0].toLowerCase(), start: m.index, end: m.index + m[0].length });
  }
  return tokens;
}

function isPreCue(token) {
  return PRE_NEGATION_CUES.includes(token) || BIDIRECTIONAL_CUES.includes(token);
}

function isPostCue(token) {
  return POST_NEGATION_CUES.includes(token) || BIDIRECTIONAL_CUES.includes(token);
}

/**
 * Decides whether the span [matchStart, matchEnd) in `text` sits inside a
 * negation scope.
 *
 * @param {string} text
 * @param {number} matchStart - character index where the keyword begins
 * @param {number} matchEnd   - character index just past the keyword
 * @returns {boolean} true when the symptom is being denied, not reported
 */
export function isNegated(text, matchStart, matchEnd) {
  const tokens = tokenize(text);
  if (tokens.length === 0) return false;

  // Locate the token range covered by the match.
  let firstIdx = tokens.findIndex((t) => t.end > matchStart);
  if (firstIdx === -1) return false;
  let lastIdx = firstIdx;
  while (lastIdx + 1 < tokens.length && tokens[lastIdx + 1].start < matchEnd) {
    lastIdx += 1;
  }

  // ── Look backwards for an English-style negator ──
  let budget = PRE_WINDOW;
  for (let i = firstIdx - 1; i >= 0 && budget > 0; i -= 1) {
    const tok = tokens[i].value;

    if (SCOPE_BREAKERS.includes(tok)) break;

    if (isPreCue(tok)) return true;

    // "ruled out", "free of" — the cue is two tokens back.
    if (tok === 'out' && i > 0 && ['ruled', 'ruling'].includes(tokens[i - 1].value)) return true;

    // A list continuer does not consume budget: "no bleeding or convulsions"
    // keeps the negation alive across an arbitrary-length list.
    if (SCOPE_CONTINUERS.includes(tok)) continue;

    budget -= 1;
  }

  // ── Look forwards for a Hindi / Hinglish negator ──
  budget = POST_WINDOW;
  for (let i = lastIdx + 1; i < tokens.length && budget > 0; i += 1) {
    const tok = tokens[i].value;

    if (SCOPE_BREAKERS.includes(tok)) break;

    // "सिरदर्द ठीक नहीं हो रहा" — the negation belongs to "ठीक" (better),
    // so the headache is present, not absent. Stop scanning.
    if (IMPROVEMENT_WORDS.includes(tok)) break;

    if (isPostCue(tok)) return true;

    budget -= 1;
  }

  return false;
}

/**
 * Builds a matcher for one keyword phrase.
 *
 * \b is ASCII-only in JavaScript and fails on Devanagari, and (?<!\S)/(?!\S)
 * breaks when a Hindi phrase is followed by the danda (।). Treating any
 * non-letter/non-digit as a boundary is correct for both scripts.
 */
export function buildKeywordPattern(keyword) {
  const escaped = keyword.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'giu');
}

/**
 * Finds every affirmed (non-negated) occurrence of `keyword` in `text`.
 *
 * @returns {Array<{ start: number, end: number, matched: string }>}
 */
export function findAffirmedMatches(text, keyword) {
  const pattern = buildKeywordPattern(keyword);
  const hits = [];
  let m;
  while ((m = pattern.exec(text)) !== null) {
    if (!isNegated(text, m.index, m.index + m[0].length)) {
      hits.push({ start: m.index, end: m.index + m[0].length, matched: m[0] });
    }
    if (m.index === pattern.lastIndex) pattern.lastIndex += 1; // zero-length guard
  }
  return hits;
}

/**
 * True when `keyword` appears in `text` at least once without being negated.
 */
export function mentionsAffirmed(text, keyword) {
  return findAffirmedMatches(text, keyword).length > 0;
}

/**
 * Extracts a short quote around a character offset, for showing the ASHA
 * worker the words that triggered a flag rather than an opaque label.
 */
export function quoteAround(text, start, end, radius = 60) {
  const from = Math.max(0, start - radius);
  const to = Math.min(text.length, end + radius);
  const prefix = from > 0 ? '…' : '';
  const suffix = to < text.length ? '…' : '';
  return `${prefix}${text.slice(from, to).trim()}${suffix}`;
}
