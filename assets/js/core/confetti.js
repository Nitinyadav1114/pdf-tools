/**
 * PDF Tools - Subtle Success Confetti & Glow Bursts
 * High-performance 60 FPS Canvas particle physics engine with zero external dependencies.
 * Respects prefers-reduced-motion and automatically garbage-collects memory on completion.
 */

let canvas = null;
let ctx = null;
let animationId = null;
let particles = [];
let glowRings = [];

const DEFAULT_COLORS = [
  '#10b981', // Emerald
  '#6366f1', // Indigo
  '#f59e0b', // Amber
  '#8b5cf6', // Violet
  '#06b6d4', // Cyan
  '#ec4899', // Pink
  '#3b82f6'  // Blue
];

/**
 * Initializes the celebration particle canvas.
 */
export function initConfetti() {
  if (typeof document === 'undefined') return;

  canvas = document.getElementById('confettiCanvas');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = 'confettiCanvas';
    canvas.className = 'fixed inset-0 pointer-events-none z-[9999]';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = '9999';
    document.body.appendChild(canvas);
  }

  ctx = canvas.getContext('2d');

  window.addEventListener('resize', () => {
    if (particles.length > 0) {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
  }, { passive: true });

  // Expose global helpers
  window.triggerSuccessBurst = triggerSuccessBurst;
  window.triggerGlowPulse = triggerGlowPulse;
}

/**
 * Spawns a delightful, subtle confetti burst radiating from an element or coordinates.
 * @param {Object} options
 * @param {HTMLElement | { x: number, y: number }} [options.origin]
 * @param {number} [options.particleCount=55]
 * @param {string[]} [options.colors]
 */
export function triggerSuccessBurst(options = {}) {
  if (typeof window === 'undefined') return;

  // Respect OS reduced motion preference
  const prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReduced) {
    if (options.origin instanceof HTMLElement) {
      triggerGlowPulse(options.origin);
    }
    return;
  }

  if (!canvas) initConfetti();
  if (!canvas || !ctx) return;

  // Determine origin coordinates
  let startX = window.innerWidth / 2;
  let startY = window.innerHeight * 0.7;

  if (options.origin instanceof HTMLElement) {
    const rect = options.origin.getBoundingClientRect();
    startX = rect.left + rect.width / 2;
    startY = rect.top + rect.height / 2;
    triggerGlowPulse(options.origin);
  } else if (options.origin && typeof options.origin.x === 'number' && typeof options.origin.y === 'number') {
    startX = options.origin.x;
    startY = options.origin.y;
  }

  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const count = options.particleCount || 55;
  const colors = options.colors || DEFAULT_COLORS;

  // Spawn confetti particles
  for (let i = 0; i < count; i++) {
    const angle = (Math.random() * 140 + 200) * (Math.PI / 180); // Upward cone (-20deg to -160deg)
    const speed = Math.random() * 12 + 6;
    const color = colors[Math.floor(Math.random() * colors.length)];
    const isRibbon = Math.random() > 0.4;

    particles.push({
      x: startX,
      y: startY,
      vx: Math.cos(angle) * speed * (Math.random() * 0.6 + 0.7),
      vy: Math.sin(angle) * speed,
      size: Math.random() * 6 + 5,
      color: color,
      rotation: Math.random() * 360,
      rotSpeed: (Math.random() - 0.5) * 12,
      wobble: Math.random() * 10,
      wobbleSpeed: Math.random() * 0.1 + 0.05,
      isRibbon: isRibbon,
      aspectRatio: isRibbon ? (Math.random() * 0.8 + 1.6) : 1,
      opacity: 1.0,
      decay: Math.random() * 0.008 + 0.007,
      gravity: 0.32,
      drag: 0.985
    });
  }

  // Spawn expanding radial glow ring
  glowRings.push({
    x: startX,
    y: startY,
    radius: 10,
    maxRadius: 120,
    opacity: 0.8,
    color: colors[0] || '#10b981'
  });

  if (!animationId) {
    animationId = requestAnimationFrame(renderLoop);
  }
}

/**
 * Triggers an animated glassmorphic glow ring around an element.
 * @param {HTMLElement} element
 */
export function triggerGlowPulse(element) {
  if (!element || !element.classList) return;

  element.classList.remove('glow-pulse-active');
  // Trigger DOM reflow to restart CSS animation cleanly
  void element.offsetWidth;
  element.classList.add('glow-pulse-active');

  setTimeout(() => {
    element.classList.remove('glow-pulse-active');
  }, 1200);
}

/**
 * 60 FPS Particle Physics and Animation Loop
 */
function renderLoop() {
  if (!ctx || !canvas) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 1. Render Glow Rings
  for (let i = glowRings.length - 1; i >= 0; i--) {
    const ring = glowRings[i];
    ring.radius += 4;
    ring.opacity -= 0.025;

    if (ring.opacity <= 0 || ring.radius >= ring.maxRadius) {
      glowRings.splice(i, 1);
      continue;
    }

    ctx.save();
    ctx.beginPath();
    ctx.arc(ring.x, ring.y, ring.radius, 0, Math.PI * 2);
    ctx.strokeStyle = ring.color;
    ctx.globalAlpha = Math.max(0, ring.opacity);
    ctx.lineWidth = 3;
    ctx.shadowBlur = 16;
    ctx.shadowColor = ring.color;
    ctx.stroke();
    ctx.restore();
  }

  // 2. Render Confetti Particles
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];

    p.x += p.vx;
    p.y += p.vy;
    p.vy += p.gravity;
    p.vx *= p.drag;
    p.vy *= p.drag;

    p.rotation += p.rotSpeed;
    p.wobble += p.wobbleSpeed;
    p.opacity -= p.decay;

    if (p.opacity <= 0 || p.y > canvas.height + 50) {
      particles.splice(i, 1);
      continue;
    }

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate((p.rotation * Math.PI) / 180);
    ctx.scale(Math.cos(p.wobble), 1);

    ctx.globalAlpha = Math.max(0, p.opacity);
    ctx.fillStyle = p.color;

    const w = p.size * p.aspectRatio;
    const h = p.size;
    ctx.fillRect(-w / 2, -h / 2, w, h);

    ctx.restore();
  }

  // If particles remain, keep RAF running; otherwise clean up memory
  if (particles.length > 0 || glowRings.length > 0) {
    animationId = requestAnimationFrame(renderLoop);
  } else {
    cancelAnimationFrame(animationId);
    animationId = null;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Zero dimensions to release buffer memory
    canvas.width = 0;
    canvas.height = 0;
  }
}
