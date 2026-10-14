// Cog Train visual reference: user-supplied Originkit snippet, 2026-10-14.
// Native Canvas 2D implementation; source/provenance is recorded in THIRD_PARTY_NOTICES.md.
// Approved preset: Accent Mix / Density / Size / Speed / Hover / Seed,
// and Cog variation / tooth depth / stroke, matching the supplied controls.
const PRESET = { accentMix: 68, density: 80, size: 70, speed: 100, hover: 200, seed: 1, variation: 23, toothDepth: 100, stroke: 3 };
const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function train(width, height) {
  // Shared tooth module keeps differently sized gears compatible at their pitch circles.
  const module = 2 * PRESET.size / 16 * (width < 768 ? .6 : 1);
  const add = module * .95 * PRESET.toothDepth / 100, cogs = [];
  let seed = PRESET.seed, area = 0;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const clear = (x, y, radius, parent) => cogs.every((cog, index) => index === parent || Math.hypot(x - cog.x, y - cog.y) > radius + cog.radius + add * 2 + 2);
  const count = () => Math.round(16 * 2 ** (PRESET.variation / 100 * (random() * 2 - 1)));
  for (let attempt = 0; attempt < 10000 && cogs.length < 180 && area < width * height * PRESET.density / 100; attempt++) {
    const teeth = count(), radius = teeth * module / 2;
    const parent = cogs.length && attempt % 50 !== 0 ? Math.floor(random() * cogs.length) : -1;
    const angle = random() * TAU, previous = cogs[parent];
    const x = previous ? previous.x + Math.cos(angle) * (radius + previous.radius) : random() * width;
    const y = previous ? previous.y + Math.sin(angle) * (radius + previous.radius) : random() * height;
    if (x < -radius / 2 || y < -radius / 2 || x > width + radius / 2 || y > height + radius / 2 || !clear(x, y, radius, parent)) continue;
    const theta = previous ? angle + Math.PI - (Math.PI - previous.teeth * (angle - previous.theta)) / teeth : random() * TAU;
    const omega = (previous ? -Math.sign(previous.omega) : random() < .5 ? -1 : 1) * 18 / radius;
    cogs.push({ x, y, radius, teeth, theta, omega, tone: (random() < PRESET.accentMix / 100 ? 0 : 2) + Math.floor(random() * 2), path: cogPath(radius, teeth, add) });
    const tip = radius + add;
    const clippedWidth = Math.max(0, Math.min(width, x + tip) - Math.max(0, x - tip));
    const clippedHeight = Math.max(0, Math.min(height, y + tip) - Math.max(0, y - tip));
    area += Math.PI / 4 * clippedWidth * clippedHeight;
  }
  return cogs;
}

function cogPath(radius, teeth, add) {
  const path = new Path2D(), samples = teeth * 16;
  for (let i = 0; i <= samples; i++) {
    const angle = i / samples * TAU;
    const phase = (i / samples * teeth) % 1;
    const flank = clamp((2 * Math.min(phase, 1 - phase) - .22) / .38, 0, 1);
    const tooth = 1 - 2 * flank * flank * (3 - 2 * flank);
    const r = radius + add * tooth * (tooth < 0 ? 1.3 : 1);
    const x = Math.cos(angle) * r, y = Math.sin(angle) * r;
    if (i === 0) path.moveTo(x, y); else path.lineTo(x, y);
  }
  path.closePath();
  path.moveTo(radius * .24, 0); path.arc(0, 0, radius * .24, 0, TAU);
  for (let i = 0; i < 8; i++) {
    const angle = i * TAU / 8;
    path.moveTo(Math.cos(angle) * radius * .24, Math.sin(angle) * radius * .24);
    path.lineTo(Math.cos(angle) * (radius - add * 1.3), Math.sin(angle) * (radius - add * 1.3));
  }
  return path;
}

export function mountCogTrain(host) {
  const canvas = host.querySelector('canvas'), context = canvas.getContext('2d');
  if (!context) { host.dataset.motion = 'unavailable'; return; }
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const pointer = matchMedia('(hover: hover) and (pointer: fine)');
  let width = 0, height = 0, dpr = 1, cogs = [], clock = 0, raf = 0, last = 0;
  let visible = false, drive = 0, velocity = 0, pointerX = null, previousX = null;
  let colors = [], background, copyBounds;
  const canRun = () => visible && !reduced.matches && !document.hidden && document.body.dataset.view === 'home';
  const readColors = () => {
    const style = getComputedStyle(host);
    colors = ['--bxy-color-brand', '--bxy-color-brand-light', '--bxy-color-gear-soft', '--bxy-color-gear-pale'].map(name => style.getPropertyValue(name).trim());
    background = style.getPropertyValue('--bxy-color-hero-background').trim();
  };
  function draw() {
    if (!width || !height) return;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.globalAlpha = 1; context.fillStyle = background; context.fillRect(0, 0, width, height);
    context.lineWidth = PRESET.stroke * (width < 768 ? .65 : 1);
    context.lineJoin = 'round'; context.lineCap = 'round';
    for (const cog of cogs) {
      context.save(); context.translate(cog.x, cog.y); context.rotate(cog.theta + cog.omega * clock);
      context.strokeStyle = colors[cog.tone]; context.stroke(cog.path); context.restore();
    }
    // Clear the reading area with the same light surface; preserve gears at the edges.
    if (copyBounds) {
      const { x, y, rx, ry } = copyBounds;
      context.save(); context.translate(x, y); context.scale(rx, ry);
      const veil = context.createRadialGradient(0, 0, .25, 0, 0, 1);
      veil.addColorStop(0, background); veil.addColorStop(.58, background); veil.addColorStop(1, background + '00');
      context.fillStyle = veil; context.fillRect(-1, -1, 2, 2); context.restore();
    }
  }
  function stop() { cancelAnimationFrame(raf); raf = 0; last = 0; velocity = drive = 0; pointerX = previousX = null; }
  function frame(now) {
    if (!canRun()) { stop(); return; }
    if (!last) last = now;
    const elapsed = now - last;
    // Bound work to 30 fps, including high-refresh displays.
    if (elapsed >= 1000 / 30) {
      const dt = Math.min(elapsed / 1000, .08); last = now;
      // Sample displacement once per frame so event frequency cannot weaken the crank.
      const speed = pointerX !== null && previousX !== null ? (pointerX - previousX) / dt : 0;
      previousX = pointerX;
      velocity += (speed - velocity) * (1 - Math.exp(-dt / .05));
      const target = pointerX === null ? 0 : clamp(velocity / 1200, -1, 1);
      const response = Math.abs(target) > Math.abs(drive) ? .1 : .45;
      drive += (target - drive) * (1 - Math.exp(-dt / response));
      clock += dt * (PRESET.speed / 50 + PRESET.hover / 100 * 8 * drive);
      draw();
    }
    raf = requestAnimationFrame(frame);
  }
  function sync() {
    host.dataset.motion = reduced.matches ? 'reduced' : canRun() ? 'running' : 'idle';
    if (canRun()) { if (!raf) raf = requestAnimationFrame(frame); }
    else { stop(); draw(); }
  }
  function resize() {
    const rect = host.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const nextDpr = Math.min(rect.width < 768 ? 1.5 : 2, devicePixelRatio || 1);
    if (rect.width !== width || rect.height !== height || nextDpr !== dpr) {
      width = rect.width; height = rect.height; dpr = nextDpr;
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      cogs = train(width, height);
    }
    const copy = host.querySelector('.hero-copy').getBoundingClientRect();
    copyBounds = { x: copy.x - rect.x + copy.width / 2, y: copy.y - rect.y + copy.height / 2, rx: copy.width * .8, ry: copy.height * .95 };
    readColors(); draw(); sync();
  }
  const observer = new ResizeObserver(resize); observer.observe(host); observer.observe(host.querySelector('.hero-copy'));
  const intersection = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; sync(); }, { threshold: .05 }); intersection.observe(host);
  host.addEventListener('pointermove', event => {
    if (!pointer.matches || !canRun()) return;
    // Include the title and CTA area; establish a fresh baseline on entry.
    if (pointerX === null) previousX = event.clientX;
    pointerX = event.clientX;
  }, { passive: true });
  host.addEventListener('pointerleave', () => { pointerX = previousX = null; });
  reduced.addEventListener('change', sync);
  document.addEventListener('visibilitychange', sync);
  window.addEventListener('mai:viewchange', sync);
  window.addEventListener('pagehide', stop);
  window.addEventListener('pageshow', sync);
  resize();
}
