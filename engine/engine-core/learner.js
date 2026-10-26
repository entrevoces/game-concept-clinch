// ENTRE VOCES engine-core — learner model (spec §5)
// Pure functions: same code runs on CPE server and inside EngineClient offline,
// so online and offline adaptation agree. No I/O, no globals.

export const STAGES = [
  { stage: 1, key: "recognize", label: "Recognize a word" },
  { stage: 2, key: "equivalent", label: "Remember its equivalent" },
  { stage: 3, key: "understand", label: "Understand the concept" },
  { stage: 4, key: "distinguish", label: "Distinguish from neighbors" },
  { stage: 5, key: "apply", label: "Apply in context" },
  { stage: 6, key: "retrieve-pressure", label: "Retrieve under pressure" },
  { stage: 7, key: "speak", label: "Use appropriately in speech" },
  { stage: 8, key: "interpret", label: "Preserve meaning while interpreting" },
];

export const COMPETENCES = [
  "domain-knowledge", "professional-terminology", "bilingual-terminology",
  "terminology-usage", "listening", "speech-production", "meaning-transfer",
  "cognitive-interpreting", "professional-judgment", "integrated-performance",
];

// stage -> competences it primarily evidences (documented mapping; tested)
export const STAGE_COMPETENCES = {
  1: ["professional-terminology"],
  2: ["bilingual-terminology"],
  3: ["domain-knowledge"],
  4: ["domain-knowledge", "terminology-usage"],
  5: ["terminology-usage", "domain-knowledge"],
  6: ["cognitive-interpreting", "bilingual-terminology"],
  7: ["speech-production", "terminology-usage"],
  8: ["meaning-transfer", "integrated-performance", "listening"],
};

function emptyStageVector() {
  const v = {};
  // stabilityDays: FSRS-inspired memory stability (see docs/research/engine-research.md §3).
  // retention is derived at read time: R = exp(-ageDays / stabilityDays).
  for (const s of STAGES) v[s.stage] = { estimate: 0, evidenceCount: 0, lastSeen: null, confidence: 0, stabilityDays: 0, retention: 1 };
  return v;
}

const DAY = 86400000;
/** Predicted recall right now for one mastery cell. */
export function predictedRetention(cell, now = Date.now()) {
  if (!cell || !cell.evidenceCount || !cell.lastSeen || !cell.stabilityDays) return cell?.evidenceCount ? 0 : 1;
  const ageDays = Math.max(0, (now - cell.lastSeen) / DAY);
  return Math.exp(-ageDays / cell.stabilityDays);
}

/**
 * Compute LearnerState from an append-only evidence log.
 * Mastery update: correct evidence moves estimate toward 1, incorrect toward 0,
 * weighted by assessment confidence and assistance (assisted success counts less).
 * Only the event's own stage is updated (spec §5.2 — never collapsed).
 */
export function computeLearnerState({ learnerId, domainId, events = [], concepts = [], now = Date.now() }) {
  const conceptById = new Map(concepts.map((c) => [c.conceptId, c]));
  const stages = {};
  const ensure = (cid) => { if (!stages[cid]) stages[cid] = emptyStageVector(); return stages[cid]; };
  concepts.forEach((c) => ensure(c.conceptId));

  const sorted = [...events].sort((a, b) => (a.clientTs || a.serverTs || 0) - (b.clientTs || b.serverTs || 0));
  const recentErrors = [];
  const tagCounts = new Map();

  for (const ev of sorted) {
    const vec = ensure(ev.conceptId);
    const cell = vec[ev.stage || 1];
    const conf = ev.confidence == null ? 0.8 : ev.confidence;
    const assisted = Array.isArray(ev.assistance) && ev.assistance.length > 0;
    const success = ev.correct != null ? (ev.correct ? 1 : 0) : (ev.score ?? 0);
    const score = ev.score == null ? success : ev.score;
    const weight = 0.15 + 0.35 * conf * (assisted ? 0.5 : 1);
    cell.estimate = cell.estimate + (score - cell.estimate) * weight;
    cell.evidenceCount += 1;
    cell.lastSeen = ev.clientTs || ev.serverTs || now;
    cell.confidence = Math.min(1, cell.evidenceCount / 4) * (0.5 + 0.5 * conf);
    cell.estimate = Math.max(0, Math.min(1, cell.estimate));
    // Stability: successful retrieval lengthens memory life; failure shortens it.
    // Assisted success grows stability less (the help, not just memory, did the work).
    if (score >= 0.6) cell.stabilityDays = cell.stabilityDays === 0 ? 1 : Math.min(90, cell.stabilityDays * (assisted ? 1.35 : 1.9));
    else if (cell.stabilityDays > 0) cell.stabilityDays = Math.max(0.3, cell.stabilityDays * 0.5);
    if (!ev.correct && ev.misconceptionTag) {
      tagCounts.set(ev.misconceptionTag, (tagCounts.get(ev.misconceptionTag) || 0) + 1);
      recentErrors.push({ conceptId: ev.conceptId, areaId: ev.areaId, stage: ev.stage, misconceptionTag: ev.misconceptionTag, ts: ev.clientTs || ev.serverTs });
    }
  }

  // Competence derivation from staged evidence.
  // Time-decayed: a competence proven a year ago is not today's competence.
  // Each event's weight halves roughly every 31 days (exp(-age/45)); `freshness`
  // exposes how current the proof is so UIs never present stale skill as live.
  const compAcc = new Map(COMPETENCES.map((k) => [k, { sum: 0, w: 0, n: 0, confSum: 0 }]));
  const directions = {};
  const conceptDirections = {};
  for (const ev of sorted) {
    const keys = new Set([...(STAGE_COMPETENCES[ev.stage || 1] || []), ...((conceptById.get(ev.conceptId)?.competences) || [])]);
    const value = ev.score == null ? (ev.correct ? 1 : 0) : ev.score;
    const ts = ev.clientTs || ev.serverTs || now;
    const ageWeight = Math.exp(-Math.max(0, now - ts) / (45 * DAY));
    for (const k of keys) {
      const a = compAcc.get(k); if (!a) continue;
      a.sum += value * ageWeight; a.w += ageWeight; a.n += 1; a.confSum += (ev.confidence == null ? 0.8 : ev.confidence);
    }
    const dir = ev.languageDirection || "unspecified";
    directions[dir] = (directions[dir] || 0) + 1;
    (conceptDirections[ev.conceptId] ||= {})[dir] = ((conceptDirections[ev.conceptId] || {})[dir] || 0) + 1;
  }
  const competences = {};
  for (const [k, a] of compAcc) {
    competences[k] = a.n === 0
      ? { estimate: 0, evidenceCount: 0, confidence: 0, freshness: 0 }
      : { estimate: a.w ? a.sum / a.w : 0, evidenceCount: a.n, confidence: Math.min(1, a.n / 5) * (a.confSum / a.n), freshness: a.w / a.n };
  }

  // Attach predicted retention to every practiced cell (forgetting made visible).
  for (const vec of Object.values(stages)) {
    for (const s of STAGES) vec[s.stage].retention = predictedRetention(vec[s.stage], now);
  }

  // Spaced review queue: practiced cells whose predicted retention fell below 0.85,
  // most-forgotten first. This queue is the daily return loop in hub + games.
  const dueForReview = Object.entries(stages)
    .map(([conceptId, vec]) => {
      const practiced = STAGES.map((s) => vec[s.stage]).filter((c) => c.evidenceCount > 0);
      if (!practiced.length) return null;
      const lowest = Math.min(...practiced.map((c) => c.retention));
      const weakest = Math.min(...practiced.map((c) => c.estimate));
      const last = Math.max(...practiced.map((c) => c.lastSeen || 0));
      return { conceptId, lastSeen: last || null, weakestEstimate: weakest, lowestRetention: lowest };
    })
    .filter((d) => d && (d.lowestRetention < 0.85 || d.weakestEstimate < 0.7))
    .sort((a, b) => a.lowestRetention - b.lowestRetention)
    .slice(0, 10);

  const lastActivityAt = sorted.length ? (sorted[sorted.length - 1].clientTs || sorted[sorted.length - 1].serverTs || null) : null;

  return {
    learnerId, domainId, stages, competences, directions, conceptDirections,
    recentErrors: recentErrors.slice(-12),
    misconceptionCounts: Object.fromEntries(tagCounts),
    dueForReview, lastActivityAt,
    evidenceCount: sorted.length,
  };
}

/** Merge two evidence logs by eventId (append-only; never overwrite). */
export function mergeEvidence(local = [], remote = []) {
  const byId = new Map();
  for (const ev of [...local, ...remote]) if (ev && ev.eventId && !byId.has(ev.eventId)) byId.set(ev.eventId, ev);
  return [...byId.values()].sort((a, b) => (a.clientTs || a.serverTs || 0) - (b.clientTs || b.serverTs || 0));
}
