import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { startWeb } from '../src/web.mjs';

const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'mai-web-check-'));
const project = path.join(temp, 'project with spaces 中文');
const artifacts = process.env.MAI_WEB_ARTIFACT_DIR && path.resolve(process.env.MAI_WEB_ARTIFACT_DIR);
await fs.mkdir(project);
if (artifacts) await fs.mkdir(artifacts, { recursive: true });
const checks = [];
const pass = message => { checks.push(message); console.log(`OK: ${message}`); };
const web = await startWeb({ home: path.join(temp, 'personal'), project, port: 0 });
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  // Observe actual rendered angles without exposing test controls in the product.
  await context.addInitScript(() => {
    window.__cogSamples = [];
    const transform = CanvasRenderingContext2D.prototype.setTransform;
    const rotate = CanvasRenderingContext2D.prototype.rotate;
    CanvasRenderingContext2D.prototype.setTransform = function (...args) {
      if (this.canvas.classList.contains('cog-canvas')) this.__firstCog = true;
      return transform.apply(this, args);
    };
    CanvasRenderingContext2D.prototype.rotate = function (angle) {
      if (this.__firstCog) {
        this.__firstCog = false;
        window.__cogSamples.push({ angle, time: performance.now() });
        if (window.__cogSamples.length > 120) window.__cogSamples.shift();
      }
      return rotate.call(this, angle);
    };
  });
  const page = await context.newPage(), errors = [], remote = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (!request.url().startsWith(web.origin)) remote.push(request.url()); });
  const shot = async name => { if (artifacts) { const modal = await page.locator('#preview-dialog').evaluate(node => node.open); if (modal) await page.locator('#preview-dialog').evaluate(node => Promise.all(node.getAnimations().map(animation => animation.finished))); await page.screenshot({ path: path.join(artifacts, name + '.png'), fullPage: !modal }); } };
  const ready = async () => { await page.goto(web.origin + '/?ui-check=' + Date.now() + '#' + web.token); await page.locator('#project-tools input').first().waitFor({ state: 'attached' }); await page.evaluate(() => document.fonts.ready); };
  const openPreview = async () => {
    await page.locator('#preview').click();
    await page.waitForFunction(() => document.querySelector('#preview-dialog').open && !document.querySelector('#plan').hidden);
  };
  const noOverflow = async () => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await ready();
  assert.equal(await page.locator('body').getAttribute('data-view'), 'home');
  assert.equal(await page.locator('#project-view').isVisible(), false);
  await page.waitForFunction(() => document.querySelector('#cog-hero').dataset.motion === 'running');
  const imageData = () => page.locator('.cog-canvas').evaluate(canvas => canvas.toDataURL());
  assert.equal(await page.locator('#toggle-cogs').count(), 0);
  const motion = [createHash('sha256').update(await imageData()).digest('hex')];
  await shot('motion-start');
  for (const [name, duration] of [['middle',400], ['end',900]]) {
    await page.waitForTimeout(duration);
    motion.push(createHash('sha256').update(await imageData()).digest('hex'));
    await shot('motion-' + name);
  }
  assert.equal(new Set(motion).size, 3);
  const angularSpeed = () => page.evaluate(() => {
    const samples = window.__cogSamples.slice(-6), first = samples[0], last = samples.at(-1);
    return (last.angle - first.angle) / (last.time - first.time) * 1000;
  });
  await page.mouse.move(100, 470);
  await page.waitForTimeout(400);
  const baseline = await angularSpeed();
  for (let x = 150; x <= 1300; x += 50) { await page.mouse.move(x, 470); await page.waitForTimeout(40); }
  const forward = await angularSpeed();
  assert.ok(forward / baseline > 3, 'Moving right must visibly accelerate the rendered gears');
  for (let x = 1250; x >= 100; x -= 50) { await page.mouse.move(x, 470); await page.waitForTimeout(40); }
  const reverse = await angularSpeed();
  assert.ok(reverse / baseline < -1, 'Moving left must reverse the rendered gears');
  await page.waitForTimeout(3000);
  const settled = await angularSpeed();
  assert.ok(Math.abs(settled / baseline - 1) < .15, 'Stationary pointer must settle to the baseline speed');
  await page.mouse.move(100, 20);
  await page.getByRole('button', { name: '配置当前项目', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#cog-hero').dataset.motion === 'idle');
  const offscreen = await imageData();
  await page.waitForTimeout(120);
  assert.equal(await imageData(), offscreen);
  await openPreview();
  assert.equal(await page.locator('#preview-dialog').evaluate(node => node.contains(document.activeElement)), true);
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.locator('#preview-dialog').evaluate(node => node.contains(document.activeElement)), true);
  await page.getByPlaceholder('搜索文件路径').fill('no-such-file');
  assert.equal(await page.locator('.plan-row').count(), 0);
  assert.match(await page.locator('.plan-empty').textContent(), /没有匹配/);
  await page.getByPlaceholder('搜索文件路径').fill('SKILL.md');
  assert.ok(await page.locator('.plan-row').count() > 0);
  assert.ok((await page.locator('.file-path').allTextContents()).every(text => text.includes('SKILL.md')));
  await page.getByPlaceholder('搜索文件路径').fill('');
  await page.getByLabel('显示范围').selectOption('noop');
  assert.equal(await page.locator('.plan-row').count(), 0);
  await page.getByLabel('显示范围').selectOption('all');
  await page.locator('.file-content summary').first().click();
  assert.ok(await page.locator('.file-content details[open] code').first().isVisible());
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#preview-dialog').evaluate(node => node.open), false);
  assert.equal(await page.locator('#preview').evaluate(node => node === document.activeElement), true);
  pass('Default home, animated gear frames, pointer acceleration/reversal/settling and offscreen suspension, modal focus, Escape, file search, filters and link details');

  // A late preview response must not resurrect a closed dialog or stale selection.
  await page.route('**/api/plan', async route => { await new Promise(resolve => setTimeout(resolve, 350)); await route.continue(); });
  await page.locator('#preview').click();
  await page.locator('#close-preview').click();
  await page.locator('#project-tools input[value="cursor"]').check();
  await page.waitForFunction(() => !document.querySelector('#preview').hasAttribute('aria-busy'));
  assert.equal(await page.locator('#apply').isDisabled(), true);
  assert.equal(await page.locator('#preview-dialog').evaluate(node => node.open), false);
  await page.unroute('**/api/plan');
  await openPreview();
  await page.locator('#conflict-policy').selectOption('replace');
  assert.equal(await page.locator('#apply').isDisabled(), true);
  await page.locator('#refresh-preview').click();
  await page.waitForFunction(() => !document.querySelector('#apply').disabled);
  await page.route('**/api/apply', route => route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: '项目已更改，请重新预览' }) }));
  await page.locator('#apply').click();
  await page.waitForFunction(() => document.querySelector('#preview-feedback').textContent.includes('项目已更改'));
  assert.equal(await page.locator('#apply').isDisabled(), true);
  assert.equal(await page.locator('#preview-feedback').isVisible(), true);
  await page.unroute('**/api/apply');
  await page.locator('#refresh-preview').click();
  await page.waitForFunction(() => !document.querySelector('#apply').disabled);
  await page.locator('#apply').click();
  await page.waitForFunction(() => document.querySelector('#preview-dialog-title').textContent === '项目配置已应用');
  assert.equal(await page.locator('#apply').isVisible(), false);
  assert.ok(await page.locator('.initialization-hints[open]').isVisible());
  const config = JSON.parse(await fs.readFile(path.join(project, '.my-ai-infra.json')));
  assert.ok(config.tools.includes('cursor'));
  await page.locator('#cancel-preview').click();
  pass('Late-response rejection, policy invalidation, inline API error, real apply, saved config and completion hints');

  const edited = path.join(project, '.agents/assets/skills/my-create-prd/SKILL.md');
  await fs.appendFile(edited, '\nProject customization.\n');
  await openPreview();
  await page.locator('#conflict-policy').selectOption('abort');
  await page.locator('#refresh-preview').click();
  await page.waitForFunction(() => !document.querySelector('#plan').hidden && !document.querySelector('#refresh-preview').hasAttribute('aria-busy'));
  assert.equal(await page.locator('#apply').isDisabled(), true);
  assert.ok(await page.locator('.plan-row.conflict').count() > 0);
  await shot('preview-conflicts');
  await page.locator('#cancel-preview').click();
  assert.match(await fs.readFile(edited, 'utf8'), /Project customization/);
  pass('Real conflict blocks apply and preserves customized files');

  for (const width of [1440, 1280, 390, 375]) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 1000 });
    await ready();
    await noOverflow();
    const canvasBounds = await page.locator('.cog-canvas').boundingBox();
    assert.ok(Math.abs(canvasBounds.x) < 1 && Math.abs(canvasBounds.width - width) < 1, 'Hero canvas must span the viewport');
    await page.waitForTimeout(350);
    await shot('home-' + width);
    await page.getByRole('button', { name: '配置当前项目', exact: true }).click();
    await noOverflow();
    await shot('project-' + width);
    await openPreview();
    const bounds = await page.locator('#preview-dialog').boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width);
    const footer = await page.locator('.preview-footer').boundingBox();
    assert.ok(footer.y + footer.height <= (width < 768 ? 844 : 1000));
    await noOverflow();
    await shot('preview-' + width);
    await page.keyboard.press('Escape');
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await ready();
  assert.equal(await page.locator('#cog-hero').getAttribute('data-motion'), 'reduced');
  assert.equal(await page.locator('#toggle-cogs').count(), 0);
  const reducedFrame = await imageData();
  await page.waitForTimeout(200);
  assert.equal(await imageData(), reducedFrame);
  await shot('home-reduced-motion');
  assert.deepEqual(errors, []);
  assert.deepEqual(remote, []);
  pass('1440/1280/390/375 layouts, visible modal footer, reduced motion, no page errors or external requests');
  if (artifacts) await fs.writeFile(path.join(artifacts, 'report.json'), JSON.stringify({ checks, motion, pointerRates: { baseline, forward, reverse, settled }, viewports: [1440,1280,390,375] }, null, 2));
} finally {
  await browser?.close();
  await new Promise(resolve => web.server.close(resolve));
  await fs.rm(temp, { recursive: true, force: true });
}
