// ENTRE VOCES — EngineClient SDK (spec §9.3 offline-first, §11.2 game contract)
// Local-first: games read/write locally first; sync is background and never
// blocks play. Same engine-core code computes state online and offline.
//
// Browser usage:
//   import { EngineClient } from "../../packages/engine-client/engine-client.js";
//   const engine = new EngineClient({ fallbackDomain, fallbackConcepts });
//   await engine.init();
//   const concepts = await engine.listConcepts(domainId);
//   engine.recordEvidence({ conceptId, stage, correct, ... }); // syncs in background
//   const next = await engine.getNext(domainId);
// In Node/tests, pass { storage: new MemoryStorage(), fetchImpl }.

function defaultStorage() {
  try {
    if (typeof localStorage !== "undefined") return localStorage;
  } catch { /* sandboxed */ }
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}
export class MemoryStorage {
  constructor() { this.m = new Map(); }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
}

function uuid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/**
 * Resolve engineUrl by precedence (spec §11.1):
 * ?engine= query → game.config engineUrl → hub localStorage → provided default.
 */
export function resolveEngineUrl({ query = "", configUrl = "", storedUrl = "", fallback = "http://127.0.0.1:8787" } = {}) {
  const fromQuery = new URLSearchParams(query).get("engine");
  return (fromQuery || configUrl || storedUrl || fallback).replace(/\/$/, "");
}
export function resolveLearnerId({ query = "", stored = "", create = true } = {}) {
  const fromQuery = new URLSearchParams(query).get("learner");
  if (fromQuery) return fromQuery;
  if (stored) return stored;
  return create ? uuid() : null;
}

export class EngineClient {
  constructor({ engineUrl = "", learnerId = "", domainId = "", storage, fetchImpl, fallbackDomain = null, fallbackConcepts = [], core = null } = {}) {
    this.storage = storage || defaultStorage();
    this.fetchImpl = fetchImpl || ((...a) => fetch(...a));
    this.core = core; // optional injected engine-core (tests); browser games import it directly
    this.fallbackDomain = fallbackDomain;
    this.fallbackConcepts = fallbackConcepts || [];
    const q = typeof location !== "undefined" ? location.search : "";
    const storedEngine = this.storage.getItem("ev:engineUrl") || "";
    const storedLearner = this.storage.getItem("ev:learnerId") || "";
    this.engineUrl = resolveEngineUrl({ query: q, configUrl: engineUrl, storedUrl: storedEngine });
    this.learnerId = learnerId || resolveLearnerId({ query: q, stored: storedLearner });
    this.domainId = domainId || new URLSearchParams(q).get("domain") || this.storage.getItem("ev:domainId") || "oregon-medical";
    this.online = false;
    this.lastSync = null;
    this.lastError = null;
  }

  async init() {
    this.storage.setItem("ev:learnerId", this.learnerId);
    this.storage.setItem("ev:engineUrl", this.engineUrl);
    this.storage.setItem("ev:domainId", this.domainId);
    if (typeof navigator !== "undefined" && "onLine" in navigator) this.online = navigator.onLine;
    if (typeof window !== "undefined") {
      window.addEventListener("online", () => { this.online = true; this.sync().catch(() => {}); });
      window.addEventListener("offline", () => { this.online = false; });
      document.addEventListener("visibilitychange", () => { if (!document.hidden) this.sync().catch(() => {}); });
    }
    await this.ping().catch(() => {});
    return this.status();
  }

  status() {
    return {
      engineUrl: this.engineUrl, learnerId: this.learnerId, domainId: this.domainId,
      online: this.online, mode: this.online ? "synced-capable" : "local-only",
      pending: this._outbox().length, lastSync: this.lastSync, lastError: this.lastError,
    };
  }

  async ping() {
    try {
      const r = await this.fetchImpl(`${this.engineUrl}/v1/health`, { signal: AbortSignal.timeout ? AbortSignal.timeout(4000) : undefined });
      this.online = r.ok;
      if (!r.ok) this.lastError = `CPE health ${r.status}`;
      return r.ok;
    } catch (e) { this.online = false; this.lastError = String(e?.message || e); return false; }
  }

  // ---- local evidence log (append-only) ----
  _logKey(domainId) { return `ev:log:${this.learnerId}:${domainId}`; }
  _outboxKey() { return `ev:outbox:${this.learnerId}`; }
  _cursorKey(domainId) { return `ev:cursor:${this.learnerId}:${domainId}`; }
  _readJSON(key, fallback) { try { const v = this.storage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } }
  _writeJSON(key, value) { this.storage.setItem(key, JSON.stringify(value)); }

  localEvidence(domainId = this.domainId) { return this._readJSON(this._logKey(domainId), []); }
  _outbox() { return this._readJSON(this._outboxKey(), []); }

  /** Record evidence locally first (never awaits network), then best-effort sync. */
  recordEvidence(partial) {
    const ev = {
      eventId: partial.eventId || uuid(),
      learnerId: this.learnerId,
      domainId: partial.domainId || this.domainId,
      conceptId: partial.conceptId,
      areaId: partial.areaId || null,
      gameId: partial.gameId || "unknown",
      activityType: partial.activityType || "terminology",
      stage: partial.stage || 1,
      languageDirection: partial.languageDirection || "en->es",
      correct: partial.correct ?? (partial.score != null ? partial.score >= 0.6 : false),
      score: partial.score == null ? (partial.correct ? 1 : 0) : partial.score,
      assistance: partial.assistance || [],
      confidence: partial.confidence == null ? 0.85 : partial.confidence,
      ...(partial.fidelity ? { fidelity: partial.fidelity } : {}),
      ...(partial.misconceptionTag ? { misconceptionTag: partial.misconceptionTag } : {}),
      ...(partial.responseSummary ? { responseSummary: String(partial.responseSummary).slice(0, 280) } : {}),
      clientTs: partial.clientTs || Date.now(),
    };
    const log = this.localEvidence(ev.domainId);
    if (!log.some((e) => e.eventId === ev.eventId)) { log.push(ev); this._writeJSON(this._logKey(ev.domainId), log); }
    const outbox = this._outbox();
    if (!outbox.some((e) => e.eventId === ev.eventId)) { outbox.push(ev); this._writeJSON(this._outboxKey(), outbox); }
    this.sync().catch(() => {});
    return ev;
  }

  /** Push outbox + pull server events; merge append-only. Safe to call anytime. */
  async sync() {
    if (!this.engineUrl) return { pushed: 0, pulled: 0, online: false };
    // push
    let pushed = 0;
    const outbox = this._outbox();
    if (outbox.length) {
      try {
        const r = await this.fetchImpl(`${this.engineUrl}/v1/evidence`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(outbox),
        });
        if (r.ok) {
          const body = await r.json();
          const acceptedIds = new Set((body.results || []).filter((x) => x.accepted).map((x) => x.eventId));
          this._writeJSON(this._outboxKey(), this._outbox().filter((e) => !acceptedIds.has(e.eventId)));
          pushed = acceptedIds.size;
          this.online = true;
        }
      } catch (e) { this.online = false; this.lastError = String(e?.message || e); }
    }
    // pull (for the bound domain; other domains pull on demand via pullDomain)
    let pulled = 0;
    try { pulled = await this.pullDomain(this.domainId); } catch { /* offline is fine */ }
    this.lastSync = Date.now();
    return { pushed, pulled, online: this.online, pending: this._outbox().length };
  }

  async pullDomain(domainId) {
    const cursor = Number(this.storage.getItem(this._cursorKey(domainId)) || 0);
    const r = await this.fetchImpl(`${this.engineUrl}/v1/evidence?learnerId=${encodeURIComponent(this.learnerId)}&domainId=${encodeURIComponent(domainId)}&since=${cursor}`);
    if (!r.ok) throw new Error(`pull ${r.status}`);
    const body = await r.json();
    const remote = body.data || [];
    if (remote.length) {
      const local = this.localEvidence(domainId);
      const byId = new Map(local.map((e) => [e.eventId, e]));
      let added = 0;
      for (const ev of remote) if (!byId.has(ev.eventId)) { byId.set(ev.eventId, ev); added++; }
      this._writeJSON(this._logKey(domainId), [...byId.values()]);
      this.storage.setItem(this._cursorKey(domainId), String(body.cursor ?? cursor));
      return added;
    }
    return 0;
  }

  // ---- knowledge (CPE → cache → bundled seed) ----
  async listDomains() {
    try {
      const r = await this.fetchImpl(`${this.engineUrl}/v1/domains?status=active`);
      if (r.ok) { const b = await r.json(); this.online = true; return b.data; }
    } catch { /* fall through */ }
    return this.fallbackDomain ? [this.fallbackDomain] : [];
  }

  async getDomain(domainId = this.domainId) {
    const cacheKey = `ev:domain:${domainId}`;
    try {
      const r = await this.fetchImpl(`${this.engineUrl}/v1/domains/${encodeURIComponent(domainId)}`);
      if (r.ok) { const d = await r.json(); this._writeJSON(cacheKey, d); this.online = true; return d; }
    } catch { /* fall through */ }
    const cached = this._readJSON(cacheKey, null);
    if (cached) return cached;
    if (this.fallbackDomain?.domainId === domainId) return this.fallbackDomain;
    return null;
  }

  async listConcepts(domainId = this.domainId, areaId = "") {
    const cacheKey = `ev:concepts:${domainId}:${areaId || "all"}`;
    try {
      const url = `${this.engineUrl}/v1/concepts?domainId=${encodeURIComponent(domainId)}${areaId ? `&areaId=${encodeURIComponent(areaId)}` : ""}&limit=200`;
      const r = await this.fetchImpl(url);
      if (r.ok) { const b = await r.json(); this._writeJSON(cacheKey, b.data); this.online = true; return b.data; }
    } catch { /* fall through */ }
    const cached = this._readJSON(cacheKey, null);
    if (cached) return cached;
    return this.fallbackConcepts.filter((c) => c.domainId === domainId && (!areaId || c.areaIds.includes(areaId)));
  }

  // ---- learner state + next (server when online, identical local math offline) ----
  async getState(domainId = this.domainId, concepts = null) {
    if (this.core) {
      const list = concepts || (await this.listConcepts(domainId));
      return this.core.computeLearnerState({ learnerId: this.learnerId, domainId, events: this.localEvidence(domainId), concepts: list });
    }
    try {
      const r = await this.fetchImpl(`${this.engineUrl}/v1/learners/${encodeURIComponent(this.learnerId)}/state?domainId=${encodeURIComponent(domainId)}`);
      if (r.ok) return r.json();
    } catch { /* fall through */ }
    throw new Error("getState needs engine-core injected (pass core) when CPE is unreachable");
  }

  async getNext(domainId = this.domainId, { excludeGameId = null, modeId = null } = {}) {
    // Prefer server only when we know local log is synced; otherwise local math
    // (identical code) avoids recommending from stale server state.
    if (this._outbox().length === 0) {
      try {
        const r = await this.fetchImpl(`${this.engineUrl}/v1/next?learnerId=${encodeURIComponent(this.learnerId)}&domainId=${encodeURIComponent(domainId)}${excludeGameId ? `&excludeGameId=${encodeURIComponent(excludeGameId)}` : ""}`);
        if (r.ok) return r.json();
      } catch { /* fall through to local */ }
    }
    if (!this.core) throw new Error("getNext needs engine-core injected (pass core) when CPE is unreachable");
    const [domain, concepts] = [await this.getDomain(domainId), await this.listConcepts(domainId)];
    const state = this.core.computeLearnerState({ learnerId: this.learnerId, domainId, events: this.localEvidence(domainId), concepts });
    return this.core.recommendNext({ domain, concepts, learnerState: state, excludeGameId, mode: modeId && this.core.modeById ? this.core.modeById(modeId) : null });
  }

  exportLocal(domainId = this.domainId) {
    return { learnerId: this.learnerId, domainId, evidence: this.localEvidence(domainId), exportedAt: new Date().toISOString() };
  }

  resetDomain(domainId = this.domainId) {
    // Start over in ONE world: its local log + cursor go; other worlds keep
    // their evidence (tenancy applies to fresh starts too). Server copy is
    // untouched unless deleted server-side — same honesty as resetLocal.
    this.storage.removeItem(this._logKey(domainId));
    this.storage.removeItem(this._cursorKey(domainId));
  }

  resetLocal() {
    // Demo integrity: clears this device's learner + logs (server copy untouched unless deleted server-side)
    this.storage.removeItem("ev:learnerId");
    for (const d of ["oregon-medical", "oregon-legal", this.domainId]) {
      this.storage.removeItem(this._logKey(d));
      this.storage.removeItem(this._cursorKey(d));
    }
    this.storage.removeItem(this._outboxKey());
  }
}
