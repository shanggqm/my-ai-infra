import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { apply, plan, projectConfig } from '../src/project.mjs';
import { catalog, config, importAsset, saveAsset, seed, TOOLS } from '../src/store.mjs';
import { hash, json, read, write } from '../src/fs.mjs';
import { startWeb } from '../src/web.mjs';

const exec = promisify(execFile);
const retired = 'my-verify-feature';
const body = `---\nname: ${retired}\ndescription: Previous verification workflow\n---\nRetained personal content.\n`;
const choice = skills => ({ version: 1, tools: Object.keys(TOOLS), skills });
async function fixture(t, { linked = false, sole = false } = {}) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'my-ai-infra-retired-')));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const home = path.join(root, 'personal'), project = path.join(root, 'project');
  const selected = choice(sole ? [retired] : ['my-review-code', retired]);
  await write(home, `assets/skills/${retired}/SKILL.md`, body);
  await write(home, `runtime/assets/skills/${retired}/SKILL.md`, body);
  await write(home, 'defaults.json', json(selected));
  await write(project, '.my-ai-infra.json', json(selected));
  const owned = {};
  for (const prefix of Object.values(TOOLS)) {
    const target = `${prefix}/${retired}/SKILL.md`;
    if (linked && prefix !== TOOLS.codex) {
      const link = path.posix.relative(path.posix.dirname(target), `${TOOLS.codex}/${retired}/SKILL.md`);
      await fs.mkdir(path.dirname(path.join(project, target)), { recursive: true });
      await fs.symlink(link, path.join(project, target));
      owned[target] = { kind: 'symlink', target: link, hash: hash(link) };
    } else {
      await write(project, target, body);
      owned[target] = { kind: 'file', hash: hash(body) };
    }
  }
  await write(project, '.my-ai-infra/state.json', json({ version: 1, files: owned }));
  await write(project, 'mai-specs/FEATURE_LAYOUT.json', '{"custom":"preserve old acceptance contract"}\n');
  await write(project, 'mai-specs/999-existing/review/acceptance.md', '# Historical acceptance evidence\n');
  return { home, project, selected };
}

for (const linked of [false, true]) test(`retired verification upgrades safely across four adapters (${linked ? 'links' : 'copies'})`, async t => {
  const { home, project, selected } = await fixture(t, { linked });
  assert.ok(!(await catalog(home)).some(a => a.name === retired));
  const preview = await plan(home, project);
  assert.deepEqual(preview.config.skills, ['my-review-code']);
  assert.equal(preview.actions.filter(a => a.path.includes(`/${retired}/`) && a.action === 'remove').length, 4);
  assert.equal(await read(project, '.my-ai-infra.json'), json(selected));
  assert.equal(await read(home, 'defaults.json'), json(selected));
  await apply(home, project, preview.config, preview.revision);
  for (const prefix of Object.values(TOOLS)) {
    await assert.rejects(fs.lstat(path.join(project, prefix, retired, 'SKILL.md')), { code: 'ENOENT' });
  }
  assert.deepEqual((await projectConfig(home, project)).skills, ['my-review-code']);
  assert.deepEqual(JSON.parse(await read(home, 'defaults.json')).skills, ['my-review-code']);
  assert.equal(await read(home, `assets/skills/${retired}/SKILL.md`), body);
  assert.equal(await read(home, `runtime/assets/skills/${retired}/SKILL.md`), body);
  const { catalog: runtimeCatalog } = await import(pathToFileURL(path.join(home, 'runtime/src/store.mjs')));
  const runtime = await runtimeCatalog(home);
  assert.ok(!runtime.some(a => a.name === retired));
  assert.equal(await read(project, 'mai-specs/FEATURE_LAYOUT.json'), '{"custom":"preserve old acceptance contract"}\n');
  assert.equal(await read(project, 'mai-specs/999-existing/review/acceptance.md'), '# Historical acceptance evidence\n');
});

test('modified retired project files stop removal without changing preferences', async t => {
  const { home, project, selected } = await fixture(t);
  const target = `.agents/skills/${retired}/SKILL.md`, edited = body + '\nProject change.\n';
  await write(project, target, edited);
  await assert.rejects(apply(home, project), /Conflicting files/);
  assert.equal(await read(project, target), edited);
  assert.equal(await read(project, '.my-ai-infra.json'), json(selected));
  assert.equal(await read(home, 'defaults.json'), json(selected));
  assert.equal(await read(project, `.claude/skills/${retired}/SKILL.md`), body);
});

test('sole retired selection stays editable through Web and explicit CLI replacement', async t => {
  const { home, project } = await fixture(t, { sole: true });
  await assert.rejects(plan(home, project), /No available Skill/);
  await seed(home);
  assert.deepEqual((await projectConfig(home, project)).skills, []);
  const web = await startWeb({ home, project, port: 0 });
  t.after(() => new Promise(resolve => web.server.close(resolve)));
  const headers = { 'X-My-Ai-Token': web.token, 'Content-Type': 'application/json' };
  const response = await fetch(web.origin + '/api/state', { headers });
  assert.equal(response.status, 200);
  const state = await response.json();
  assert.deepEqual(state.defaults.skills, []);
  assert.deepEqual(state.config.skills, []);
  assert.ok(!state.assets.some(a => a.name === retired));
  const updated = await fetch(web.origin + '/api/defaults', { method: 'POST', headers, body: JSON.stringify({ previous: state.defaults, config: choice(['my-review-code']) }) });
  assert.equal(updated.status, 200);
  assert.deepEqual((await updated.json()).skills, ['my-review-code']);
  await exec(process.execPath, ['bin/my-ai-infra.mjs', 'sync', '--home', home, '--project', project, '--skills', 'my-review-code']);
  assert.deepEqual((await projectConfig(home, project)).skills, ['my-review-code']);
  assert.equal(await read(project, `.agents/assets/skills/${retired}/SKILL.md`), null);
});

test('fresh templates omit acceptance and retired identities cannot be reintroduced', async t => {
  const { home } = await fixture(t);
  const layout = JSON.parse(await fs.readFile(new URL('../assets/skills/my-create-feature/template/FEATURE_LAYOUT.json', import.meta.url), 'utf8'));
  assert.ok(!layout.artifacts.some(a => a.id === 'acceptance' || a.skill === retired));
  await assert.rejects(config(choice([retired]), home), /No available Skill/);
  await assert.rejects(saveAsset(home, retired, body, hash(body)), /Removed Skill/);
  await assert.rejects(importAsset(home, path.join(home, 'assets/skills', retired)), /Removed Skill/);
});
