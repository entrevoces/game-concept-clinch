// Concept Clinch — produced scene game (spec §11.3, research §5)
// Four proofs per concept, each a different cognitive act, each separate
// engine evidence: Hear (recognize) → Build (produce) → Catch (distinguish
// consequential distortion) → Teach-back (judge fidelity). Recognition alone
// never advances mastery — the engine's 8 stages stay honest.
import * as core from "./engine/engine-core/index.js";
import { EngineClient } from "./engine/engine-client/engine-client.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const BEATS = [
  { key: "hear", stage: 1, name: "Hear it", caption: "First proof: recognize what the term actually means when it is spoken." },
  { key: "build", stage: 2, name: "Build it", caption: "Second proof: produce the equivalent yourself, tile by tile. No options to hide behind." },
  { key: "catch", stage: 4, name: "Catch the distortion", caption: "Third proof: one rendering preserves the professional distinction. The other quietly breaks it." },
  { key: "teachback", stage: 3, name: "Teach-back check", caption: "Final proof: judge whether their understanding is faithful — the real consent skill." },
];

let engine, domain, concepts = [], targetLang = "es";
let learnerState = null;
let session = null; // { queue, qi, beatIndex, assisted, built, sessionCorrect, sessionTotal, startedAt }
let timerId = null, timeLeft = 0;

const PEOPLE = {
  "oregon-medical": { a: ["María", "Patient"], bubbleName: "María", room: "Clinic — Exam Room 2" },
  "oregon-legal": { a: ["Mr. Alvarez", "Defendant"], bubbleName: "Mr. Alvarez", room: "Courtroom — Department 4" },
};

// ---------- tiny sound design (WebAudio, no assets) ----------
let audioCtx = null;
function tone(freq, dur = 0.12, type = "sine", gain = 0.06, when = 0) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(gain, audioCtx.currentTime + when);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + when + dur);
    o.connect(g).connect(audioCtx.destination);
    o.start(audioCtx.currentTime + when); o.stop(audioCtx.currentTime + when + dur);
  } catch { /* sound is garnish, never required */ }
}
const sfxGood = () => { tone(523, 0.1); tone(784, 0.14, "sine", 0.06, 0.08); };
const sfxBad = () => tone(196, 0.18, "triangle", 0.05);
const sfxTile = () => tone(392, 0.05, "sine", 0.03);

// ---------- fx ----------
function burst(good = true) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const layer = $("#fxLayer");
  const colors = good ? ["#177a6c", "#c9a227", "#d99a3d"] : ["#bc4630", "#8a5a3b"];
  for (let i = 0; i < 14; i++) {
    const el = document.createElement("span");
    el.className = "particle";
    el.style.background = colors[i % colors.length];
    el.style.left = `${44 + Math.random() * 12}%`; el.style.top = "42%";
    layer.appendChild(el);
    const dx = (Math.random() - 0.5) * 260, dy = -40 - Math.random() * 140;
    el.animate([{ transform: "translate(0,0) scale(1)", opacity: 1 }, { transform: `translate(${dx}px,${dy}px) scale(.4)`, opacity: 0 }], { duration: 750 + Math.random() * 350, easing: "cubic-bezier(.2,.8,.3,1)" }).onfinish = () => el.remove();
  }
  const note = document.createElement("span");
  note.className = "float-note"; note.textContent = good ? "Understanding holds" : "That would mislead them";
  note.style.left = "40%"; note.style.top = "36%"; note.style.color = good ? "#0f5a4f" : "#7c2718";
  layer.appendChild(note); setTimeout(() => note.remove(), 1050);
}
function react(good) {
  for (const id of ["#personA"]) {
    const el = $(id);
    el.classList.remove("react-good", "react-bad"); void el.offsetWidth;
    el.classList.add(good ? "react-good" : "react-bad");
    const mouth = el.querySelector(".mouth");
    mouth.setAttribute("d", good ? "M49 44 Q60 54 71 44" : "M50 52 Q60 45 70 52");
  }
}

// ---------- helpers ----------
function params() { return new URLSearchParams(location.search); }
function hubHref() {
  const p = params();
  return `https://entrevoces.github.io/apps/hub/?domain=${encodeURIComponent(engine?.domainId || p.get("domain") || "oregon-medical")}&learner=${encodeURIComponent(engine?.learnerId || p.get("learner") || "")}&engine=${encodeURIComponent(engine?.engineUrl || p.get("engine") || "")}`;
}
function showScreen(id) {
  stopTimer();
  document.querySelectorAll(".screen").forEach((s) => s.classList.toggle("is-active", s.id === id));
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function updateSyncBadge() {
  const st = engine.status();
  const b = $("#syncBadge");
  b.textContent = st.online ? `Synced · ${st.pending} pending` : `Local-only · ${st.pending} queued — play is safe`;
  b.className = `pill ${st.online ? "pill-on" : "pill-local"}`;
  $("#hubLink").href = hubHref(); $("#endHubLink").href = hubHref();
}
function tgtTerm(c) { return c.terms[targetLang]?.term || c.terms.es?.term || c.terms.en.term; }
function exampleFor(c) { return c.examples?.[0] || { en: c.definition.en, es: c.definition.es || c.definition.en, zh: c.definition.zh || c.definition.en }; }
function tokenize(sentence, lang) {
  if (lang === "zh") return sentence.replace(/[。！？]/g, "").split(/(?<=[，、：；])/).map((s) => s.trim()).filter(Boolean).length > 1
    ? sentence.replace(/[。！？]/g, "").split(/(?<=[，、：；])/).map((s) => s.trim()).filter(Boolean)
    : [...sentence.replace(/[。！？\s]/g, "")].reduce((acc, ch, i) => { const k = Math.floor(i / 3); acc[k] = (acc[k] || "") + ch; return acc; }, []);
  return sentence.replace(/[.!?]/g, "").split(/\s+/).filter(Boolean);
}
function shuffle(a) { const x = [...a]; for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; }

// ---------- boot / title ----------
async function boot() {
  const p = params();
  const customTitle = p.get("title"); if (customTitle) { const h = document.querySelector("h1"); if (h) h.textContent = customTitle; document.title = `${customTitle} · ENTRE VOCES`; }
  targetLang = p.get("lang") || localStorage.getItem("ev:targetLang") || "es";
  let fallbackConcepts = core.CONCEPTS;
  try { const r = await fetch("concepts-subset.json"); if (r.ok) fallbackConcepts = await r.json(); } catch { /* bundled import fallback */ }
  const domainId = p.get("domain") || localStorage.getItem("ev:domainId") || "oregon-medical";
  engine = new EngineClient({
    engineUrl: p.get("engine") || localStorage.getItem("ev:engineUrl") || "http://127.0.0.1:8787",
    learnerId: p.get("learner") || "", domainId, core,
    fallbackDomain: core.SEED_DOMAINS.find((d) => d.domainId === domainId) || core.OREGON_MEDICAL,
    fallbackConcepts,
  });
  await engine.init();
  domain = await engine.getDomain(engine.domainId);
  concepts = await engine.listConcepts(engine.domainId);
  if (!concepts.length) concepts = fallbackConcepts.filter((c) => c.domainId === engine.domainId);
  await refreshState();
  loadStudio();
  renderTitle();
  renderStudio();
  $("#startBtn").addEventListener("click", () => startSession());
  $("#dueBtn").addEventListener("click", () => startSession({ dueOnly: true }));
  $("#againBtn").addEventListener("click", () => startSession());
  $("#mapBtn").addEventListener("click", () => { showScreen("screen-title"); renderTitle(); });
  $("#nextStepBtn").addEventListener("click", advance);
  $("#quitBtn").addEventListener("click", endSession);
  $("#hintBtn").addEventListener("click", useHint);
  $("#clearTilesBtn").addEventListener("click", clearTiles);
  $("#checkTilesBtn").addEventListener("click", checkTiles);
  document.addEventListener("keydown", onKeys);
  setInterval(updateSyncBadge, 5000);
}

async function refreshState() {
  try { learnerState = await engine.getState(engine.domainId, concepts); } catch { learnerState = null; }
  updateSyncBadge();
}

function renderTitle() {
  const people = PEOPLE[engine.domainId] || PEOPLE["oregon-medical"];
  $("#titleContext").innerHTML = `<strong>${esc(domain?.label.en || engine.domainId)}</strong> · English ↔ ${targetLang === "zh" ? "中文" : "Español"} · ${concepts.length} engine concepts · ${people.a[0]} is waiting in ${people.room.toLowerCase()}. ${engine.online ? "Progression engine connected." : "Engine offline — bundled knowledge + local memory; syncs later."}`;
  const due = learnerState?.dueForReview || [];
  const practiced = Object.values(learnerState?.stages || {}).flatMap((v) => Object.values(v)).filter((c) => c.evidenceCount > 0).length;
  $("#dueBtn").hidden = due.length === 0;
  $("#dueBtn").textContent = due.length ? `Review ${due.length} due concept${due.length > 1 ? "s" : ""} before they fade` : "Review due";
  $("#titleStats").innerHTML = `
    <span class="stat-chip">${learnerState?.evidenceCount || 0}<small>evidence events (all games)</small></span>
    <span class="stat-chip">${practiced}<small>concept-stages practiced</small></span>
    <span class="stat-chip">${due.length}<small>due for review now</small></span>
    <span class="stat-chip">${engine.online ? "Connected" : "Local-only"}<small>${esc(engine.engineUrl)}</small></span>`;
  const dueIds = new Set(due.map((d) => d.conceptId));
  $("#masteryMap").innerHTML = concepts.map((c) => {
    const vec = learnerState?.stages?.[c.conceptId];
    const pips = [1, 2, 3, 4, 5, 6, 7, 8].map((s) => {
      const cell = vec?.[s] || { estimate: 0, evidenceCount: 0 };
      const cls = !cell.evidenceCount ? "" : cell.estimate >= 0.7 ? "strong" : "learning";
      const dueCls = dueIds.has(c.conceptId) && cell.evidenceCount ? " due" : "";
      return `<span class="pip ${cls}${dueCls}" title="Stage ${s}: ${cell.evidenceCount ? `${(cell.estimate * 100).toFixed(0)}% (n=${cell.evidenceCount}, retention ${((cell.retention ?? 1) * 100).toFixed(0)}%)` : "no evidence"}"></span>`;
    }).join("");
    return `<button type="button" class="map-row" data-clinch="${esc(c.conceptId)}"><span class="term">${esc(c.terms.en.term)} → ${esc(tgtTerm(c))}<small>${esc(c.areaIds.join(", "))} · difficulty ${c.difficulty}/5${dueIds.has(c.conceptId) ? " · DUE" : ""}</small></span><span class="pips">${pips}</span></button>`;
  }).join("");
  document.querySelectorAll("[data-clinch]").forEach((b) => b.addEventListener("click", () => startSession({ conceptId: b.dataset.clinch })));
  renderVisitTrack(null);
}

function renderVisitTrack(currentConcept) {
  const areas = domain?.translationAreas || [];
  $("#visitTrack").innerHTML = areas.map((a) => {
    const inArea = concepts.filter((c) => c.areaIds.includes(a.areaId));
    const done = inArea.length && inArea.every((c) => {
      const v = learnerState?.stages?.[c.conceptId];
      return v && [1, 2, 3, 4].some((s) => v[s].evidenceCount > 0 && v[s].estimate >= 0.6);
    });
    const now = currentConcept && currentConcept.areaIds.includes(a.areaId);
    return `<span class="visit-step ${done ? "done" : ""} ${now ? "now" : ""}">${done ? "✓ " : ""}${esc(a.label.en)}</span>`;
  }).join("");
}

// ---------- session ----------
async function startSession({ conceptId = null, dueOnly = false } = {}) {
  await refreshState();
  let queue = [];
  if (conceptId) queue = [concepts.find((c) => c.conceptId === conceptId)].filter(Boolean);
  else if (dueOnly) queue = (learnerState?.dueForReview || []).map((d) => concepts.find((c) => c.conceptId === d.conceptId)).filter(Boolean);
  if (!queue.length) {
    const next = await engine.getNext(engine.domainId).catch(() => null);
    const first = concepts.find((c) => c.conceptId === next?.conceptId) || concepts[0];
    queue = [first, ...shuffle(concepts.filter((c) => c.conceptId !== first.conceptId)).slice(0, 2)];
  }
  session = { queue: queue.slice(0, 3), qi: 0, beatIndex: 0, assisted: false, built: [], sessionCorrect: 0, sessionTotal: 0, conceptsDone: [] };
  const people = PEOPLE[engine.domainId] || PEOPLE["oregon-medical"];
  $("#nameA").textContent = people.a[0]; $("#roleA").textContent = people.a[1];
  $("#sceneRoom").textContent = people.room;
  showScreen("screen-play");
  renderBeat();
}

function currentConcept() { return session.queue[session.qi]; }

function renderBeat() {
  const concept = currentConcept();
  const beat = BEATS[session.beatIndex];
  const area = domain?.translationAreas.find((a) => a.areaId === concept.areaIds[0]);
  $("#hudPlace").textContent = (PEOPLE[engine.domainId] || PEOPLE["oregon-medical"]).room;
  $("#hudConcept").textContent = `${concept.terms.en.term} → ${tgtTerm(concept)}`;
  $("#hudBeat").textContent = `${beat.name} · ${session.qi + 1}/${session.queue.length} concepts`;
  const dueIds = new Set((learnerState?.dueForReview || []).map((d) => d.conceptId));
  const dueEl = $("#hudDue");
  dueEl.hidden = !dueIds.has(concept.conceptId);
  dueEl.textContent = "Due review — retention fading";
  updateStreakHud();
  renderVisitTrack(concept);
  $("#beatCaption").textContent = beat.caption;
  $("#sourceLine").textContent = `Source: ${(concept.sourceIds || []).join(", ") || "—"} · Area: ${area?.label.en || concept.areaIds[0]} (${area?.riskIfMistranslated || "?"} risk) · Stage ${beat.stage} evidence stays separate from the other seven stages.`;
  $("#feedback").textContent = ""; $("#feedback").className = "feedback";
  $("#consequence").hidden = true;
  $("#nextStepBtn").hidden = true;
  $("#hintBtn").disabled = false;
  $("#choices").innerHTML = ""; $("#tilesWrap").hidden = true;
  session.assisted = false; session.built = [];
  stopTimer();

  const ex = exampleFor(concept);
  if (beat.key === "hear") {
    $("#bubbleText").textContent = `“${ex.en}”`;
    $("#promptText").textContent = `You hear “${concept.terms.en.term}”. What is actually being referred to?`;
    const item = core.generateItem({ concept, domain, area, stage: 1, targetLang, seed: `clinch-${concept.conceptId}` });
    const options = shuffle(item.choices?.length ? item.choices : [concept.definition.en]);
    renderChoices(options, concept.definition.en, () => "That is the concept — now produce it, don't just recognize it.");
    startPressure(14);
  } else if (beat.key === "build") {
    const target = ex[targetLang] || ex.es;
    $("#bubbleText").textContent = `“${ex.en}”`;
    $("#promptText").textContent = `Build the ${targetLang === "zh" ? "中文" : "Spanish"} rendering. Every tile is a decision — order is meaning.`;
    session.targetTokens = tokenize(target, targetLang);
    const others = shuffle(concepts.filter((c) => c.conceptId !== concept.conceptId)).slice(0, 2).map((c) => tgtTerm(c));
    session.bank = shuffle([...session.targetTokens, ...others]);
    renderTiles();
  } else if (beat.key === "catch") {
    const faithful = ex[targetLang] || ex.es;
    const wrongTerm = shuffle(concepts.filter((c) => c.conceptId !== concept.conceptId).map((c) => tgtTerm(c)))[0] || "—";
    const distorted = faithful.replace(tgtTerm(concept), wrongTerm);
    const options = shuffle([faithful, distorted === faithful ? `${faithful} (sin cambios importantes)` : distorted]);
    session.faithfulText = faithful;
    $("#bubbleText").textContent = `“${ex.en}”`;
    $("#promptText").textContent = `Two interpreters rendered that turn. One preserves “${concept.terms.en.term}”. Which one would you trust on the record?`;
    renderChoices(options, faithful, () => "Correct — the other rendering swaps the very distinction this encounter turns on.");
    startPressure(18);
  } else {
    // teach-back: half the sessions get a subtly wrong paraphrase
    const wrong = Math.random() < 0.5;
    const contrastTerm = concept.distinctions?.[0]?.contrast || "a similar term";
    const text = wrong
      ? (targetLang === "zh" ? `我明白了，就是${contrastTerm}的意思，对吧？` : `Ya entiendo — es lo mismo que ${contrastTerm}, ¿verdad?`)
      : (ex[targetLang] || ex.es);
    session.teachbackWrong = wrong;
    $("#bubbleText").textContent = `“${text}”`;
    $("#promptText").textContent = `${(PEOPLE[engine.domainId] || PEOPLE["oregon-medical"]).bubbleName} teaches it back to you. Is their understanding faithful?`;
    renderChoices(["Faithful — they have it", "Distorted — a key distinction slipped"], wrong ? "Distorted — a key distinction slipped" : "Faithful — they have it", () => wrong ? "Right to catch it. Left alone, that misunderstanding walks out the door with them." : "Correct — faithful paraphrase in different words still counts. Interpreting preserves meaning, not wording.");
  }
}

function renderChoices(options, answer, successText) {
  session.answer = answer; session.successText = successText;
  $("#choices").innerHTML = options.map((o, i) => `<button type="button" class="choice" data-choice="${esc(o)}"><span class="key">${i + 1}</span><span>${esc(o)}</span></button>`).join("");
  document.querySelectorAll(".choice").forEach((b) => b.addEventListener("click", () => answerChoice(b)));
}

function renderTiles() {
  const builtEl = $("#sentenceBuilt"), bankEl = $("#tileBank");
  $("#tilesWrap").hidden = false;
  builtEl.innerHTML = session.built.map((t, i) => `<button type="button" class="tile in-built" data-built="${i}">${esc(t)}</button>`).join("");
  const remaining = [...session.bank];
  for (const t of session.built) { const k = remaining.indexOf(t); if (k >= 0) remaining.splice(k, 1); }
  bankEl.innerHTML = remaining.map((t) => `<button type="button" class="tile" data-tile="${esc(t)}">${esc(t)}</button>`).join("");
  bankEl.querySelectorAll("[data-tile]").forEach((b) => b.addEventListener("click", () => { session.built.push(b.dataset.tile); sfxTile(); renderTiles(); }));
  builtEl.querySelectorAll("[data-built]").forEach((b) => b.addEventListener("click", () => { session.built.splice(Number(b.dataset.built), 1); renderTiles(); }));
  $("#checkTilesBtn").disabled = false;
}
function clearTiles() { session.built = []; renderTiles(); }

function startPressure(seconds) {
  if (!$("#pressureToggle").checked) { $("#timerRing").hidden = true; return; }
  timeLeft = seconds; stopTimer();
  $("#timerRing").hidden = false;
  const circumference = 119;
  const tick = () => {
    $("#timerText").textContent = Math.ceil(timeLeft);
    $("#ringFg").style.strokeDashoffset = String(circumference * (1 - Math.max(0, timeLeft) / seconds));
    timeLeft -= 0.1;
    if (timeLeft < 0) { stopTimer(); timeExpired(); }
  };
  tick(); timerId = setInterval(tick, 100);
}
function stopTimer() { if (timerId) clearInterval(timerId); timerId = null; const r = $("#timerRing"); if (r) r.hidden = true; }
function timeExpired() {
  const beat = BEATS[session.beatIndex];
  if (beat.key === "build") { checkTiles(true); return; }
  document.querySelectorAll(".choice").forEach((b) => { b.disabled = true; if (b.dataset.choice === session.answer) b.classList.add("is-correct"); });
  finishBeat(false, "Time — retrieval under pressure is its own stage (6). The engine notes this separately from knowledge; slow-and-right still counts in untimed mode.");
}

function useHint() {
  if (!session) return;
  session.assisted = true;
  const c = currentConcept();
  const fb = $("#feedback");
  fb.className = "feedback";
  fb.textContent = `Notebook: ${c.definition.en} In the other language: “${tgtTerm(c)}”${c.distinctions?.[0] ? ` — vs. ${c.distinctions[0].contrast}: ${c.distinctions[0].difference}` : ""} (hint logged; assisted proof still counts, differently)`;
  $("#hintBtn").disabled = true;
  tone(330, 0.08, "sine", 0.03);
}

function answerChoice(btn) {
  stopTimer();
  document.querySelectorAll(".choice").forEach((b) => { b.disabled = true; });
  const correct = btn.dataset.choice === session.answer;
  btn.classList.add(correct ? "is-correct" : "is-wrong", "pop");
  if (!correct) document.querySelectorAll(".choice").forEach((b) => { if (b.dataset.choice === session.answer) b.classList.add("is-correct"); });
  finishBeat(correct, correct ? session.successText : explainMiss());
}
function checkTiles(expired = false) {
  stopTimer();
  const concept = currentConcept();
  const built = session.built.join(targetLang === "zh" ? "" : " ").replace(/\s+/g, " ").trim().toLowerCase();
  const target = session.targetTokens.join(targetLang === "zh" ? "" : " ").replace(/\s+/g, " ").trim().toLowerCase();
  const correct = built === target;
  $("#checkTilesBtn").disabled = true;
  finishBeat(correct, correct
    ? `Built, not picked. “${session.targetTokens.join(targetLang === "zh" ? "" : " ")}” — that production is stage-2 evidence recognition can never give.`
    : `${expired ? "Time. " : ""}Not yet — listen to the order: “${session.targetTokens.join(targetLang === "zh" ? "" : " ")}”. ${concept.distinctions?.[0]?.difference || concept.definition.en}`);
}

function explainMiss() {
  const c = currentConcept();
  const beat = BEATS[session.beatIndex];
  if (beat.key === "hear") return `That is a neighbor, not this concept. ${c.distinctions?.[0]?.difference || c.definition.en}`;
  if (beat.key === "catch") return `The other rendering is faithful. Swapping “${tgtTerm(c)}” changes what the clinician, patient, or court acts on — in a ${c.areaIds[0]} encounter that is consequential, not stylistic.`;
  return c.distinctions?.[0] ? `Listen for the distinction: ${c.distinctions[0].difference}` : `Compare carefully: ${c.definition.en}`;
}

// ---------- Voice Atelier studio (Build pillar; trust never buys correctness) ----------
const CATALOG = [
  { id: "fern", name: "Listening Fern", icon: "F", cost: 30, blurb: "Notebook hints add the spoken example." },
  { id: "lamp", name: "Consent Lamp", icon: "L", cost: 50, blurb: "Teach-back moments glow — slower, kinder light." },
  { id: "abacus", name: "Abacus of Numbers", icon: "123", cost: 40, blurb: "Numbers in the room get a bead of emphasis." },
  { id: "desk", name: "Note Desk", icon: "N", cost: 45, blurb: "A proper place for Rozan symbols and jots." },
  { id: "sofa", name: "Waiting Sofa", icon: "S", cost: 60, blurb: "Tomorrow's people wait comfortably — and return." },
  { id: "mural", name: "Mural of Two Rivers", icon: "R", cost: 90, blurb: "Two languages, one wall. Pure pride." },
];
let studio = { trust: 0, built: {}, duos: [] };
function studioKey() { return `ev:atelier:${engine?.learnerId || "anon"}`; }
function loadStudio() {
  try { studio = { trust: 0, built: {}, duos: [], ...JSON.parse(localStorage.getItem(studioKey()) || "{}") }; } catch { studio = { trust: 0, built: {}, duos: [] }; }
}
function saveStudio() { localStorage.setItem(studioKey(), JSON.stringify(studio)); }
function renderStudio() {
  const pill = $("#trustPill"); if (!pill) return;
  pill.textContent = `Trust ${studio.trust}`;
  const grid = $("#studioGrid");
  grid.innerHTML = Array.from({ length: 6 }, (_, i) => {
    const builtId = studio.built[i];
    const piece = CATALOG.find((c) => c.id === builtId);
    return piece
      ? `<button type="button" class="plot built" data-plot="${i}"><span><span class="plot-icon">${esc(piece.icon)}</span>${esc(piece.name)}<small>Built · tap for another</small></span></button>`
      : `<button type="button" class="plot" data-plot="${i}"><span><span class="plot-icon">+</span>Empty plot<small>Tap to build</small></span></button>`;
  }).join("");
  grid.querySelectorAll("[data-plot]").forEach((b) => b.addEventListener("click", () => openBuildMenu(Number(b.dataset.plot))));
  const wall = $("#duoWall");
  wall.innerHTML = studio.duos.length
    ? studio.duos.map((d) => `<span class="duo-card">${esc(d.a)} ⚔ ${esc(d.b)}<small>reconciled in the room</small></span>`).join("")
    : `<span class="hint">Catch a distortion to reconcile your first duo.</span>`;
}
function openBuildMenu(plot) {
  const menu = $("#buildMenu");
  menu.hidden = false;
  menu.innerHTML = `<strong>Build on plot ${plot + 1} — Trust ${studio.trust}</strong>` + CATALOG.map((c) => {
    const owned = Object.values(studio.built).includes(c.id);
    return `<button type="button" class="build-option" data-build="${c.id}" ${owned || studio.trust < c.cost ? "disabled" : ""}><span>${esc(c.name)}<small>${esc(c.blurb)}</small></span><span>${owned ? "Built" : `${c.cost} Trust`}</span></button>`;
  }).join("");
  menu.querySelectorAll("[data-build]").forEach((b) => b.addEventListener("click", () => {
    const piece = CATALOG.find((c) => c.id === b.dataset.build);
    studio.trust -= piece.cost; studio.built[plot] = piece.id; saveStudio(); renderStudio();
    menu.innerHTML = `<strong>${esc(piece.name)} raised.</strong> <span class="hint">The room feels more like yours. Correctness still has to be earned in the encounters.</span>`;
    sfxGood(); burst(true);
  }));
}
function earnTrust(correct, beatKey) {
  if (!correct) return 0;
  const gain = beatKey === "build" ? 14 : beatKey === "catch" ? 12 : 10;
  studio.trust += gain; saveStudio();
  return gain;
}

function finishBeat(correct, explanation) {
  const beat = BEATS[session.beatIndex];
  const concept = currentConcept();
  session.sessionTotal += 1;
  if (correct) session.sessionCorrect += 1;
  const fb = $("#feedback");
  fb.className = `feedback ${correct ? "good" : "bad"}`;
  fb.textContent = correct ? "Held. " + explanation : "Wobbled. " + explanation;
  const cons = $("#consequence");
  cons.hidden = false;
  cons.innerHTML = correct
    ? `<strong>In the room:</strong> ${(PEOPLE[engine.domainId] || PEOPLE["oregon-medical"]).bubbleName} nods — the meaning landed. The chart gains a line, and this proof is yours.`
    : `<strong>In the room:</strong> a pause, a furrowed brow. No one is harmed in practice — this is exactly where misunderstanding is cheapest to fix. The engine queues a revisit.`;
  const gained = earnTrust(correct, beat.key);
  if (correct && beat.key === "catch" && concept.distinctions?.[0]) {
    const duo = { a: concept.terms.en.term, b: concept.distinctions[0].contrast };
    if (!studio.duos.some((d) => d.a === duo.a)) { studio.duos.push(duo); saveStudio(); }
  }
  correct ? (sfxGood(), burst(true)) : (sfxBad(), burst(false));
  if (gained) fb.textContent += ` +${gained} Trust for the studio.`;
  react(correct);
  updateStreakHud(correct);
  engine.recordEvidence({
    conceptId: concept.conceptId, areaId: concept.areaIds[0], gameId: "concept-clinch",
    activityType: beat.key === "build" ? "bilingual" : beat.key === "catch" ? "conceptual" : beat.key === "teachback" ? "conceptual" : "terminology",
    stage: beat.stage, languageDirection: beat.key === "build" ? `en->${targetLang}` : "en",
    correct, score: correct ? (session.assisted ? 0.7 : 1) : 0.15,
    assistance: session.assisted ? ["notebook-hint"] : [],
    ...(!correct && concept.misconceptions?.[0]?.tag ? { misconceptionTag: concept.misconceptions[0].tag } : {}),
    responseSummary: `${beat.name} on ${concept.conceptId}`,
  });
  updateSyncBadge();
  $("#nextStepBtn").hidden = false; $("#nextStepBtn").focus();
}

function updateStreakHud(correct) {
  // streak derives from recent local evidence honesty: show session accuracy flame text (no emoji per house style)
  const acc = session && session.sessionTotal ? Math.round((session.sessionCorrect / session.sessionTotal) * 100) : 100;
  $("#hudStreak").textContent = session ? `Session ${session.sessionCorrect}/${session.sessionTotal} · ${acc}%` : "";
}

function advance() {
  session.beatIndex += 1;
  if (session.beatIndex >= BEATS.length) {
    session.conceptsDone.push(currentConcept().conceptId);
    session.qi += 1; session.beatIndex = 0;
    if (session.qi >= session.queue.length) { endSession(); return; }
  }
  renderBeat();
}

async function endSession() {
  stopTimer();
  await engine.sync().catch(() => {});
  await refreshState();
  const next = await engine.getNext(engine.domainId).catch(() => null);
  const due = learnerState?.dueForReview || [];
  const doneAreas = (domain?.translationAreas || []).filter((a) => concepts.filter((c) => c.areaIds.includes(a.areaId)).some((c) => {
    const v = learnerState?.stages?.[c.conceptId];
    return v && [1, 2, 3, 4].some((s) => v[s].evidenceCount > 0 && v[s].estimate >= 0.6);
  }));
  const pct = session && session.sessionTotal ? Math.round((session.sessionCorrect / session.sessionTotal) * 100) : 0;
  $("#endTitle").textContent = pct >= 80 ? "They understood you. That is the whole job." : pct >= 50 ? "Solid shift — the wobbles are mapped now." : "Every wobble is now on the engine's map. That is progress.";
  $("#endStats").innerHTML = `<p style="font-size:19px;">This session: <strong>${session?.sessionCorrect || 0}/${session?.sessionTotal || 0} proofs (${pct}%)</strong> across ${(session?.conceptsDone || []).length} concept(s). Total engine evidence (this learner, this domain): <strong>${learnerState?.evidenceCount || 0}</strong>.</p>`;
  $("#endExplain").innerHTML = next?.conceptId
    ? `<strong>Engine next:</strong> ${esc(next.rationale)}<br><span class="hint">Suggested: ${esc(next.suggestedGameId || "concept-clinch")} · stage ${next.stage}${next.needsDiagnostic ? " · diagnostic first (competing causes)" : ""}</span>`
    : `<strong>Engine next:</strong> more evidence will sharpen the recommendation.`;
  $("#returnBox").innerHTML = `
    <p><strong>Due queue:</strong> ${due.length ? due.map((d) => `${esc(concepts.find((c) => c.conceptId === d.conceptId)?.terms.en.term || d.conceptId)} (retention ~${Math.round((d.lowestRetention ?? 1) * 100)}%)`).join(", ") + " — reviewing at the fade is what makes it stick." : "nothing due yet. New proofs fade over ~1–2 days; tomorrow's queue is being scheduled now."}</p>
    <p><strong>Story:</strong> ${(PEOPLE[engine.domainId] || PEOPLE["oregon-medical"]).bubbleName}'s journey — ${doneAreas.length}/${(domain?.translationAreas || []).length} areas with proven concepts (${doneAreas.map((a) => esc(a.label.en)).join(", ") || "just started"}). Continue in Shift to interpret their actual turns.</p>
    <p class="hint">Close the tab. Come back tomorrow: due reviews first, then the story continues. That loop — not a marathon — is how interpreters are built.</p>`;
  showScreen("screen-end");
}

function onKeys(e) {
  if ($("#screen-title").classList.contains("is-active") && e.key === "Enter") { startSession(); return; }
  if (!$("#screen-play").classList.contains("is-active")) return;
  const n = Number(e.key);
  if (n >= 1 && n <= 4) { const b = [...document.querySelectorAll(".choice:not(:disabled)")][n - 1]; if (b) b.click(); }
  if (e.key === "Enter" && !$("#nextStepBtn").hidden) advance();
}

boot().catch((e) => {
  $("#titleContext").textContent = `Could not load the engine (${e.message}). Reload to retry — the bundled seed keeps the rooms open.`;
  $("#startBtn").disabled = true;
});
