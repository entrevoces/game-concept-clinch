// ENTRE VOCES game-kit — shared juice for every game (spec §26).
// Zero assets: particles, screen shake, floating text, synth SFX, confetti.
// Import from games: import { Juice } from "../../../packages/game-kit/juice.js";
//   const juice = new Juice(canvas); juice.burst(x,y,color); juice.loop hooks…
// DOM games: Juice.feedbackBurst(element) + Juice.observeFeedback("#feedback").

export class Juice {
  constructor(canvas) {
    this.cv = canvas; this.ctx = canvas?.getContext("2d");
    this.parts = []; this.floaters = []; this.shakeT = 0; this.shakeMag = 0;
  }
  burst(x, y, color = "#ffd166", n = 16, spread = 4) {
    for (let i = 0; i < n; i++) this.parts.push({ x, y, vx: (Math.random() - 0.5) * spread * 2, vy: (Math.random() - 0.7) * spread * 2, life: 26 + Math.random() * 14, col: color, r: 2 + Math.random() * 3 });
  }
  confetti(x, y) { ["#d84f35", "#e9a13b", "#0e7a68", "#7fe3c8", "#ffb347"].forEach((c, i) => this.burst(x + (i - 2) * 14, y, c, 10, 5)); }
  floatText(x, y, text, color = "#fff") { this.floaters.push({ x, y, text, color, life: 55 }); }
  shake(mag = 6) { this.shakeT = 12; this.shakeMag = mag; }
  update() {
    this.parts.forEach((p) => { p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.life--; });
    this.parts = this.parts.filter((p) => p.life > 0);
    this.floaters.forEach((f) => { f.y -= 0.7; f.life--; });
    this.floaters = this.floaters.filter((f) => f.life > 0);
    if (this.shakeT > 0) this.shakeT--;
  }
  draw() {
    if (!this.ctx) return;
    for (const p of this.parts) { this.ctx.globalAlpha = Math.max(0, p.life / 30); this.ctx.fillStyle = p.col; this.ctx.beginPath(); this.ctx.arc(p.x, p.y, p.r, 0, 7); this.ctx.fill(); }
    this.ctx.globalAlpha = 1;
    this.ctx.font = "800 19px 'Public Sans', sans-serif"; this.ctx.textAlign = "center";
    for (const f of this.floaters) { this.ctx.globalAlpha = Math.max(0, f.life / 55); this.ctx.fillStyle = f.col; this.ctx.fillText(f.text, f.x, f.y); }
    this.ctx.globalAlpha = 1;
  }
  shakeOffset() { return this.shakeT > 0 ? { x: (Math.random() - 0.5) * this.shakeMag, y: (Math.random() - 0.5) * this.shakeMag } : { x: 0, y: 0 }; }

  static _ac = null;
  static beep(freq, dur = 0.11, type = "sine", gain = 0.07, when = 0) {
    try {
      Juice._ac = Juice._ac || new (window.AudioContext || window.webkitAudioContext)();
      const ac = Juice._ac, o = ac.createOscillator(), g = ac.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(gain, ac.currentTime + when);
      g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + when + dur);
      o.connect(g).connect(ac.destination); o.start(ac.currentTime + when); o.stop(ac.currentTime + when + dur);
    } catch { /* sound is garnish */ }
  }
  static good() { Juice.beep(660, 0.1); Juice.beep(990, 0.15, "sine", 0.06, 0.07); }
  static bad() { Juice.beep(170, 0.16, "triangle", 0.05); }
  static pop() { Juice.beep(840, 0.06, "square", 0.04); }

  /** DOM games: burst of absolutely-positioned sparks over an element. */
  static feedbackBurst(el, good = true) {
    if (!el || typeof document === "undefined") return;
    const r = el.getBoundingClientRect();
    const host = document.createElement("div");
    host.style.cssText = `position:fixed;left:${r.left + r.width / 2}px;top:${r.top}px;pointer-events:none;z-index:60`;
    for (let i = 0; i < 12; i++) {
      const s = document.createElement("span");
      const col = good ? ["#0e7a68", "#e9a13b", "#2ee6a8"][i % 3] : "#d84f35";
      s.style.cssText = `position:absolute;width:7px;height:7px;border-radius:50%;background:${col};transition:all .55s ease-out`;
      host.appendChild(s);
      requestAnimationFrame(() => { s.style.transform = `translate(${(Math.random() - 0.5) * 130}px, ${-30 - Math.random() * 60}px) scale(.4)`; s.style.opacity = "0"; });
    }
    document.body.appendChild(host);
    setTimeout(() => host.remove(), 650);
  }
  /** Watch a feedback element; burst automatically on .good / shake on .bad. */
  static observeFeedback(selector) {
    const el = document.querySelector(selector);
    if (!el || typeof MutationObserver === "undefined") return;
    let last = "";
    new MutationObserver(() => {
      const sig = el.className + el.textContent;
      if (sig === last || !el.textContent) return;
      last = sig;
      if (el.classList.contains("good")) { Juice.feedbackBurst(el, true); Juice.good(); }
      if (el.classList.contains("bad")) { Juice.feedbackBurst(el, false); Juice.bad(); el.animate?.([{ transform: "translateX(0)" }, { transform: "translateX(-5px)" }, { transform: "translateX(5px)" }, { transform: "translateX(0)" }], { duration: 220 }); }
    }).observe(el, { attributes: true, childList: true, subtree: true });
  }
}
