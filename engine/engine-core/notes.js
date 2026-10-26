// ENTRE VOCES engine-core — note-taking craft (Rozan, playable)
// Notes are memory triggers, not transcription. Scoring rewards idea units,
// links, and unmissable negation — the things that actually save a rendering.

export const NOTE_SYMBOLS = [
  { symbol: "→", name: "therefore / leads to", rozan: "links — the most important notes" },
  { symbol: "≠", name: "not / no (negation)", rozan: "negation must be unmissable" },
  { symbol: "↑", name: "increase / more", rozan: "emphasis & direction" },
  { symbol: "↓", name: "decrease / less", rozan: "emphasis & direction" },
  { symbol: "?", name: "uncertain / I think", rozan: "preserve hedges — never upgrade certainty" },
  { symbol: "!", name: "must / obligation", rozan: "modality is the message in legal/medical orders" },
  { symbol: "§", name: "condition / if", rozan: "links — conditions change duties" },
  { symbol: "“ ”", name: "exact words quoted", rozan: "mark verbatim where wording itself matters" },
];

/**
 * Score a learner's notes against the turn they support.
 * notesText: free jot (typed/dictated); pinnedKeywords: chips captured live.
 * Returns { score 0..1, captured[], missed[], hasLink, hasNegationMark, feedback }
 */
export function scoreNotes({ sourceText = "", notesText = "", pinnedKeywords = [], concept = null, targetLang = "es" } = {}) {
  const notes = (notesText + " " + pinnedKeywords.join(" ")).toLowerCase();
  const keywords = extractKeywords(sourceText, concept, targetLang);
  const captured = keywords.filter((k) => notes.includes(k.toLowerCase()));
  const missed = keywords.filter((k) => !notes.includes(k.toLowerCase()));
  const hasLink = /[→§]|therefore|because|but|if |so |entonces|porque|pero|si |因此|因为|但是|如果/.test(notes);
  const hasNegationMark = /≠|\bnot\b|\bno\b|\bnunca\b|\bsin\b|不|没|无/.test(notes);
  const sourceHasNegation = /\bnot\b|\bno\b|never|n't|ningún|sin |不|没|无/.test(sourceText.toLowerCase());
  let score = keywords.length ? captured.length / keywords.length : 0.6;
  if (hasLink) score = Math.min(1, score + 0.1);
  if (sourceHasNegation && hasNegationMark) score = Math.min(1, score + 0.1);
  if (sourceHasNegation && !hasNegationMark && keywords.length) score = Math.max(0, score - 0.15);
  const feedback = [];
  if (missed.length) feedback.push(`Notes missed: ${missed.slice(0, 4).join(", ")} — names and numbers go first under load; abbreviate them the second you hear them.`);
  if (!hasLink) feedback.push("No link symbols (→, §, but/because). Links are the skeleton Rozan tells you to never skip — facts without links become a list you cannot rebuild.");
  if (sourceHasNegation && !hasNegationMark) feedback.push("The turn contained a negation with no ≠ in your notes. Circle negations — a dropped 'not' reverses the medicine and the verdict.");
  if (!feedback.length) feedback.push("Notes carry the idea units and their links. That is exactly what notes are for — now trust them and let the source go.");
  return { score: Math.round(score * 100) / 100, captured, missed, hasLink, hasNegationMark, feedback };
}

/** Salient items a professional jots first: numbers, negations, key terms, names/dates. */
export function extractKeywords(sourceText = "", concept = null, targetLang = "es") {
  const out = new Set();
  (sourceText.match(/\d+(?:[.,]\d+)?%?/g) || []).forEach((n) => out.add(n));
  (sourceText.match(/\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|yesterday|today|tonight)\b/gi) || []).forEach((n) => out.add(n));
  if (concept?.terms?.en?.term) out.add(concept.terms.en.term);
  if (concept?.terms?.[targetLang]?.term) out.add(concept.terms[targetLang].term);
  if (concept?.terms?.es?.term) out.add(concept.terms.es.term);
  // hedges that must survive (certainty is content)
  (sourceText.match(/\b(?:most likely|cannot rule out|generally|maybe|i think|not sure|rarely|uncommonly)\b/gi) || []).forEach((n) => out.add(n.toLowerCase()));
  return [...out].slice(0, 8);
}
