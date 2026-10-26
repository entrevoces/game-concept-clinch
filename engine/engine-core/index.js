// ENTRE VOCES engine-core — public API (spec Appendix A)
// Import from here in CPE, EngineClient, Console, and games.
export { validateDomainConfig, validateConcept, validateSource, validateEvidence, validateGameConfig } from "./validate.js";
export { STAGES, COMPETENCES, STAGE_COMPETENCES, computeLearnerState, mergeEvidence } from "./learner.js";
export { recommendNext, domainCoverage, recommendGames, GAME_CATALOG } from "./selector.js";
export { assessInterpretation, spokenErrorHypotheses } from "./fidelity.js";
export { generateItem, generatePracticeSet, validateItems } from "./content.js";
export { SOURCES, OREGON_MEDICAL, OREGON_LEGAL, ONTARIO_REAL_ESTATE, OREGON_CULTIVATION, CALIFORNIA_TAX, CONCEPTS, SEED_DOMAINS, SEED_CONCEPTS_BY_DOMAIN, ENCOUNTERS } from "./seed-data.js";
export { predictedRetention } from "./learner.js";
export { NOTE_SYMBOLS, scoreNotes, extractKeywords } from "./notes.js";
export { generateClient, generateNight } from "./generator.js";

export const ENGINE_VERSION = "1.0.0";
export const WIRE_VERSION = "v1";
