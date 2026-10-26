// ENTRE VOCES engine-core — adaptive selector (spec §6)
// Explainable rules, no opaque scores. Same function on server and offline client.
import { STAGE_COMPETENCES } from "./learner.js";

const STAGE_ACTIVITY = {
  1: "terminology", 2: "bilingual", 3: "conceptual", 4: "conceptual",
  5: "contextual-usage", 6: "retrieval", 7: "spoken-production", 8: "interpretation",
};
const STAGE_GAME_HINT = { 1: "concept-clinch", 2: "concept-clinch", 3: "concept-clinch", 4: "concept-clinch", 5: "the-table", 6: "term-rush", 7: "echo-sequence", 8: "shift-consecutive" };

/**
 * Recommend the next learning step.
 * Priority: (diagnostic if competing causes) > critical-area gaps > recurring
 * misconceptions > due-for-review > weakest weighted competence > new material.
 */
export function recommendNext({ domain, concepts = [], learnerState, excludeGameId = null }) {
  if (!domain || !concepts.length) {
    return { conceptId: null, areaId: null, stage: 1, activityType: "terminology", suggestedGameId: null, rationale: "No concepts are available for this domain yet — seed knowledge in the Console.", alternatives: [], needsDiagnostic: false, diagnosticPlan: null };
  }
  const areaById = new Map(domain.translationAreas.map((a) => [a.areaId, a]));
  const weights = domain.competencyWeights || {};

  // Areas whose prerequisites have no evidence yet: their concepts are
  // deprioritised (not hidden) so learners meet foundations before dependents.
  const areaHasEvidence = (areaId) => concepts.filter((c) => c.areaIds.includes(areaId))
    .some((c) => { const v = learnerState?.stages?.[c.conceptId]; return v && Object.values(v).some((cell) => cell.evidenceCount > 0); });
  const candidates = [];
  for (const c of concepts) {
    const vec = learnerState?.stages?.[c.conceptId];
    for (let stage = 1; stage <= 8; stage++) {
      const cell = vec?.[stage] || { estimate: 0, evidenceCount: 0, confidence: 0, retention: 1 };
      const area = areaById.get(c.areaIds[0]);
      const riskBoost = area?.riskIfMistranslated === "critical" ? 0.35 : area?.riskIfMistranslated === "high" ? 0.2 : 0;
      const unseenBoost = cell.evidenceCount === 0 ? 0.15 : 0;
      // Forgetting pull: a once-known cell whose predicted recall decayed is a
      // stronger need than its raw estimate suggests.
      const forgettingPull = cell.evidenceCount ? (1 - (cell.retention ?? 1)) * 0.45 : 0;
      // Weighted-competence pull: stages evidencing weak, domain-weighted
      // competences rank higher (domain.competencyWeights finally honoured).
      let competencePull = 0;
      for (const k of STAGE_COMPETENCES[stage] || []) {
        const comp = learnerState?.competences?.[k];
        if (comp) competencePull += (weights[k] ?? 0.5) * (1 - comp.estimate) * 0.12;
      }
      const prereqPenalty = (area?.prerequisiteAreaIds || []).some((pid) => !areaHasEvidence(pid)) ? 0.3 : 0;
      const gap = (1 - cell.estimate) + riskBoost + unseenBoost + forgettingPull + competencePull - prereqPenalty;
      candidates.push({ concept: c, stage, cell, area, gap });
    }
  }
  candidates.sort((a, b) => b.gap - a.gap);

  // Competing-cause diagnostic: same concept failed at different stages recently,
  // or a misconception repeats — gather discriminating evidence instead of guessing.
  const counts = learnerState?.misconceptionCounts || {};
  const repeatedTag = Object.entries(counts).find(([, n]) => n >= 2);
  const recent = learnerState?.recentErrors || [];
  const sameConceptMultiStage = (() => {
    const byConcept = new Map();
    recent.forEach((e) => { if (!byConcept.has(e.conceptId)) byConcept.set(e.conceptId, new Set()); byConcept.get(e.conceptId).add(e.stage); });
    for (const [cid, stages] of byConcept) if (stages.size >= 2) return cid;
    return null;
  })();

  let pick = candidates[0];
  let needsDiagnostic = false;
  let diagnosticReason = null;
  if (repeatedTag) {
    const hit = concepts.find((c) => (c.misconceptions || []).some((m) => (m.tag || m.description) === repeatedTag[0]))
      || candidates.find((cd) => recent.some((e) => e.misconceptionTag === repeatedTag[0]));
    if (hit) { pick = candidates.find((cd) => cd.concept.conceptId === (hit.conceptId || hit.concept?.conceptId)) || pick; needsDiagnostic = true; diagnosticReason = `Misconception "${repeatedTag[0]}" has appeared ${repeatedTag[1]} times`; }
  } else if (sameConceptMultiStage) {
    const cd = candidates.find((x) => x.concept.conceptId === sameConceptMultiStage);
    if (cd) { pick = cd; needsDiagnostic = true; diagnosticReason = `Errors on ${sameConceptMultiStage} span multiple stages — cause is ambiguous (terminology vs. memory vs. recognition)`; }
  }

  const due = learnerState?.dueForReview?.[0];
  if (!needsDiagnostic && due && pick.cell.evidenceCount > 0) {
    const dueCand = candidates.find((cd) => cd.concept.conceptId === due.conceptId);
    if (dueCand && dueCand.gap > pick.gap - 0.25) pick = dueCand;
  }

  // weakest weighted competence (for rationale)
  let weakest = null;
  if (learnerState?.competences) {
    for (const [k, v] of Object.entries(learnerState.competences)) {
      const w = weights[k] ?? 0.5;
      const score = (1 - v.estimate) * (0.5 + w);
      if (!weakest || score > weakest.score) weakest = { key: k, score, estimate: v.estimate, evidenceCount: v.evidenceCount };
    }
  }

  // A diagnostic is a distinct activity, not more practice with a warning label:
  // three short probes on the SAME concept at discriminating stages separate
  // "never learned it" (fails 1) from "knows, recalls slowly" (passes 1-3, fails 6).
  const diagnosticPlan = needsDiagnostic ? [1, 2, 3].map((s) => ({
    conceptId: pick.concept.conceptId, stage: s, activityType: STAGE_ACTIVITY[s],
    purpose: s === 1 ? "Can they recognize it when heard/seen?" : s === 2 ? "Can they recall the equivalent without pressure?" : "Do they understand what it means, not just its translation?",
  })) : null;
  const activityType = needsDiagnostic ? "diagnostic" : STAGE_ACTIVITY[pick.stage];
  let suggestedGameId = STAGE_GAME_HINT[pick.stage];
  if (pick.concept.competences?.includes("professional-judgment") && pick.stage <= 5) suggestedGameId = "bench-call";
  if (excludeGameId && suggestedGameId === excludeGameId) suggestedGameId = suggestedGameId === "concept-clinch" ? "shift-consecutive" : "concept-clinch";

  const rationaleParts = [];
  if (needsDiagnostic && diagnosticReason) rationaleParts.push(diagnosticReason + " — a short diagnostic activity will separate the causes before more practice.");
  if (pick.cell.evidenceCount === 0) rationaleParts.push(`No evidence yet for "${pick.concept.terms.en.term}" at stage ${pick.stage} (${stageLabel(pick.stage)}).`);
  else rationaleParts.push(`"${pick.concept.terms.en.term}" stage ${pick.stage} (${stageLabel(pick.stage)}) is at ${(pick.cell.estimate * 100).toFixed(0)}% from ${pick.cell.evidenceCount} attempt(s).`);
  if (pick.area) rationaleParts.push(`Area "${pick.area.label.en}" is ${pick.area.riskIfMistranslated}-risk in ${domain.label.en}.`);
  if (weakest) rationaleParts.push(`Weakest weighted competence: ${weakest.key} (${(weakest.estimate * 100).toFixed(0)}%, n=${weakest.evidenceCount}).`);
  if (due && pick.concept.conceptId === due.conceptId) rationaleParts.push("This concept is due for spaced review.");
  const dirsSeen = Object.keys(learnerState?.conceptDirections?.[pick.concept.conceptId] || {}).filter((d) => d !== "unspecified");
  if (dirsSeen.length === 1) rationaleParts.push(`Only tested in one direction (${dirsSeen[0]}) — the reverse direction is unproven, and interpreting runs both ways.`);
  if (pick.cell.evidenceCount && (pick.cell.retention ?? 1) < 0.7) rationaleParts.push(`Predicted recall has faded to ~${Math.round((pick.cell.retention ?? 1) * 100)}% — refreshing now is cheaper than relearning later.`);

  const alternatives = candidates.slice(1, 4).map((cd) => ({
    conceptId: cd.concept.conceptId, areaId: cd.concept.areaIds[0], stage: cd.stage,
    activityType: STAGE_ACTIVITY[cd.stage],
    rationale: `"${cd.concept.terms.en.term}" stage ${cd.stage} gap ${cd.gap.toFixed(2)} (estimate ${(cd.cell.estimate * 100).toFixed(0)}%, n=${cd.cell.evidenceCount}).`,
  }));

  return {
    conceptId: pick.concept.conceptId,
    areaId: pick.concept.areaIds[0],
    stage: pick.stage,
    activityType,
    suggestedGameId,
    rationale: rationaleParts.join(" "),
    alternatives,
    needsDiagnostic,
    diagnosticPlan,
  };
}

export const GAME_CATALOG = [
  { gameId: "concept-clinch", name: "Voice Atelier", verb: "BUILD", stages: [1, 2, 3, 4], promise: "Build the studio; craft each term four ways." },
  { gameId: "term-rush", name: "Term Rush", verb: "RUSH", stages: [6], promise: "Arcade rain for retrieval under pressure." },
  { gameId: "echo-sequence", name: "Echo Sequence", verb: "ECHO", stages: [6, 7], promise: "Hold ordered threads from memory, aloud." },
  { gameId: "shift-consecutive", name: "Night Shift", verb: "ENDURE", stages: [6, 7, 8], promise: "Catch, stack notes, render whole turns live." },
  { gameId: "the-table", name: "The Table", verb: "NEGOTIATE", stages: [5, 8], promise: "Handle the turn strategically, then stand behind words." },
  { gameId: "bench-call", name: "Bench Call", verb: "DECIDE", stages: [3, 5], promise: "Sight paper and judgment, stamped on the record." },
  { gameId: "repair-shop", name: "Repair Shop", verb: "REPAIR", stages: [7, 8], promise: "Hear betrayals in renderings and fix them." },
  { gameId: "vr-lingua-lab", name: "Lingua Lab VR", verb: "IMMERSE", stages: [2, 5], promise: "Carry terms into English inside the lab (gaze/controllers)." },
  { gameId: "vocab-craft", name: "VocabCraft", verb: "MINE & BUILD", stages: [2, 5], promise: "Mine term-blocks, craft the bridge, walk across it." },
  { gameId: "neon-bastion", name: "Neon Bastion", verb: "SHOOT", stages: [2, 6], promise: "Platform-shooter retrieval: blast only the true-equivalent drone." },
  { gameId: "melon-reef", name: "Melon Reef", verb: "DIVE", stages: [1, 5], promise: "Underwater listening harvest — hear it, swim it, surface with it." },
];

/**
 * Ranked game suggestions aligned to the learner's actual gaps (player-facing).
 * Each suggestion names the gap it serves — no generic "play more."
 */
export function recommendGames({ domain, concepts = [], learnerState, limit = 3 }) {
  if (!learnerState || !concepts.length) {
    return [
      { gameId: "concept-clinch", name: "Voice Atelier", verb: "BUILD", reason: "Start here: the Atelier maps what you know, proof by proof.", gapStage: 1, conceptId: concepts[0]?.conceptId || null },
      { gameId: "shift-consecutive", name: "Night Shift", verb: "ENDURE", reason: "Then survive a live turn — listening, notes, memory together.", gapStage: 8, conceptId: concepts[0]?.conceptId || null },
    ];
  }
  // Aggregate mastery per stage across concepts (practiced cells only; unseen = gap 1).
  const stageGap = [1, 2, 3, 4, 5, 6, 7, 8].map((s) => {
    let sum = 0, n = 0, weakest = null, weakestVal = 2;
    for (const c of concepts) {
      const cell = learnerState.stages?.[c.conceptId]?.[s];
      if (cell?.evidenceCount) { sum += cell.estimate; n++; if (cell.estimate < weakestVal) { weakestVal = cell.estimate; weakest = c; } }
    }
    return { stage: s, gap: n ? 1 - sum / n : 1, practiced: n, concept: weakest || concepts[0] };
  }).sort((a, b) => b.gap - a.gap);

  const due = learnerState.dueForReview?.[0];
  const scored = GAME_CATALOG.map((g) => {
    const best = Math.max(...g.stages.map((s) => stageGap.find((x) => x.stage === s)?.gap ?? 0));
    const gapStage = g.stages.reduce((a, s) => ((stageGap.find((x) => x.stage === s)?.gap ?? 0) > (stageGap.find((x) => x.stage === a)?.gap ?? 0) ? s : a), g.stages[0]);
    return { ...g, gap: best, gapStage };
  }).sort((a, b) => b.gap - a.gap);

  return scored.slice(0, limit).map((g) => {
    const gapInfo = stageGap.find((x) => x.stage === g.gapStage);
    const pct = gapInfo?.practiced ? Math.round((1 - gapInfo.gap) * 100) : 0;
    return {
      gameId: g.gameId, name: g.name, verb: g.verb, gapStage: g.gapStage,
      conceptId: gapInfo?.concept?.conceptId || due?.conceptId || null,
      reason: due && g.gameId === "concept-clinch"
        ? `Due first: “${due.conceptId}” is fading (retention ~${Math.round((due.lowestRetention ?? 1) * 100)}%). ${g.promise}`
        : gapInfo?.practiced
          ? `Your Stage ${g.gapStage} (${stageLabel(g.gapStage)}) sits at ${pct}% — the thinnest thread. ${g.promise}`
          : `Stage ${g.gapStage} (${stageLabel(g.gapStage)}) has no evidence yet. ${g.promise}`,
    };
  });
}

function stageLabel(s) {
  return ({ 1: "recognize", 2: "remember equivalent", 3: "understand", 4: "distinguish", 5: "apply", 6: "retrieve under pressure", 7: "speak", 8: "interpret" })[s] || `stage ${s}`;
}

/** Coverage of a domain: per-area concept + evidence picture (Console + Game Lab). */
export function domainCoverage({ domain, concepts = [], learnerState = null }) {
  return domain.translationAreas.map((area) => {
    const inArea = concepts.filter((c) => c.areaIds.includes(area.areaId));
    let evidence = 0, estimateSum = 0, cells = 0;
    if (learnerState) {
      for (const c of inArea) {
        const vec = learnerState.stages[c.conceptId]; if (!vec) continue;
        for (let s = 1; s <= 8; s++) { evidence += vec[s].evidenceCount; if (vec[s].evidenceCount) { estimateSum += vec[s].estimate; cells += 1; } }
      }
    }
    return {
      areaId: area.areaId, label: area.label, riskIfMistranslated: area.riskIfMistranslated,
      conceptCount: inArea.length, evidenceCount: evidence,
      meanEstimate: cells ? estimateSum / cells : 0,
      languages: [...new Set(inArea.flatMap((c) => Object.keys(c.terms || {})))],
    };
  });
}
