// ENTRE VOCES engine-core — procedural people & problems (Spark showcase)
// NOT LLM filler: combinatorial generation over hand-authored domain material.
// Same seed → same person (reproducible, testable). New seed → a specific new
// person with a name, a stake, a speech quirk, and an effort profile derived
// from YOUR weakest area — so the waiting room always needs exactly you.

const FIRST_F = ["María", "Lucía", "Carmen", "Ana", "Rosa", "Elena", "Sofía", "Valeria", "Xiu", "Mei", "Li", "Fang", "Nadia", "Priya", "Fatima", "Grace"];
const FIRST_M = ["José", "Miguel", "Carlos", "Diego", "Andrés", "Tomás", "Wei", "Jun", "Hao", "Chen", "Omar", "Samir", "James", "Robert", "Kenji", "Mateo"];
const LAST = ["Hernández", "García", "Martínez", "López", "Nguyen", "Chen", "Wang", "Liu", "Kim", "Park", "Johnson", "Alvarez", "Rossi", "Novak", "Haddad", "Okafor"];
const QUIRKS = [
  { id: "hedger", label: "Hedges everything", effect: "Certainty words carry the turn — drop one and you invent confidence." },
  { id: "numbers", label: "Speaks in numbers", effect: "Dates, doses, amounts. Numbers drown first under load — jot them instantly." },
  { id: "corrector", label: "Corrects herself mid-sentence", effect: "The correction IS the testimony. Your notes need the second version, flagged." },
  { id: "rushed", label: "Rushed, stacks clauses", effect: "High listening load. Chunk with your pen or drown politely." },
  { id: "quiet", label: "Quiet, long pauses", effect: "Pauses are thinking, not endings. Do not fill her silence with your guesses." },
  { id: "formal", label: "High formal register", effect: "Register is respect here. A casual rendering quietly offends the record." },
];
const STAKES_MED = [
  "needs to understand before she signs", "is deciding for her father, not herself",
  "fears the medicine more than the illness", "has waited three weeks for this appointment",
  "must return to work tomorrow or lose the shift", "brought her daughter to hear it twice",
];
const STAKES_LEGAL = [
  "believes today is the trial", "must not miss the reporting deadline",
  "does not know he can ask for a pause", "is answering for the record, forever",
  "needs the conditions read slowly, twice", "thinks 'waive' means 'win'",
];

function rng(seedStr) {
  let h = 2166136261;
  const s = String(seedStr);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => { h = Math.imul(h ^ (h >>> 15), 2246822519); h ^= h >>> 13; return ((h >>> 0) % 100000) / 100000; };
}
const pick = (r, arr) => arr[Math.floor(r() * arr.length) % arr.length];

/**
 * Mint a specific waiting-room person for a domain, biased to the learner's gap.
 * Returns { personId, name, role, quirk, stake, areaId, conceptId, effort, greeting }
 */
export function generateClient({ domain, concepts = [], learnerState = null, seed = "shift-1", targetLang = "es", excludeConceptIds = [] }) {
  const r = rng(`${seed}:${domain?.domainId}:${targetLang}`);
  const pool = concepts.filter((c) => !excludeConceptIds.includes(c.conceptId));
  const coverageGaps = [...(pool.length ? pool : concepts)].map((c) => {
    const vec = learnerState?.stages?.[c.conceptId];
    const practiced = vec ? [1, 2, 3, 4, 5, 6, 7, 8].filter((s) => vec[s].evidenceCount > 0) : [];
    const mean = practiced.length ? practiced.reduce((a, s) => a + vec[s].estimate, 0) / practiced.length : 0;
    return { c, gap: 1 - mean + (practiced.length ? 0 : 0.3) + r() * 0.35 };
  }).sort((a, b) => b.gap - a.gap);
  const concept = (coverageGaps[0]?.gap > 0.4 && r() < 0.75) ? coverageGaps[Math.floor(r() * Math.min(3, coverageGaps.length))].c : pick(r, pool.length ? pool : concepts);
  const female = r() < 0.55;
  const name = `${pick(r, female ? FIRST_F : FIRST_M)} ${pick(r, LAST)}`;
  const quirk = pick(r, QUIRKS);
  const isMed = domain?.profession === "medical";
  const stake = pick(r, isMed ? STAKES_MED : STAKES_LEGAL);
  const area = domain?.translationAreas?.find((a) => a.areaId === concept?.areaIds?.[0]);
  const baseEffort = concept?.difficulty || 2;
  const effort = {
    listening: Math.min(5, Math.max(1, baseEffort + (quirk.id === "rushed" ? 1 : 0))),
    memory: Math.min(5, Math.max(1, baseEffort + (quirk.id === "numbers" ? 1 : 0))),
    production: Math.min(5, Math.max(1, baseEffort + (quirk.id === "formal" ? 1 : 0))),
  };
  return {
    personId: `person-${Math.floor(r() * 1e9)}`,
    name, quirk, stake,
    role: isMed ? (r() < 0.6 ? "Patient" : "Family member") : pick(r, ["Defendant", "Witness", "Family member"]),
    areaId: concept?.areaIds?.[0], conceptId: concept?.conceptId,
    areaLabel: area?.label?.en || "General",
    termEn: concept?.terms?.en?.term, termTarget: concept?.terms?.[targetLang]?.term || concept?.terms?.es?.term,
    effort,
    whyYou: practicedReason(learnerState, concept),
  };
}

function practicedReason(state, concept) {
  if (!state || !concept) return "New face. No history — a clean first impression to earn.";
  const vec = state.stages?.[concept.conceptId];
  const n = vec ? [1, 2, 3, 4, 5, 6, 7, 8].reduce((a, s) => a + (vec[s].evidenceCount || 0), 0) : 0;
  if (!n) return `You have never worked “${concept.terms.en.term}” live. Tonight you do.`;
  const weakStage = [1, 2, 3, 4, 5, 6, 7, 8].map((s) => ({ s, v: vec[s] })).filter((x) => x.v.evidenceCount).sort((a, b) => a.v.estimate - b.v.estimate)[0];
  return `Your stage ${weakStage?.s ?? 1} work on “${concept.terms.en.term}” is your thinnest (${Math.round((weakStage?.v.estimate || 0) * 100)}%). The doorbell noticed.`;
}

/** A night of specific people (queue), ordered gentle → demanding. */
export function generateNight({ domain, concepts = [], learnerState = null, seed = "night-1", targetLang = "es", size = 4 }) {
  const people = [];
  const used = [];
  for (let i = 0; i < size; i++) {
    const p = generateClient({ domain, concepts, learnerState, seed: `${seed}:${i}`, targetLang, excludeConceptIds: used });
    used.push(p.conceptId);
    people.push(p);
  }
  return people.sort((a, b) => (a.effort.listening + a.effort.memory) - (b.effort.listening + b.effort.memory));
}
