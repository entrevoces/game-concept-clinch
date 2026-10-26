// ENTRE VOCES engine-core — spoken assessment helpers (spec §8)
// Deliberately conservative: classifies evidence, never emits a single "fluency score".

const NEGATIONS = ["no", "not", "never", "n't", "ningún", "ninguna", "sin", "不", "没", "无"];
const STRONG_MODALS = ["must", "shall", "required", "have to", "has to", "debe", "deberá", "deben", "obligado", "必须", "须"];
const WEAK_MODALS = ["may", "might", "could", "can", "puede", "podría", "pueden", "可能", "可以"];
const HEDGES = ["probably", "possibly", "maybe", "perhaps", "likely", "appears", "seems", "probablemente", "posiblemente", "tal vez", "quizás", "可能", "似乎"];
const NUM_RE = /\d+(?:[.,]\d+)?/g;

function norm(s) { return (s || "").toLowerCase().replace(/\s+/g, " ").trim(); }
function tokens(s) { return norm(s).split(/[^a-z0-9áéíóúñü\u4e00-\u9fff]+/).filter(Boolean); }

/**
 * Assess an interpretation attempt against the concepts it had to preserve.
 * Input: sourceText (what was said), learnerText (interpretation/transcript),
 *        concept (engine Concept), transcriptConfidence 0..1
 * Output: { verdict, preserved[], omitted[], changed[], added[], acceptableVariation,
 *           consequential: bool, uncertainty 0..1, explanation }
 * verdict: faithful | acceptable-variation | omission | distortion | uncertain
 */
export function assessInterpretation({ sourceText = "", learnerText = "", concept = null, transcriptConfidence = 1, targetLang = "es" } = {}) {
  const src = norm(sourceText), out = norm(learnerText);
  const outTokens = new Set(tokens(learnerText));
  const expectedTerms = [];
  if (concept) {
    const t = concept.terms?.[targetLang];
    if (t?.term) expectedTerms.push(t.term.toLowerCase());
    (t?.alternatives || []).forEach((a) => expectedTerms.push(a.toLowerCase()));
    if (concept.terms?.en?.term) expectedTerms.push(concept.terms.en.term.toLowerCase());
  }
  const preserved = [], omitted = [];
  for (const term of [...new Set(expectedTerms)]) {
    (term.split(/\s+/).every((w) => outTokens.has(w)) || out.includes(term) ? preserved : omitted).push(term);
  }

  const changed = [];
  let consequential = false;
  const srcNeg = NEGATIONS.some((n) => src.includes(n));
  const outNeg = NEGATIONS.some((n) => out.includes(n));
  if (srcNeg !== outNeg && (src || out)) { changed.push("negation flipped (yes/no or not)"); consequential = true; }
  const srcNums = (sourceText.match(NUM_RE) || []).sort();
  const outNums = (learnerText.match(NUM_RE) || []).sort();
  if (srcNums.join(",") !== outNums.join(",") && (srcNums.length || outNums.length)) { changed.push(`numbers differ (source: ${srcNums.join(", ") || "none"} → interpretation: ${outNums.join(", ") || "none"})`); consequential = true; }
  // Modality: "must/shall" becoming "may" (or vanishing) changes obligations —
  // the classic professional distortion fidelity checks used to miss.
  const hasAny = (list, s) => list.some((w) => s.includes(w));
  if (hasAny(STRONG_MODALS, src) && !hasAny(STRONG_MODALS, out)) { changed.push(hasAny(WEAK_MODALS, out) ? "obligation weakened (must/shall rendered as may/could)" : "obligation dropped (must/shall not carried across)"); consequential = true; }
  else if (!hasAny(STRONG_MODALS, src) && hasAny(WEAK_MODALS, src) && hasAny(STRONG_MODALS, out)) { changed.push("permission upgraded to obligation (may rendered as must)"); consequential = true; }
  // Hedging: dropping "probably/maybe" makes the speaker sound certain they were not.
  if (hasAny(HEDGES, src) && !hasAny(HEDGES, out)) changed.push("uncertainty dropped (hedge removed — speaker sounds more certain than they were)");

  const added = [];
  const srcTokens = new Set(tokens(sourceText));
  const unsupportedNums = outNums.filter((n) => !srcNums.includes(n));
  unsupportedNums.forEach((n) => added.push(`number "${n}" was not in the source`));

  const uncertainTranscription = transcriptConfidence < 0.65;
  let uncertainty = Math.max(0, Math.min(1, (1 - transcriptConfidence) * 0.7 + (omitted.length && preserved.length ? 0.15 : 0)));

  let verdict, explanation;
  if (uncertainTranscription && omitted.length) {
    verdict = "uncertain";
    explanation = "Transcription confidence is low, so missing terms may be a recognition error rather than a learner error. Inspect or dispute the transcript, or try the diagnostic vocabulary check.";
    uncertainty = Math.max(uncertainty, 0.6);
  } else if (changed.length) {
    verdict = "distortion";
    explanation = `Meaning changed: ${changed.join("; ")}.${consequential ? " In a professional setting this is consequential — it alters what the other party hears." : ""}`;
  } else if (omitted.length && preserved.length === 0 && expectedTerms.length) {
    verdict = "omission";
    explanation = `Key terminology was omitted (${omitted.join(", ")}). The overall message may have arrived, but the professional distinction did not.`;
  } else if (omitted.length) {
    verdict = "omission";
    explanation = `Mostly preserved, but omitted: ${omitted.join(", ")}.`;
  } else if (added.length) {
    verdict = "acceptable-variation";
    explanation = "Core meaning preserved. Wording differs from the source, which is expected in interpreting — only the added detail above was not in the source.";
  } else {
    verdict = preserved.length ? "faithful" : "acceptable-variation";
    explanation = preserved.length
      ? "Meaning and key terminology preserved. Different wording with the same meaning counts as faithful interpreting."
      : "No key-term mismatch detected. Treated as acceptable variation — interpreting preserves meaning, not wording.";
  }

  return {
    verdict, preserved, omitted, changed, added,
    acceptableVariation: verdict === "acceptable-variation" || verdict === "faithful",
    consequential, uncertainty,
    correct: verdict === "faithful" || verdict === "acceptable-variation",
    score: verdict === "faithful" ? 1 : verdict === "acceptable-variation" ? 0.85 : verdict === "uncertain" ? 0.5 : verdict === "omission" ? 0.35 : 0.1,
    explanation,
    transcriptConfidence,
  };
}

/**
 * Given a spoken error, return competing hypotheses (spec §6.4) — never one diagnosis.
 */
export function spokenErrorHypotheses({ concept = null, stageOfFailure = 8, transcriptConfidence = 1 } = {}) {
  const h = [
    { cause: "conceptual-gap", label: "The underlying concept is not yet understood", test: "Conceptual question about the term (stage 3)", weight: stageOfFailure >= 3 ? 0.2 : 0.5 },
    { cause: "recall-failure", label: "The equivalent is known but was not recalled", test: "Bilingual retrieval without time pressure (stage 2)", weight: 0.25 },
    { cause: "spoken-recognition", label: "The term was not recognized when heard", test: "Listening recognition (stage 1, audio)", weight: 0.2 },
    { cause: "memory-overload", label: "Working memory was overloaded by turn length", test: "Same content in a shorter turn (stage 6)", weight: stageOfFailure === 8 ? 0.3 : 0.1 },
    { cause: "production", label: "Understood, but could not produce it fluently", test: "Spoken production without interpreting load (stage 7)", weight: 0.15 },
  ];
  if (transcriptConfidence < 0.65) h.unshift({ cause: "transcription-error", label: "Speech recognition may have misheard the learner", test: "Typed retry or transcript dispute", weight: 0.6 });
  return h.sort((a, b) => b.weight - a.weight);
}
