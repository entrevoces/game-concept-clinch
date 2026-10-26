// ENTRE VOCES engine-core — content generation (spec §7)
// Renders Concept x Area x Stage into activity items. Deterministic (seeded),
// so generation is reproducible and testable. Zero AI calls required.

function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => { h = Math.imul(h ^ (h >>> 15), 2246822519); h ^= h >>> 13; return ((h >>> 0) % 10000) / 10000; };
}
function shuffle(arr, rnd) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

const STAGE_META = {
  1: { activityType: "terminology", family: "Terminology recognition" },
  2: { activityType: "bilingual", family: "Bilingual retrieval" },
  3: { activityType: "conceptual", family: "Conceptual understanding" },
  4: { activityType: "conceptual", family: "Distinguish near-neighbors" },
  5: { activityType: "contextual-usage", family: "Use in context" },
  6: { activityType: "retrieval", family: "Rapid retrieval" },
  7: { activityType: "spoken-production", family: "Spoken production" },
  8: { activityType: "interpretation", family: "Interpretation" },
};

/**
 * Generate one activity item for a concept at a mastery stage.
 * Returns the full item contract (spec §5.2/§7): teaching target, provenance,
 * success criteria, misconception signals, acceptable answers, uncertainty.
 */
export function generateItem({ concept, domain, area = null, stage = 2, targetLang = "es", seed = "" }) {
  const meta = STAGE_META[stage] || STAGE_META[2];
  const rnd = hashSeed(`${concept.conceptId}:${stage}:${targetLang}:${seed}`);
  const en = concept.terms.en;
  const tgt = concept.terms[targetLang] || concept.terms.es || concept.terms.zh;
  const areaLabel = area?.label?.en || concept.areaIds?.[0] || "general practice";
  const example = concept.examples?.[0];
  const acceptable = tgt ? [tgt.term, ...(tgt.alternatives || [])] : [en.term];

  let prompt, choices = null, expected = acceptable;
  if (stage === 1) {
    prompt = `You hear the term "${en.term}". What is being referred to?`;
    const distract = shuffle((concept.distinctions || []).map((d) => d.contrast), rnd);
    choices = shuffle([concept.definition?.en || en.term, ...distract].filter(Boolean).slice(0, 4), rnd);
  } else if (stage === 2) {
    prompt = `How would you say "${en.term}" in the target language (${targetLang}) during ${areaLabel.toLowerCase()}?`;
  } else if (stage === 3) {
    prompt = concept.misconceptions?.[0]?.diagnosticPrompt || `In your own words: what does "${en.term}" actually mean for the patient/client?`;
  } else if (stage === 4) {
    const d = concept.distinctions?.[0];
    prompt = d ? `"${en.term}" vs. "${d.contrast}" — what is the professional difference, and why does it matter here?` : `How is "${en.term}" different from similar terms in ${areaLabel.toLowerCase()}?`;
    if (d) { choices = shuffle([d.difference, "They are interchangeable in professional use.", "The difference is only spelling/register, never meaning."], rnd); expected = [d.difference]; }
  } else if (stage === 5) {
    prompt = example?.[targetLang] ? `Complete this in context: "${example.en}" — use "${tgt?.term || en.term}" correctly.` : `Use "${tgt?.term || en.term}" in a sentence appropriate for ${areaLabel.toLowerCase()}.`;
  } else if (stage === 6) {
    prompt = `Quick retrieval (answer promptly): ${en.term} → ?`;
  } else if (stage === 7) {
    prompt = `Say it as you would to the patient/client: explain "${en.term}" (${tgt?.term || ""}) in plain, appropriate language.`;
  } else {
    prompt = example?.en || `Interpret: "We need to discuss ${en.term} before we proceed."`;
    // Interpretation is judged on the carried sentence, not the bare term:
    // the faithful example rendering leads the answer set.
    expected = example?.[targetLang] ? [example[targetLang], ...acceptable] : acceptable;
  }

  return {
    itemId: `${concept.conceptId}-s${stage}-${targetLang}-${Math.floor(rnd() * 1e6)}`,
    conceptId: concept.conceptId, domainId: concept.domainId,
    areaId: area?.areaId || concept.areaIds?.[0],
    stage, activityType: meta.activityType, family: meta.family,
    languageDirection: stage <= 2 || stage === 6 ? `en->${targetLang}` : `${targetLang}->en / production`,
    prompt, choices,
    acceptableAnswers: expected,
    teachingTarget: `${concept.definition?.en || en.term} (stage ${stage}: ${meta.family})`,
    whyItMatters: area ? `In ${areaLabel.toLowerCase()} (${area.riskIfMistranslated}-risk if mistranslated), this distinction changes what the other party understands and decides.` : `Core professional terminology for ${domain?.label?.en || concept.domainId}.`,
    sourceIds: concept.sourceIds || [],
    misconceptionSignals: (concept.misconceptions || []).map((m) => m.tag || m.description),
    difficulty: Math.max(1, Math.min(5, (concept.difficulty || 2) + (stage >= 6 ? 1 : 0))),
    competences: concept.competences || [],
    uncertainty: concept.inferred ? 0.5 : 0.15,
    inferred: !!concept.inferred,
  };
}

/** Expand a concept set into a varied, checked practice set (spec §5.3). */
export function generatePracticeSet({ concepts = [], domain, targetLang = "es", stages = [1, 2, 3, 4, 5], perConcept = 2, seed = "entrevoces" }) {
  const items = [];
  const seen = new Set();
  for (const c of concepts) {
    for (const stage of stages) {
      for (let k = 0; k < perConcept; k++) {
        const area = domain?.translationAreas?.find((a) => a.areaId === c.areaIds[0]) || null;
        const item = generateItem({ concept: c, domain, area, stage, targetLang, seed: `${seed}:${k}` });
        const key = `${item.conceptId}:${item.stage}:${item.prompt}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (validateItems([item], { concepts }).invalid.length === 0) items.push(item); // rejected items never reach a learner
      }
    }
  }
  return items;
}

/** Validate generated items (spec §5.3 checks). Returns { valid, invalid:[{item, reasons}] }
 * Profound checks (not shape-checking): an item is rejected when its answers
 * collide with a neighbour concept's term, when a Stage-8 interpretation item
 * would be graded on a bare term instead of a carried sentence, when a
 * Stage-1 item's choices lack the concept's own definition, or when the
 * prompt leaks the target-language answer it claims to test. Pass
 * { concepts } (the item's domain set) to enable collision checks. */
export function validateItems(items = [], { concepts = [] } = {}) {
  const valid = [], invalid = [];
  const prompts = new Map();
  for (const item of items) {
    const reasons = [];
    if (!item.conceptId) reasons.push("missing conceptId");
    if (!item.prompt) reasons.push("missing prompt");
    if (!Array.isArray(item.acceptableAnswers) || item.acceptableAnswers.length === 0) reasons.push("no acceptable answers");
    if (!item.sourceIds || item.sourceIds.length === 0) reasons.push("no sourceIds — cannot prove provenance");
    if (item.stage === 8 && !(item.acceptableAnswers || []).some((a) => String(a).split(/\s+/).length >= 4)) reasons.push("stage-8 item graded on a bare term — interpretation needs a carried sentence");
    if (item.stage === 1 && item.choices && concepts.length) {
      const own = concepts.find((c) => c.conceptId === item.conceptId);
      if (own?.definition?.en && !item.choices.includes(own.definition.en)) reasons.push("stage-1 choices do not include the concept's own definition");
    }
    if (concepts.length) {
      const own = concepts.find((c) => c.conceptId === item.conceptId);
      for (const a of item.acceptableAnswers || []) {
        const clash = concepts.find((c) => c.conceptId !== item.conceptId && c.domainId === item.domainId && Object.values(c.terms || {}).some((t) => (t?.term || "").toLowerCase() === String(a).toLowerCase()));
        if (clash) reasons.push(`acceptable answer "${a}" is ${clash.conceptId}'s term — the item grades a neighbour as correct`);
      }
      if (own && (item.stage === 2 || item.stage === 6)) {
        const tgtTerm = own.terms?.[item.languageDirection?.split("->")[1]]?.term;
        if (tgtTerm && item.prompt.toLowerCase().includes(tgtTerm.toLowerCase())) reasons.push("prompt leaks the target-language answer it claims to test");
      }
    }
    const dupKey = `${item.conceptId}:${item.stage}:${(item.prompt || "").toLowerCase()}`;
    if (prompts.has(dupKey)) reasons.push("duplicate/near-duplicate prompt");
    prompts.set(dupKey, true);
    (reasons.length ? invalid : valid).push(reasons.length ? { item, reasons } : item);
  }
  return { valid, invalid };
}
