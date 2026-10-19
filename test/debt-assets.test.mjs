import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { apply, doctor, plan } from '../src/project.mjs';
import { catalog, defaultConfig, importAsset, PACKAGE, TOOLS } from '../src/store.mjs';
import { files, json, readJSON, write } from '../src/fs.mjs';

const name = 'my-analyze-debt';
const resources = ['SKILL.md', 'references/debt-taxonomy.md', 'assets/templates/DEBT_ANALYSIS.tmpl.md', 'references/report-output.md'];
const chosen = { version: 1, tools: Object.keys(TOOLS), skills: [name] };
const relative = resource => `.agents/skills/${name}/${resource}`;

async function fixture(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'mai-debt-assets-')));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const home = path.join(root, 'personal'), project = path.join(root, '项目 with spaces');
  await fs.mkdir(project);
  return { root, home, project };
}

test('debt analysis installs alone with local resources and four movable discovery entries', async t => {
  const { root, home, project } = await fixture(t);
  const asset = (await catalog(home)).find(item => item.name === name);
  assert.ok(asset);
  assert.equal(asset.category, 'support');
  assert.equal(asset.core, false);
  assert.equal(asset.default, false);
  assert.deepEqual(asset.aliases, []);
  assert.ok(defaultConfig().skills.includes(name));
  const preview = await plan(home, project, chosen);
  assert.deepEqual(await fs.readdir(project), []);
  const installed = await apply(home, project, chosen, preview.revision);
  assert.equal(installed.complete, true);
  assert.deepEqual(installed.config.skills, [name]);
  for (const tool of chosen.tools) {
    const entries = installed.discovery.filter(entry => entry.type === 'skills' && entry.tool === tool);
    assert.deepEqual(entries.map(entry => entry.name), [name]);
    assert.equal(entries[0].status, 'ready');
    assert.equal(entries[0].hostVerified, false);
  }
  for (const dependency of ['my-create-feature', 'my-create-memory', 'my-review-code']) {
    await assert.rejects(fs.lstat(path.join(project, '.agents/skills', dependency)), { code: 'ENOENT' });
  }
  const moved = path.join(root, 'moved 项目');
  await fs.rename(project, moved);
  for (const resource of resources) {
    const source = path.join(moved, relative(resource));
    assert.ok((await fs.lstat(source)).isFile());
    assert.deepEqual(await fs.readFile(source), await fs.readFile(path.join(PACKAGE, 'assets/skills', name, resource)));
    for (const prefix of Object.values(TOOLS)) {
      const entry = path.join(moved, prefix, name, resource);
      assert.equal(await fs.realpath(entry), source);
      if (prefix !== TOOLS.codex) assert.equal(path.isAbsolute(await fs.readlink(entry)), false);
    }
  }
  // Resolve the installed instruction's actual links, without other Skills available.
  const entry = path.join(moved, relative('SKILL.md'));
  const body = (await fs.readFile(entry, 'utf8')).replace(/```[\s\S]*?```/g, '');
  const localTargets = [...body.matchAll(/\]\(([^)]+)\)/g)].map(match => match[1]).filter(target => !target.includes('://') && !target.startsWith('#'));
  for (const resource of resources.slice(1)) assert.ok(localTargets.includes(resource), `Missing installed resource link: ${resource}`);
  for (const target of localTargets) {
    const resolved = path.resolve(path.dirname(entry), decodeURIComponent(target.split('#')[0]));
    assert.ok(resolved.startsWith(path.dirname(entry) + path.sep), `Standalone dependency escapes the Skill: ${target}`);
    await fs.access(resolved);
  }
  assert.equal((await apply(home, moved)).recovery, null);
  assert.equal((await doctor(home, moved)).healthy, true);
});

test('sync preserves a pinned old selection, project debt template and existing analysis report', async t => {
  const { home, project } = await fixture(t);
  const previous = { ...chosen, skills: ['my-create-feature'] };
  const override = 'mai-specs/_templates/DEBT_ANALYSIS.tmpl.md';
  const report = 'docs/debt/订单-2026-10-18.md';
  await write(project, override, '# 团队模板\n保留人工决定来源。\n');
  await write(project, report, '# 已有债务分析\nD-007：人工批注，等待证据。\n');
  await write(home, 'defaults.json', json(previous));
  await apply(home, project);
  await apply(home, project);
  assert.deepEqual((await readJSON(project, '.my-ai-infra.json')).skills, previous.skills);
  await assert.rejects(fs.lstat(path.join(project, relative('SKILL.md'))), { code: 'ENOENT' });
  await apply(home, project, chosen);
  await apply(home, project);
  assert.deepEqual((await readJSON(home, 'defaults.json')).skills, previous.skills);
  assert.equal(await fs.readFile(path.join(project, override), 'utf8'), '# 团队模板\n保留人工决定来源。\n');
  assert.equal(await fs.readFile(path.join(project, report), 'utf8'), '# 已有债务分析\nD-007：人工批注，等待证据。\n');
});

test('customized debt templates use existing abort, merge and backed-up replace semantics', async t => {
  const { home, project } = await fixture(t);
  await apply(home, project, chosen);
  const target = relative(resources[2]), filename = path.join(project, target);
  const original = await fs.readFile(filename, 'utf8'), edited = original + '\n团队审查补充。\n';
  await fs.writeFile(filename, edited);
  const beforeState = await fs.readFile(path.join(project, '.my-ai-infra/state.json'));
  await assert.rejects(apply(home, project, undefined, undefined, { conflict: 'abort' }), /Conflicting files/);
  assert.deepEqual(await fs.readFile(path.join(project, '.my-ai-infra/state.json')), beforeState);
  assert.equal(await fs.readFile(filename, 'utf8'), edited);
  const merged = await apply(home, project, undefined, undefined, { conflict: 'merge' });
  assert.equal(await fs.readFile(filename, 'utf8'), edited);
  assert.equal(await fs.readFile(path.join(merged.recovery, 'incoming', target), 'utf8'), original);
  for (const prefix of Object.values(TOOLS)) assert.equal(await fs.readFile(path.join(project, prefix, name, resources[2]), 'utf8'), edited);
  const replaced = await apply(home, project, undefined, undefined, { conflict: 'replace' });
  assert.equal(await fs.readFile(filename, 'utf8'), original);
  assert.equal(await fs.readFile(path.join(replaced.recovery, 'before', target), 'utf8'), edited);
  assert.equal((await doctor(home, project)).healthy, true);
});

test('same-name personal debt Skill is rejected before import or project installation writes', async t => {
  const { root, home, project } = await fixture(t);
  const custom = path.join(root, name);
  const body = `---\nname: ${name}\ndescription: User-owned analysis\n---\nKeep my decisions.\n`;
  await write(custom, 'SKILL.md', body);
  await assert.rejects(importAsset(home, custom), /Builtin Skill is read-only/);
  assert.equal(await fs.readFile(path.join(custom, 'SKILL.md'), 'utf8'), body);
  await assert.rejects(fs.lstat(home), { code: 'ENOENT' });
  await write(home, `assets/skills/${name}/SKILL.md`, body);
  await assert.rejects(plan(home, project, chosen), /conflicts with builtin/);
  assert.deepEqual(await files(project), []);
  assert.equal(await fs.readFile(path.join(home, `assets/skills/${name}/SKILL.md`), 'utf8'), body);
});
