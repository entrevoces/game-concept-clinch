// ENTRE VOCES engine-core — training modes, classrooms, altruistic resources.
// Modes are distinct crafts in the literature (Gile's Effort Models differ per
// mode; telephone strips the visual channel; sight translation is reading
// aloud across languages). Each mode weights stages differently and prefers
// different games — selecting a mode changes training, not just labels.

export const TRAINING_MODES = [
  { modeId: "consecutive", label: "Consecutive interpreting", blurb: "Listen, note, then render whole turns. The classroom classic (Gile Phase 1+2).", stageWeights: { 1: 0.6, 2: 0.7, 3: 0.8, 4: 0.6, 5: 0.8, 6: 1.0, 7: 1.0, 8: 1.0 }, games: ["shift-consecutive", "echo-sequence", "loteria-aula"] },
  { modeId: "simultaneous", label: "Simultaneous interpreting", blurb: "Render while listening — split attention, décalage, no pause button (Seeber's cognitive load).", stageWeights: { 1: 0.8, 2: 1.0, 3: 0.6, 4: 0.7, 5: 0.8, 6: 1.0, 7: 1.0, 8: 1.0 }, games: ["term-rush", "neon-bastion", "shift-consecutive"] },
  { modeId: "telephone", label: "Telephone / audio-only", blurb: "No faces, no paper, degraded audio. Listening carries everything; clarification is a lifeline.", stageWeights: { 1: 1.0, 2: 0.8, 3: 0.7, 4: 0.6, 5: 0.7, 6: 1.0, 7: 0.9, 8: 1.0 }, games: ["melon-reef", "echo-sequence", "shift-consecutive"] },
  { modeId: "remote-video", label: "Remote / video (VRI)", blurb: "Screen-mediated: turn-taking signals, tech checks, presence without a room.", stageWeights: { 1: 0.8, 2: 0.8, 3: 0.7, 4: 0.7, 5: 1.0, 6: 0.8, 7: 0.9, 8: 1.0 }, games: ["the-table", "vr-lingua-lab", "shift-consecutive"] },
  { modeId: "sight", label: "Sight translation", blurb: "Written source, spoken target, eyes ahead of voice. Reading is the listening here.", stageWeights: { 1: 0.7, 2: 0.9, 3: 1.0, 4: 0.9, 5: 1.0, 6: 0.7, 7: 0.9, 8: 0.8 }, games: ["bench-call", "repair-shop", "vocab-craft"] },
  { modeId: "written", label: "Written translation", blurb: "Time to revise — terminology research, distinctions, register on the page.", stageWeights: { 1: 0.6, 2: 1.0, 3: 1.0, 4: 1.0, 5: 0.9, 6: 0.3, 7: 0.5, 8: 0.6 }, games: ["concept-clinch", "repair-shop", "vocab-craft"] },
  { modeId: "cultural", label: "Cultural translation & context", blurb: "Not interpreting: songs, slang, humour, memory. Carry vibe and context across (tango path).", stageWeights: { 1: 0.7, 2: 0.9, 3: 1.0, 4: 1.0, 5: 0.8, 6: 0.4, 7: 0.7, 8: 1.0 }, games: ["milonga-sentido", "loteria-aula", "concept-clinch"] },
  { modeId: "group-class", label: "Group / classroom play", blurb: "Learning out loud together — calling, marking, arguing kindly. Social first, stealth assessment.", stageWeights: { 1: 1.0, 2: 1.0, 3: 0.7, 4: 0.8, 5: 0.7, 6: 0.6, 7: 0.8, 8: 0.6 }, games: ["loteria-aula", "melon-reef", "echo-sequence"] },
];
export const modeById = (id) => TRAINING_MODES.find((m) => m.modeId === id) || null;

// Curated shelf. No affiliate links, no ads, nothing sold — titles to find at
// a library or bookseller. `forStages`/`forModes` drive honest matching.
export const RESOURCES = [
  { id: "gile-effort", kind: "book", title: "Basic Concepts and Models for Interpreter and Translator Training", by: "Daniel Gile", why: "The Effort Models — why listening, memory, production and coordination collide, per mode.", forStages: [6, 7, 8], forModes: ["consecutive", "simultaneous"] },
  { id: "rozan-notes", kind: "book", title: "La prise de notes en interprétation consécutive", by: "Jean-François Rozan", why: "The seven note-taking principles Night Shift's notebook is built on. Short, strict, transformative.", forStages: [6, 7], forModes: ["consecutive"] },
  { id: "gillies-notes", kind: "book", title: "Note-Taking for Consecutive Interpreting: A Short Course", by: "Andrew Gillies", why: "Rozan made practical — symbols, links, verticality, with exercises.", forStages: [6, 7], forModes: ["consecutive", "telephone"] },
  { id: "jones-explained", kind: "book", title: "Conference Interpreting Explained", by: "Roderick Jones", why: "What the work actually feels like in the booth and at the table; clarity about décalage.", forStages: [7, 8], forModes: ["simultaneous", "remote-video"] },
  { id: "pochhacker", kind: "book", title: "Introducing Interpreting Studies", by: "Franz Pöchhacker", why: "The field in one map — modes, settings, quality, ethics; find your corner of it.", forStages: [3, 5, 8], forModes: [] },
  { id: "seleskovitch", kind: "book", title: "Interpreting for International Conferences", by: "Danica Seleskovitch", why: "Sense over words — the théorie du sens behind 'preserve meaning, not wording'.", forStages: [3, 8], forModes: ["consecutive", "simultaneous"] },
  { id: "dam-word", kind: "article", title: "On the option between form-based and meaning-based interpreting", by: "Helle V. Dam", why: "When literal helps and when it betrays — the distinction games here score daily.", forStages: [4, 8], forModes: [] },
  { id: "ncihc-ethics", kind: "standard", title: "National Code of Ethics & Standards of Practice for Interpreters in Health Care", by: "NCIHC", why: "The medical role boundaries Bench Call stamps into the record.", forStages: [5], forModes: ["telephone", "remote-video"] },
  { id: "aiic-videos", kind: "video", title: "AIIC — interpreter training videos & webinars", by: "AIIC (International Association of Conference Interpreters)", why: "Working interpreters demonstrating booth craft, preparation, and teamwork.", forStages: [7, 8], forModes: ["simultaneous"] },
  { id: "speech-repo", kind: "practice", title: "Speech Repository (European Commission DG Interpretation)", by: "SCIC", why: "Free graded speeches built for practice in every mode — your endless waiting room.", forStages: [6, 7, 8], forModes: ["consecutive", "simultaneous", "sight"] },
  { id: "phone-drills", kind: "practice", title: "Telephone drill: record a call, interpret, transcribe, compare", by: "Self-directed (method)", why: "Audio-only strips gesture and paper — the honest telephone rehearsal, fidelity checker included.", forStages: [1, 6, 8], forModes: ["telephone"] },
  { id: "sight-drills", kind: "practice", title: "Sight method: mark sense-groups, eyes ahead, never backtrack", by: "Self-directed (method)", why: "Bench Call's scan discipline as a daily ten-minute paper habit.", forStages: [3, 5, 7], forModes: ["sight"] },
];

/** Altruistic recommendations: weakest stage + chosen modes -> shelf items. */
export function recommendResources({ learnerState = null, concepts = [], modes = [], limit = 3 } = {}) {
  const stageGap = [1, 2, 3, 4, 5, 6, 7, 8].map((s) => {
    let sum = 0, n = 0;
    for (const c of concepts) { const cell = learnerState?.stages?.[c.conceptId]?.[s]; if (cell?.evidenceCount) { sum += cell.estimate; n++; } }
    return { stage: s, gap: n ? 1 - sum / n : 1 };
  }).sort((a, b) => b.gap - a.gap);
  const weakest = stageGap.slice(0, 3).map((x) => x.stage);
  const scored = RESOURCES.map((r) => ({
    resource: r,
    score: r.forStages.filter((s) => weakest.includes(s)).length * 2 + r.forModes.filter((m) => modes.includes(m)).length * 1.5,
    matchedStages: r.forStages.filter((s) => weakest.includes(s)),
    matchedModes: r.forModes.filter((m) => modes.includes(m)),
  })).sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(({ resource, matchedStages, matchedModes }) => ({
    ...resource,
    reason: `Matched to ${matchedStages.length ? `your thinnest stage(s) ${matchedStages.join(", ")}` : "broad foundations"}${matchedModes.length ? ` and your ${matchedModes.join("/")} mode` : ""}. ${resource.why}`,
  }));
}

// Imagined classmates: deterministic from classroom code (same code, same
// class — on any device). Clearly demo people; hobbies are theirs to suggest.
const NAMES = ["Marisol", "Diego", "Ana Lucía", "Kenji", "Priya", "Tomás", "Fatima", "Grace", "Mateo", "Ingrid", "Carlos", "Mei", "Jordan", "Lucía", "Sam", "Valentina"];
const HOBBIES = [
  { hobby: "cooking & farmers markets", gameId: "vocab-craft", pitch: "builds with ingredients — VocabCraft's mine-and-build fits" },
  { hobby: "basketball & street courts", gameId: "neon-bastion", pitch: "lives for arcade shots — Neon Bastion" },
  { hobby: "ocean swimming & tide pools", gameId: "melon-reef", pitch: "will dive for listening practice — Melon Reef" },
  { hobby: "board-game nights & lotería with abuela", gameId: "loteria-aula", pitch: "asked for Lotería by name — Lotería de Aula" },
  { hobby: "gardening & seed saving", gameId: "vocab-craft", pitch: "grows vocabulary like rows — VocabCraft" },
  { hobby: " chess & puzzles", gameId: "the-table", pitch: "reads rooms two moves ahead — The Table" },
  { hobby: "radio dramas & podcasts", gameId: "melon-reef", pitch: "trains by ear already — Melon Reef" },
  { hobby: "fixing bikes & small engines", gameId: "repair-shop", pitch: "spots what's broken for fun — Repair Shop" },
  { hobby: "theatre & improv", gameId: "shift-consecutive", pitch: "performs under lights — Night Shift" },
  { hobby: "courtroom TV & true crime", gameId: "bench-call", pitch: "wants the stamp and the record — Bench Call" },
];
function hashCode(s) { let h = 2166136261; for (const ch of String(s)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); } return Math.abs(h); }
export function generateClassmates(classCode, count = 7) {
  const seed = hashCode(classCode || "AULA-0000");
  return Array.from({ length: count }, (_, i) => {
    const n = NAMES[(seed + i * 3) % NAMES.length];
    const h = HOBBIES[(seed + i * 5) % HOBBIES.length];
    const weeklyProofs = 12 + ((seed >> (i % 8)) % 160);
    const focusStage = 1 + ((seed >> (i % 6)) % 8);
    return { name: n, hobby: h.hobby.trim(), suggestedGameId: h.gameId, pitch: h.pitch, weeklyProofs, focusStage, imagined: true };
  });
}
/** Leaderboard rows: you (real evidence) among imagined classmates (labelled). */
export function classroomLeaderboard({ classCode, learnerName = "You", learnerProofs = 0 }) {
  const rows = generateClassmates(classCode).map((c) => ({ name: c.name, proofs: c.weeklyProofs, imagined: true, hobby: c.hobby, suggestedGameId: c.suggestedGameId, pitch: c.pitch, focusStage: c.focusStage }));
  rows.push({ name: learnerName, proofs: learnerProofs, imagined: false, hobby: "—", focusStage: null });
  return rows.sort((a, b) => b.proofs - a.proofs).map((r, i) => ({ ...r, rank: i + 1 }));
}
