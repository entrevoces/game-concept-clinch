// ENTRE VOCES engine-core — knowledge review (the active gatekeeper).
// A concept is not usable because it parses. reviewKnowledgeItem asks whether
// it can survive contact with a learner: terms align inside their own example
// sentences in all three languages, distinctions teach a real contrast,
// misconceptions carry a usable diagnostic, answers cannot collide with a
// neighbour's term, and provenance resolves. Verdicts: accept / repair /
// reject. Deterministic — the same checks the Meta reviewer (CPE) must agree
// with; AI may add judgement, it may not waive these.

const STOP = new Set(["the", "a", "an", "of", "to", "in", "on", "is", "are", "el", "la", "los", "las", "de", "en", "y", "的", "是", "了"]);
const norm = (s) => (s || "").toLowerCase().replace(/\s+/g, " ").trim();
function termVariants(term) {
  // "impartiality (interpreter)" -> ["impartiality (interpreter)", "impartiality"]
  // "conditions of sentence / probation conditions" -> both sides of the slash.
  const base = norm(term).replace(/\s*[（(][^）)]*[）)]\s*/g, " ").trim();
  return [...new Set([norm(term), base, ...base.split("/").map((x) => x.trim())].filter(Boolean))];
}
function containsTerm(sentence, term) {
  if (!sentence || !term) return false;
  const s = norm(sentence);
  for (const v of termVariants(term)) {
    if (s.includes(v)) return true;
    // any significant token (or its 6-char stem: clarify ~ clarification)
    const toks = v.split(/\s+/).filter((w) => w.length >= 4 && !STOP.has(w));
    if (toks.some((w) => s.includes(w) || s.includes(w.slice(0, 6)))) return true;
  }
  return false;
}

export function reviewKnowledgeItem(concept, { concepts = [], sources = [] } = {}) {
  const findings = [];
  const add = (severity, field, message) => findings.push({ severity, field, message });
  if (!concept || typeof concept !== "object") return { verdict: "reject", score: 0, findings: [{ severity: "blocker", field: "", message: "not an object" }] };
  const siblings = concepts.filter((c) => c.conceptId !== concept.conceptId && c.domainId === concept.domainId);

  for (const lang of ["en", "es", "zh"]) {
    const t = concept.terms?.[lang];
    if (!t?.term) add("blocker", `terms.${lang}`, `missing ${lang} term — games in this language have nothing to teach`);
    else {
      if (!t.register) add("major", `terms.${lang}.register`, "no register marked (professional/slang/cultural…) — register blindness starts here");
      const clash = siblings.find((c) => norm(c.terms?.[lang]?.term) === norm(t.term) || (c.terms?.[lang]?.alternatives || []).some((a) => norm(a) === norm(t.term)));
      if (clash) add("blocker", `terms.${lang}`, `"${t.term}" collides with ${clash.conceptId} in ${lang} — distractors would be unfair`);
      const altClash = (t.alternatives || []).find((a) => siblings.some((c) => norm(c.terms?.[lang]?.term) === norm(a)));
      if (altClash) add("blocker", `terms.${lang}.alternatives`, `alternative "${altClash}" is another concept's term — a correct answer graded wrong`);
    }
    const def = concept.definition?.[lang];
    if (!def) add("major", `definition.${lang}`, `no ${lang} definition — this language's learners get a shallower concept`);
    else if (def.length < (lang === "zh" ? 18 : 35)) add("major", `definition.${lang}`, "definition too thin to teach from");
    else if (norm(def) === norm(t?.term)) add("major", `definition.${lang}`, "definition merely repeats the term");
  }

  const ex = concept.examples?.[0];
  if (!ex) add("blocker", "examples", "no example sentence — nothing can become a game round");
  else {
    for (const lang of ["en", "es", "zh"]) {
      const term = concept.terms?.[lang]?.term;
      const alts = concept.terms?.[lang]?.alternatives || [];
      if (ex[lang] && term && !containsTerm(ex[lang], term) && !alts.some((a) => containsTerm(ex[lang], a)))
        add("major", `examples.${lang}`, `example does not contain its own ${lang} term ("${term}") — the sentence teaches a different word than the card claims`);
    }
    if (ex.en && ex.es && norm(ex.en) === norm(ex.es)) add("major", "examples", "EN and ES examples are identical — one of them is not a translation");
  }

  if (!concept.distinctions?.length) add("major", "distinctions", "no distinctions — Stage 4 (tell neighbours apart) cannot be taught");
  for (const d of concept.distinctions || []) {
    if (!d.difference || d.difference.length < 40) add("major", "distinctions", `contrast "${d.contrast}" has a difference too thin to learn from`);
    if (norm(d.contrast) === norm(concept.terms?.en?.term)) add("blocker", "distinctions", "contrast is the concept itself — the distinction teaches nothing");
  }
  if (!concept.misconceptions?.length) add("major", "misconceptions", "no misconceptions — diagnostics have no hypotheses to test");
  for (const m of concept.misconceptions || []) {
    if (!m.tag) add("major", "misconceptions", "misconception without a tag cannot be counted or diagnosed");
    if (!m.diagnosticPrompt || m.diagnosticPrompt.length < 30) add("major", "misconceptions.diagnosticPrompt", "diagnostic prompt too thin to separate causes");
  }
  if (!concept.sourceIds?.length) add("blocker", "sourceIds", "no sources — provenance is a promise we cannot keep");
  if (sources.length) for (const s of concept.sourceIds || []) if (!sources.some((x) => x.sourceId === s)) add("blocker", "sourceIds", `source "${s}" is not in the register`);
  if (concept.difficulty != null && (concept.difficulty < 1 || concept.difficulty > 5)) add("major", "difficulty", "difficulty outside 1..5 breaks generation pacing");

  const blockers = findings.filter((f) => f.severity === "blocker").length;
  const majors = findings.filter((f) => f.severity === "major").length;
  const score = Math.max(0, 100 - blockers * 40 - majors * 12);
  return { verdict: blockers ? "reject" : majors >= 3 ? "repair" : "accept", score, findings };
}

/** Review a whole knowledge base. Returns per-concept verdicts + summary. */
export function reviewKnowledgeBase({ concepts = [], sources = [] } = {}) {
  const byDomain = new Map();
  for (const c of concepts) { if (!byDomain.has(c.domainId)) byDomain.set(c.domainId, []); byDomain.get(c.domainId).push(c); }
  const results = concepts.map((concept) => ({ conceptId: concept.conceptId, domainId: concept.domainId, ...reviewKnowledgeItem(concept, { concepts: byDomain.get(concept.domainId) || [], sources }) }));
  return {
    total: results.length,
    accepted: results.filter((r) => r.verdict === "accept").length,
    repair: results.filter((r) => r.verdict === "repair").length,
    rejected: results.filter((r) => r.verdict === "reject").length,
    results,
  };
}
