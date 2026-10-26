// Voice Atelier — canvas studio (regen, game-spec-kit).
// Four beats per client visit, all played on objects: hear (meaning orbs),
// build (word tiles into a sentence strip), catch (two speech bubbles, one
// betrays), teach-back (your own words). Mastered concepts furnish the shelf.
import * as core from "./engine/engine-core/index.js";
import { EngineClient } from "./engine/engine-client/engine-client.js";
import { Juice } from "./engine/game-kit/juice.js";
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const cv = $("#game"), ctx = cv.getContext("2d");
const W = 960, H = 540;
const juice = new Juice(cv);
const BEATS = [
  { key: "hear", stage: 1, name: "Hear it" },
  { key: "build", stage: 2, name: "Build it" },
  { key: "catch", stage: 4, name: "Catch the betrayal" },
  { key: "teachback", stage: 3, name: "Teach-back" },
];
const OBJECTS = ["lamp", "plant", "books", "chair", "clock", "vase", "radio", "teapot", "globe", "frame", "cactus", "cat"];
let engine, domain, concepts = [], targetLang = "es", studio = { built: [], trust: 0 };
let S = null, raf = null;
function hubHref() { const p = new URLSearchParams(location.search); return `https://entrevoces.github.io/apps/hub/?domain=${encodeURIComponent(engine?.domainId || p.get("domain") || "oregon-medical")}&learner=${encodeURIComponent(engine?.learnerId || p.get("learner") || "")}&engine=${encodeURIComponent(engine?.engineUrl || p.get("engine") || "")}`; }
function show(id) { if (raf) cancelAnimationFrame(raf); raf = null; document.querySelectorAll(".screen").forEach((s) => s.classList.toggle("is-active", s.id === id)); }
function tgtTerm(c) { return c.terms[targetLang]?.term || c.terms.es?.term || c.terms.en.term; }
function exampleFor(c) { return c.examples?.[0] || { en: c.definition.en, es: c.definition.es || c.definition.en, zh: c.definition.zh || c.definition.en }; }
function shuffle(a) { const x = [...a]; for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; }
function speak(text, lang) { try { const u = new SpeechSynthesisUtterance(text); u.lang = lang === "es" ? "es-ES" : lang === "zh" ? "zh-CN" : "en-US"; u.rate = 0.95; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch {} }
function syncBadge() { const st = engine.status(); const b = $("#syncBadge"); b.textContent = st.online ? `Synced · ${st.pending} pending` : `Local-only · ${st.pending} queued`; b.className = `pill ${st.online ? "pill-on" : "pill-local"}`; $("#hubLink").href = hubHref(); $("#endHubLink").href = hubHref(); }
function studioKey() { return `ev:atelier:${engine?.learnerId || "anon"}:${engine?.domainId || ""}`; }
function loadStudio() { try { studio = JSON.parse(localStorage.getItem(studioKey()) || '{"built":[],"trust":0}'); } catch { studio = { built: [], trust: 0 }; } }
function saveStudio() { try { localStorage.setItem(studioKey(), JSON.stringify(studio)); } catch {} }
function tokenize(sentence) { return String(sentence || "").split(/\s+/).filter(Boolean); }

async function boot() {
  const p = new URLSearchParams(location.search);
  targetLang = p.get("lang") || localStorage.getItem("ev:targetLang") || "es";
  let fb = core.CONCEPTS; try { const r = await fetch("concepts-subset.json"); if (r.ok) fb = await r.json(); } catch {}
  const domainId = p.get("domain") || localStorage.getItem("ev:domainId") || "oregon-medical";
  engine = new EngineClient({ engineUrl: p.get("engine") || localStorage.getItem("ev:engineUrl") || "http://127.0.0.1:8787", learnerId: p.get("learner") || "", domainId, core, fallbackDomain: core.SEED_DOMAINS.find((d) => d.domainId === domainId) || core.OREGON_MEDICAL, fallbackConcepts: fb });
  await engine.init();
  domain = await engine.getDomain(engine.domainId);
  concepts = await engine.listConcepts(engine.domainId);
  if (!concepts.length) concepts = fb.filter((c) => c.domainId === engine.domainId);
  loadStudio();
  syncBadge();
  const state = await engine.getState(engine.domainId, concepts).catch(() => null);
  const due = state?.dueForReview?.length || 0;
  $("#dueBtn").hidden = due === 0;
  $("#dueBtn").textContent = `Review what's due (${due})`;
  $("#titleContext").textContent = `${domain?.label.en || engine.domainId} · shelf holds ${studio.built.length} built objects · trust ${studio.trust}.`;
  $("#startBtn").addEventListener("click", () => startSession());
  $("#dueBtn").addEventListener("click", () => startSession({ dueOnly: true }));
  $("#againBtn").addEventListener("click", () => startSession());
  $("#quitBtn").addEventListener("click", endSession);
  $("#teachBtn").addEventListener("click", teachBack);
  $("#teachInput").addEventListener("keydown", (e) => { if (e.key === "Enter") teachBack(); });
  cv.addEventListener("pointerdown", onTap);
}
async function startSession({ dueOnly = false } = {}) {
  let queue = shuffle(concepts);
  if (dueOnly) {
    const state = await engine.getState(engine.domainId, concepts).catch(() => null);
    const dueIds = new Set((state?.dueForReview || []).map((d) => d.conceptId));
    queue = concepts.filter((c) => dueIds.has(c.conceptId));
    if (!queue.length) queue = shuffle(concepts);
  } else {
    try { const nx = await engine.getNext(engine.domainId); const first = concepts.find((c) => c.conceptId === nx?.conceptId); if (first) queue = [first, ...queue.filter((c) => c.conceptId !== first.conceptId)]; } catch {}
  }
  S = { queue: queue.slice(0, 5), qi: 0, beat: 0, built: [], tiles: [], orbs: [], bubbles: [], correctBeats: 0, totalBeats: 0, t: 0, clientMood: 0, newObject: null };
  show("screen-play"); loadBeat(); loop();
}
function concept() { return S.queue[S.qi]; }
function hud() {
  const c = concept();
  $("#hudPlace").textContent = domain?.label.en || engine.domainId;
  $("#hudConcept").textContent = c ? `${c.terms.en.term}` : "";
  $("#hudBeat").textContent = c ? `Visit ${S.qi + 1}/${S.queue.length} · ${BEATS[S.beat].name}` : "";
  $("#hudTrust").textContent = `Trust ${studio.trust} · Shelf ${studio.built.length}`;
}
function loadBeat() {
  const c = concept(); const beat = BEATS[S.beat];
  S.built = []; S.tiles = []; S.orbs = []; S.bubbles = []; S.clientMood = 0;
  $("#teachRow").hidden = beat.key !== "teachback";
  $("#feedback").textContent = ""; $("#feedback").className = "feedback";
  if (beat.key === "hear") {
    speak(c.terms.en.term, "en");
    const wrong = shuffle(concepts.filter((x) => x.conceptId !== c.conceptId)).slice(0, 2);
    S.orbs = shuffle([c, ...wrong]).map((x, i) => ({ x: 250 + i * 230, y: 300, r: 62, concept: x, label: x.definition.en }));
    $("#feedback").textContent = `You heard “${c.terms.en.term}”. Which orb means it?`;
  } else if (beat.key === "build") {
    const sentence = tgtTerm(c);
    const words = tokenize(sentence);
    const extras = shuffle(concepts.filter((x) => x.conceptId !== c.conceptId)).slice(0, 2).map((x) => tokenize(tgtTerm(x))[0]).filter(Boolean);
    S.answer = words;
    S.tiles = shuffle([...words.map((w) => ({ w, used: false })), ...extras.map((w) => ({ w, extra: true, used: false }))]);
    $("#feedback").textContent = `Build “${c.terms.en.term}” in ${targetLang === "zh" ? "中文" : "Español"} — tap tiles in order.`;
    speak(c.terms.en.term, "en");
  } else if (beat.key === "catch") {
    const ex = exampleFor(c);
    const wrongC = shuffle(concepts.filter((x) => x.conceptId !== c.conceptId))[0];
    const faithful = ex[targetLang] || ex.es;
    const distorted = faithful.includes(tgtTerm(c)) ? faithful.replace(tgtTerm(c), tgtTerm(wrongC)) : `${faithful} (más o menos)`;
    S.bubbles = shuffle([{ text: faithful, good: true }, { text: distorted, good: false }]);
    $("#feedback").textContent = `Two renderings of “${ex.en}” — one quietly betrays it. Tap the faithful one.`;
    speak(ex.en, "en");
  } else {
    $("#feedback").textContent = `Teach-back: explain “${c.terms.en.term}” below like a client is listening.`;
    $("#teachInput").value = ""; setTimeout(() => $("#teachInput").focus(), 60);
  }
  hud();
}
function finishBeat(ok, why) {
  const c = concept(); const beat = BEATS[S.beat];
  S.totalBeats++; if (ok) S.correctBeats++;
  S.clientMood = ok ? 1 : -1;
  const fb = $("#feedback"); fb.className = `feedback ${ok ? "good" : "bad"}`; fb.textContent = why;
  engine.recordEvidence({ conceptId: c.conceptId, areaId: c.areaIds[0], gameId: "concept-clinch", activityType: beat.key === "build" ? "bilingual" : beat.key === "hear" ? "terminology" : beat.key === "catch" ? "conceptual" : "conceptual", stage: beat.stage, languageDirection: beat.key === "build" ? `en->${targetLang}` : "en", correct: ok, score: ok ? 1 : 0.25, responseSummary: `Atelier ${beat.key} on ${c.conceptId}` });
  if (ok) { studio.trust += 2; Juice.good(); } else Juice.bad();
  syncBadge();
  setTimeout(() => {
    if (!S) return;
    S.beat++;
    if (S.beat >= BEATS.length) {
      // visit mastered if at least 3 of 4 beats held
      if (S.correctBeats >= 3 && !studio.built.includes(c.conceptId)) {
        studio.built.push(c.conceptId); saveStudio();
        S.newObject = OBJECTS[(studio.built.length - 1) % OBJECTS.length];
        juice.confetti(480, 180);
        $("#feedback").textContent = `Visit carried. A ${S.newObject} joins your shelf — “${c.terms.en.term}” lives here now.`;
        $("#feedback").className = "feedback good";
        hud();
        setTimeout(nextVisit, 1400); return;
      }
      nextVisit(); return;
    }
    loadBeat();
  }, 1250);
}
function nextVisit() { S.qi++; S.beat = 0; S.correctBeats = 0; if (S.qi >= S.queue.length) { endSession(); return; } loadBeat(); }
function teachBack() {
  const c = concept();
  const got = $("#teachInput").value.trim();
  if (!got) { $("#feedback").textContent = "Teach it — silence teaches nothing."; return; }
  const key = [c.terms.en.term.toLowerCase(), ...(c.definition.en.toLowerCase().split(/\W+/).filter((w) => w.length > 5).slice(0, 4))];
  const hits = key.filter((k) => got.toLowerCase().includes(k)).length;
  const ok = got.split(/\s+/).length >= 6 && hits >= 1;
  finishBeat(ok, ok ? "Taught like you own it — because now you do." : `Too thin. It means: ${c.definition.en}`);
}
function onTap(e) {
  if (!S) return;
  const beat = BEATS[S.beat];
  const r = cv.getBoundingClientRect();
  const x = (e.clientX - r.left) * (W / r.width), y = (e.clientY - r.top) * (H / r.height);
  if (beat.key === "hear") {
    const orb = S.orbs.find((o) => Math.hypot(o.x - x, o.y - y) < o.r + 8);
    if (!orb) return;
    const ok = orb.concept.conceptId === concept().conceptId;
    if (ok) juice.burst(orb.x, orb.y, "#177a6c", 18);
    finishBeat(ok, ok ? `Heard true — “${concept().terms.en.term}” means exactly that.` : `That orb is “${orb.concept.terms.en.term}”. Ears first; the term was “${concept().terms.en.term}”.`);
  } else if (beat.key === "build") {
    const i = S.tiles.findIndex((t, ti) => !t.used && Math.abs(tilePos(ti).x + 54 - x) < 62 && Math.abs(tilePos(ti).y + 20 - y) < 28);
    if (i < 0) return;
    const tile = S.tiles[i];
    const expected = S.answer[S.built.length];
    if (tile.extra || tile.w !== expected) {
      Juice.bad(); juice.shake(5);
      finishBeat(false, `“${tile.w}” doesn't belong there — the sentence is “${S.answer.join(" ")}”.`);
      return;
    }
    tile.used = true; S.built.push(tile.w); Juice.pop(); juice.burst(x, y, "#e9a13b", 8);
    if (S.built.length >= S.answer.length) finishBeat(true, `Built: “${S.answer.join(" ")}”. Your hands know it now.`);
    else hud();
  } else if (beat.key === "catch") {
    const i = S.bubbles.findIndex((b, bi) => { const r2 = bubbleRect(bi); return x >= r2.x && x <= r2.x + r2.w && y >= r2.y && y <= r2.y + r2.h; });
    if (i < 0) return;
    const b = S.bubbles[i];
    finishBeat(b.good, b.good ? "Faithful. The distinction survived you." : `That one swaps the load-bearing word — betrayal in a friendly voice. Faithful: “${S.bubbles.find((z) => z.good).text}”`);
  }
}
function tilePos(i) { const per = 5, col = i % per, row = Math.floor(i / per); return { x: 180 + col * 128, y: 408 + row * 52 }; }
function bubbleRect(i) { return { x: 90 + i * 420, y: 300, w: 370, h: 104 }; }
function loop() { if (!S) return; S.t++; draw(); juice.update(); if ($("#screen-play").classList.contains("is-active")) raf = requestAnimationFrame(loop); }
function draw() {
  const { x: sx, y: sy } = juice.shakeOffset();
  ctx.save(); ctx.translate(sx, sy);
  const c = concept(); const beat = BEATS[S.beat];
  // studio room
  ctx.fillStyle = "#f4ead8"; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#e7d6b8"; ctx.fillRect(0, 360, W, 180);
  ctx.fillStyle = "#22312c"; ctx.fillRect(0, 118, W, 8);
  // window light
  ctx.fillStyle = "#dcebe6"; ctx.fillRect(36, 28, 150, 96); ctx.strokeStyle = "#22312c"; ctx.strokeRect(36, 28, 150, 96);
  ctx.fillStyle = "#fdf3c8"; ctx.beginPath(); ctx.arc(140, 62, 18, 0, 7); ctx.fill();
  // shelf with built objects
  ctx.fillStyle = "#8a5a2e"; ctx.fillRect(560, 196, 370, 12); ctx.fillRect(560, 286, 370, 12);
  ctx.font = "800 12px 'Public Sans', sans-serif"; ctx.fillStyle = "#6b5d4f"; ctx.textAlign = "left";
  ctx.fillText("YOUR SHELF — BUILT, NOT BOUGHT", 560, 188);
  studio.built.slice(-10).forEach((id, i) => { drawObject(OBJECTS[i % OBJECTS.length], 592 + (i % 5) * 72, i < 5 ? 196 : 286, i === studio.built.length - 1 && S.newObject); });
  if (!studio.built.length) { ctx.font = "600 13px 'Public Sans', sans-serif"; ctx.fillStyle = "#9a8a72"; ctx.fillText("Empty shelves. First visit fills one.", 560, 240); }
  // client (left) + you (right of desk)
  person(150, 330, "#7a4a56", c ? "Client" : "", S.clientMood);
  person(452, 330, "#177a6c", "You", 0);
  // desk
  ctx.fillStyle = "#5f3d1c"; ctx.fillRect(96, 356, 420, 18);
  // speech bubble: current term
  if (c) {
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.roundRect(66, 236, 250, 62, 12); ctx.fill(); ctx.strokeStyle = "#22312c"; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = "#22312c"; ctx.font = "700 17px 'Public Sans', sans-serif"; ctx.textAlign = "center";
    ctx.fillText(`“${c.terms.en.term}”`, 191, 264, 230);
    ctx.font = "600 12px 'Public Sans', sans-serif"; ctx.fillStyle = "#6b5d4f";
    ctx.fillText(beat.name.toUpperCase(), 191, 284);
  }
  // beat stage
  if (c && beat.key === "hear") {
    for (const o of S.orbs) {
      ctx.fillStyle = "rgba(23,122,108,.14)"; ctx.beginPath(); ctx.arc(o.x, o.y, o.r + 10 + Math.sin(S.t * 0.05 + o.x) * 3, 0, 7); ctx.fill();
      ctx.fillStyle = "#fffdf6"; ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, 7); ctx.fill(); ctx.strokeStyle = "#22312c"; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = "#22312c"; ctx.font = "600 12px 'Public Sans', sans-serif"; ctx.textAlign = "center";
      wrap(o.label, o.x - o.r + 10, o.y - 14, o.r * 2 - 20, 15, true);
    }
  } else if (c && beat.key === "build") {
    // sentence strip
    ctx.fillStyle = "#22312c"; ctx.beginPath(); ctx.roundRect(120, 322 - 66, 720, 46, 9); ctx.fill();
    ctx.fillStyle = "#f4ead8"; ctx.font = "700 16px 'Public Sans', sans-serif"; ctx.textAlign = "left";
    ctx.fillText(S.built.join(" ") || "…", 136, 322 - 38, 690);
    S.tiles.forEach((t, i) => {
      if (t.used) return;
      const p = tilePos(i);
      ctx.fillStyle = "rgba(0,0,0,.18)"; ctx.beginPath(); ctx.roundRect(p.x + 4, p.y + 5, 108, 40, 8); ctx.fill();
      ctx.fillStyle = t.extra ? "#d8cfc0" : "#fdf6e3"; ctx.beginPath(); ctx.roundRect(p.x, p.y, 108, 40, 8); ctx.fill();
      ctx.strokeStyle = "#22312c"; ctx.lineWidth = 1.6; ctx.stroke();
      ctx.fillStyle = "#22312c"; ctx.font = "700 14px 'Public Sans', sans-serif"; ctx.textAlign = "center";
      ctx.fillText(t.w.length > 15 ? t.w.slice(0, 14) + "…" : t.w, p.x + 54, p.y + 25, 100);
    });
  } else if (c && beat.key === "catch") {
    S.bubbles.forEach((b, i) => {
      const r = bubbleRect(i);
      ctx.fillStyle = "rgba(0,0,0,.16)"; ctx.beginPath(); ctx.roundRect(r.x + 5, r.y + 7, r.w, r.h, 13); ctx.fill();
      ctx.fillStyle = "#fffdf6"; ctx.beginPath(); ctx.roundRect(r.x, r.y, r.w, r.h, 13); ctx.fill(); ctx.strokeStyle = "#22312c"; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = "#22312c"; ctx.font = "600 14px 'Public Sans', sans-serif"; ctx.textAlign = "left";
      wrap(b.text, r.x + 14, r.y + 27, r.w - 28, 18);
    });
  } else if (c) {
    ctx.fillStyle = "#22312c"; ctx.font = "600 15px 'Public Sans', sans-serif"; ctx.textAlign = "center";
    ctx.fillText("Your words, below. The client is listening.", 330, 322);
  }
  juice.draw();
  ctx.restore();
}
function person(x, y, robe, label, mood) {
  ctx.fillStyle = "rgba(0,0,0,.18)"; ctx.beginPath(); ctx.ellipse(x, y + 44, 30, 7, 0, 0, 7); ctx.fill();
  ctx.fillStyle = robe; ctx.beginPath(); ctx.moveTo(x - 24, y + 42); ctx.quadraticCurveTo(x, y - 6, x + 24, y + 42); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#f2c29b"; ctx.beginPath(); ctx.arc(x, y - 18, 14, 0, 7); ctx.fill();
  ctx.fillStyle = "#1c1410"; ctx.beginPath(); ctx.arc(x - 5, y - 20, 2, 0, 7); ctx.arc(x + 5, y - 20, 2, 0, 7); ctx.fill();
  ctx.strokeStyle = "#1c1410"; ctx.lineWidth = 2; ctx.beginPath();
  if (mood > 0) ctx.arc(x, y - 10, 6, 0.15 * Math.PI, 0.85 * Math.PI); else if (mood < 0) ctx.arc(x, y - 2, 6, 1.15 * Math.PI, 1.85 * Math.PI); else { ctx.moveTo(x - 5, y - 11); ctx.lineTo(x + 5, y - 11); }
  ctx.stroke();
  ctx.font = "700 11px 'Public Sans', sans-serif"; ctx.textAlign = "center"; ctx.fillStyle = "#6b5d4f";
  ctx.fillText(label.toUpperCase(), x, y + 60);
}
function drawObject(kind, x, baseY, fresh) {
  const y = baseY - 6; ctx.save(); ctx.translate(x, y);
  if (fresh) { ctx.fillStyle = "rgba(233,161,59,.3)"; ctx.beginPath(); ctx.arc(0, -18, 27, 0, 7); ctx.fill(); }
  ctx.fillStyle = "#22312c";
  if (kind === "lamp") { ctx.fillRect(-2, -34, 4, 26); ctx.fillStyle = "#e9a13b"; ctx.beginPath(); ctx.moveTo(-13, -34); ctx.lineTo(13, -34); ctx.lineTo(8, -50); ctx.lineTo(-8, -50); ctx.closePath(); ctx.fill(); }
  else if (kind === "plant") { ctx.fillStyle = "#a63a2e"; ctx.fillRect(-10, -14, 20, 14); ctx.strokeStyle = "#177a6c"; ctx.lineWidth = 3; for (const a of [-0.6, 0, 0.6]) { ctx.beginPath(); ctx.moveTo(0, -14); ctx.quadraticCurveTo(a * 18, -30, a * 24, -40); ctx.stroke(); } }
  else if (kind === "books") { ctx.fillStyle = "#32506b"; ctx.fillRect(-14, -30, 8, 30); ctx.fillStyle = "#7a2230"; ctx.fillRect(-5, -26, 8, 26); ctx.fillStyle = "#177a6c"; ctx.fillRect(4, -32, 8, 32); }
  else if (kind === "chair") { ctx.strokeStyle = "#5f3d1c"; ctx.lineWidth = 4; ctx.strokeRect(-13, -38, 26, 24); ctx.beginPath(); ctx.moveTo(-13, -14); ctx.lineTo(-13, 0); ctx.moveTo(13, -14); ctx.lineTo(13, 0); ctx.stroke(); }
  else if (kind === "clock") { ctx.fillStyle = "#fffdf6"; ctx.beginPath(); ctx.arc(0, -24, 15, 0, 7); ctx.fill(); ctx.strokeStyle = "#22312c"; ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, -24); ctx.lineTo(0, -34); ctx.moveTo(0, -24); ctx.lineTo(7, -20); ctx.stroke(); }
  else if (kind === "cat") { ctx.fillStyle = "#39444a"; ctx.beginPath(); ctx.ellipse(0, -8, 14, 9, 0, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(10, -18, 8, 0, 7); ctx.fill(); ctx.beginPath(); ctx.moveTo(4, -24); ctx.lineTo(6, -31); ctx.lineTo(10, -25); ctx.closePath(); ctx.fill(); }
  else { ctx.fillStyle = "#7a6a9a"; ctx.beginPath(); ctx.moveTo(-10, 0); ctx.quadraticCurveTo(-14, -26, 0, -30); ctx.quadraticCurveTo(14, -26, 10, 0); ctx.closePath(); ctx.fill(); }
  ctx.restore();
}
function wrap(text, x, y, maxW, lh, center = false) { const words = String(text).split(/\s+/); let line = "", yy = y; for (const w of words) { const test = line ? line + " " + w : w; if (ctx.measureText(test).width > maxW && line) { ctx.fillText(line, center ? x + maxW / 2 : x, yy); yy += lh; line = w; } else line = test; } if (line) ctx.fillText(line, center ? x + maxW / 2 : x, yy); }
async function endSession() {
  if (raf) cancelAnimationFrame(raf); raf = null;
  await engine.sync().catch(() => {});
  const next = await engine.getNext(engine.domainId).catch(() => null);
  $("#endTitle").textContent = studio.built.length ? "The studio keeps what you built. So does the record." : "An empty shelf is just a studio before its first true sentence.";
  $("#endStats").innerHTML = `<p style="font-size:19px;">Shelf <strong>${studio.built.length} objects</strong> · Trust <strong>${studio.trust}</strong> · Visits tonight <strong>${S?.qi || 0}</strong></p>`;
  $("#endExplain").innerHTML = `<strong>Engine next:</strong> ${esc(next?.rationale || "Work again.")}<br><span class="hint">Four proofs per concept — heard, built, defended, taught. Picking was never one of them.</span>`;
  show("screen-end"); S = null; syncBadge();
}
boot().catch((e) => { $("#titleContext").textContent = `Studio failed (${e.message}). Reload.`; $("#startBtn").disabled = true; });
