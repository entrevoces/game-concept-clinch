// ENTRE VOCES engine-core — validation (hand-rolled, zero-dep; mirrors spec §3–§5)
// Same validators run in CPE (server), EngineClient (browser), and Console.

const SLUG = /^[a-z0-9][a-z0-9-]{2,48}$/;
const PROFESSIONS = new Set(["medical", "legal", "education", "social-services", "other"]);
const RISK = new Set(["low", "medium", "high", "critical"]);
const STATUS = new Set(["draft", "active", "archived"]);
const MODALITIES = new Set(["consecutive", "simultaneous", "sight", "remote"]);
const ACTIVITY_TYPES = new Set([
  "terminology", "conceptual", "contextual-usage", "bilingual",
  "retrieval", "listening", "spoken-production", "interpretation", "integrated", "judgment",
  "note-craft", "sight", "repair",
]);

function err(field, message) { return { field, message }; }

export function validateDomainConfig(cfg, { existingIds = new Set() } = {}) {
  const errors = [];
  if (!cfg || typeof cfg !== "object") return { ok: false, errors: [err("", "domain config must be an object")] };
  if (!cfg.domainId || !SLUG.test(cfg.domainId)) errors.push(err("domainId", "must be slug ^[a-z0-9][a-z0-9-]{2,48}$"));
  if (cfg.domainId && existingIds.has(cfg.domainId)) errors.push(err("domainId", "duplicate domainId"));
  if (!cfg.label || !cfg.label.en) errors.push(err("label.en", "label.en is required"));
  if (!cfg.jurisdiction || !cfg.jurisdiction.country || !cfg.jurisdiction.region) errors.push(err("jurisdiction", "jurisdiction.country and jurisdiction.region are required"));
  if (!PROFESSIONS.has(cfg.profession)) errors.push(err("profession", `must be one of ${[...PROFESSIONS].join(", ")}`));
  if (!Array.isArray(cfg.languagePairs) || cfg.languagePairs.length === 0) errors.push(err("languagePairs", "at least one language pair is required"));
  else cfg.languagePairs.forEach((p, i) => {
    if (!p.source || !p.target) errors.push(err(`languagePairs[${i}]`, "source and target (BCP-47) are required"));
    if (p.source === p.target) errors.push(err(`languagePairs[${i}]`, "source and target must differ"));
  });
  if (Array.isArray(cfg.modalities)) cfg.modalities.forEach((m) => { if (!MODALITIES.has(m)) errors.push(err("modalities", `unknown modality "${m}"`)); });
  if (!Array.isArray(cfg.translationAreas) || cfg.translationAreas.length === 0) errors.push(err("translationAreas", "at least one translation area is required"));
  else {
    const areaIds = new Set();
    cfg.translationAreas.forEach((a, i) => {
      if (!a.areaId || !SLUG.test(a.areaId)) errors.push(err(`translationAreas[${i}].areaId`, "areaId must be a slug"));
      if (a.areaId && areaIds.has(a.areaId)) errors.push(err(`translationAreas[${i}].areaId`, "duplicate areaId in domain"));
      areaIds.add(a.areaId);
      if (!a.label || !a.label.en) errors.push(err(`translationAreas[${i}].label.en`, "label.en is required"));
      if (!RISK.has(a.riskIfMistranslated)) errors.push(err(`translationAreas[${i}].riskIfMistranslated`, "must be low|medium|high|critical"));
    });
    // prerequisite cycle + dangling checks
    cfg.translationAreas.forEach((a) => {
      (a.prerequisiteAreaIds || []).forEach((p) => { if (!areaIds.has(p)) errors.push(err(`translationAreas.${a.areaId}.prerequisiteAreaIds`, `unknown prerequisite "${p}"`)); });
    });
    // cycle detection (DFS)
    const graph = new Map(cfg.translationAreas.map((a) => [a.areaId, a.prerequisiteAreaIds || []]));
    const state = new Map();
    const visit = (n, stack) => {
      if (state.get(n) === "done") return;
      if (state.get(n) === "visiting") { errors.push(err("translationAreas", `prerequisite cycle: ${[...stack, n].join(" -> ")}`)); return; }
      state.set(n, "visiting");
      (graph.get(n) || []).forEach((m) => visit(m, [...stack, n]));
      state.set(n, "done");
    };
    graph.forEach((_, k) => visit(k, []));
    // language-pair coverage: every area concept language need is satisfiable if pairs exist (pairs already checked non-empty)
  }
  if (cfg.competencyWeights) {
    for (const [k, v] of Object.entries(cfg.competencyWeights)) {
      if (typeof v !== "number" || v < 0 || v > 1) errors.push(err(`competencyWeights.${k}`, "must be a number 0..1"));
    }
  }
  if (!STATUS.has(cfg.status || "draft")) errors.push(err("status", "must be draft|active|archived"));
  return { ok: errors.length === 0, errors };
}

export function validateConcept(c, { domain = null, sourceIds = new Set() } = {}) {
  const errors = [];
  if (!c || typeof c !== "object") return { ok: false, errors: [err("", "concept must be an object")] };
  if (!c.conceptId || !SLUG.test(c.conceptId)) errors.push(err("conceptId", "must be a slug"));
  if (!c.domainId) errors.push(err("domainId", "domainId is required"));
  if (domain && c.domainId !== domain.domainId) errors.push(err("domainId", "must match parent domain"));
  if (!Array.isArray(c.areaIds) || c.areaIds.length === 0) errors.push(err("areaIds", "at least one areaId is required"));
  if (domain) {
    const valid = new Set(domain.translationAreas.map((a) => a.areaId));
    (c.areaIds || []).forEach((a) => { if (!valid.has(a)) errors.push(err("areaIds", `unknown area "${a}" for domain ${domain.domainId}`)); });
  }
  if (!c.terms || !c.terms.en || !c.terms.en.term) errors.push(err("terms.en.term", "English term is required"));
  if (c.sourceIds) c.sourceIds.forEach((s) => { if (sourceIds.size && !sourceIds.has(s)) errors.push(err("sourceIds", `unknown source "${s}"`)); });
  if (c.difficulty != null && (c.difficulty < 1 || c.difficulty > 5)) errors.push(err("difficulty", "must be 1..5"));
  return { ok: errors.length === 0, errors };
}

export function validateSource(s) {
  const errors = [];
  if (!s || !s.sourceId) errors.push(err("sourceId", "required"));
  if (!s || !s.title) errors.push(err("title", "required"));
  if (!s || !s.publisher) errors.push(err("publisher", "required"));
  return { ok: errors.length === 0, errors };
}

export function validateEvidence(ev) {
  const errors = [];
  if (!ev || typeof ev !== "object") return { ok: false, errors: [err("", "event must be an object")] };
  if (!ev.eventId) errors.push(err("eventId", "required (client-generated UUID for idempotency)"));
  if (!ev.learnerId) errors.push(err("learnerId", "required"));
  if (!ev.domainId) errors.push(err("domainId", "required"));
  if (!ev.conceptId) errors.push(err("conceptId", "required"));
  if (ev.stage != null && (ev.stage < 1 || ev.stage > 8)) errors.push(err("stage", "must be 1..8"));
  if (ev.score != null && (ev.score < 0 || ev.score > 1)) errors.push(err("score", "must be 0..1"));
  if (ev.confidence != null && (ev.confidence < 0 || ev.confidence > 1)) errors.push(err("confidence", "must be 0..1"));
  if (ev.activityType && !ACTIVITY_TYPES.has(ev.activityType)) errors.push(err("activityType", `unknown activityType "${ev.activityType}"`));
  // minimization: reject unexpected top-level fields (spec §9.4)
  const allowed = new Set(["eventId","learnerId","domainId","conceptId","areaId","gameId","activityType","stage","languageDirection","correct","score","assistance","confidence","fidelity","misconceptionTag","responseSummary","clientTs","serverTs"]);
  for (const k of Object.keys(ev)) if (!allowed.has(k)) errors.push(err(k, "unexpected field — evidence schema is closed (data minimization)"));
  return { ok: errors.length === 0, errors };
}

export function validateGameConfig(g) {
  const errors = [];
  if (!g || !g.gameId || !SLUG.test(g.gameId)) errors.push(err("gameId", "slug required"));
  if (!g || !Array.isArray(g.domainIds) || g.domainIds.length === 0) errors.push(err("domainIds", "at least one domainId required"));
  return { ok: errors.length === 0, errors };
}
