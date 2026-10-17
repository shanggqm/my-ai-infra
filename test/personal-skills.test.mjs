import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { catalog, importAsset, saveAsset, seed, PACKAGE } from '../src/store.mjs';
import { apply, plan } from '../src/project.mjs';
import { hash, json, read, write } from '../src/fs.mjs';
import { startWeb } from '../src/web.mjs';
const exec = promisify(execFile);
const body = name => `---\nname: ${name}\ndescription: Personal workflow\norigin: builtin\n---\nMy own content.\n`;
async function fixture(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'mai-personal-')));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const home = path.join(root, 'custom home'), project = path.join(root, 'project'), source = path.join(root, 'team-skill');
  await fs.mkdir(project); await write(source, 'SKILL.md', body('team-skill'));
  await write(source, 'scripts/check.mjs', 'console.log("ok");\n');
  await write(source, 'references/workflow.md', 'Reusable workflow\n');
  return { root, home, project, source };
}
test('import persists the complete personal Skill; new projects select it and builtin editing is rejected', async t => {
  const { home, project, source } = await fixture(t);
  assert.equal((await importAsset(home, source)).origin, 'personal');
  const list = await catalog(home);
  assert.equal(list.find(a => a.name === 'team-skill').origin, 'personal');
  const builtin = list.find(a => a.name === 'my-review-design');
  assert.equal(builtin.origin, 'builtin'); assert.equal(builtin.readOnly, true);
  assert.equal(await read(home, 'assets/skills/my-review-design/SKILL.md'), null);
  await assert.rejects(saveAsset(home, builtin.name, builtin.content + '\nedit', builtin.revision), /read-only/);
  await assert.rejects(saveAsset(home, 'review-code', 'invalid', null), /read-only/);
  await assert.rejects(importAsset(home, path.join(PACKAGE, 'assets/skills/my-review-design')), /read-only/);
  await assert.rejects(importAsset(home, source), /already exists/);
  const cli = path.join(PACKAGE, 'bin/my-ai-infra.mjs');
  await exec(process.execPath, [cli, 'init', '--yes', '--project', project], { env: { ...process.env, MY_AI_INFRA_HOME: home } });
  assert.equal(await read(project, '.agents/skills/team-skill/scripts/check.mjs'), await read(source, 'scripts/check.mjs'));
  assert.equal(await read(project, '.agents/skills/team-skill/references/workflow.md'), await read(source, 'references/workflow.md'));
  await assert.rejects(exec(process.execPath, [cli, 'asset', 'edit', builtin.name, '--file', path.join(source, 'SKILL.md'), '--home', home]), /read-only/);
  await seed(home, { updateBuiltins: true });
  assert.equal(await read(home, 'assets/skills/team-skill/SKILL.md'), body('team-skill'));
});
test('Web marks origins, rejects forged builtin writes, and can create personal Skills', async t => {
  const { home, project } = await fixture(t);
  const web = await startWeb({ home, project, port: 0 });
  t.after(() => new Promise(resolve => web.server.close(resolve)));
  const headers = { 'X-My-Ai-Token': web.token, 'Content-Type': 'application/json' };
  const state = await (await fetch(web.origin + '/api/state', { headers })).json();
  const builtin = state.assets.find(a => a.name === 'my-review-code');
  assert.equal(builtin.origin, 'builtin'); assert.equal(builtin.readOnly, true);
  const post = data => fetch(web.origin + '/api/asset', { method: 'POST', headers, body: json(data) });
  assert.equal((await post({ name: builtin.name, content: builtin.content, revision: null, origin: 'personal' })).status, 400);
  assert.equal((await post({ name: 'web-skill', content: body('web-skill'), revision: null })).status, 200);
  assert.equal((await post({ name: 'web-skill', content: body('web-skill'), revision: null })).status, 400);
  assert.equal((await catalog(home)).find(a => a.name === 'web-skill').origin, 'personal');
});
test('tracked legacy copies are previewed read-only, backed up intact, and replaced by the bundle source', async t => {
  const { home, project } = await fixture(t), name = 'my-review-design';
  const original = await read(PACKAGE, `assets/skills/${name}/SKILL.md`);
  const edited = original + '\nMy custom rule.\n';
  await write(home, `assets/skills/${name}/SKILL.md`, edited);
  await write(home, `assets/skills/${name}/references/private.md`, 'Keep attachment');
  await write(home, 'bundle-state.json', json({ version: 1, files: { [`assets/skills/${name}/SKILL.md`]: hash(original) } }));
  const preview = await plan(home, project);
  assert.equal(preview.skillMigrations.length, 1);
  assert.equal(await read(home, `assets/skills/${name}/SKILL.md`), edited);
  const applied = await apply(home, project, preview.config, preview.revision);
  assert.equal(await read(home, `assets/skills/${name}/SKILL.md`), null);
  assert.equal(await read(applied.skillMigrations[0].backup, 'SKILL.md'), edited);
  assert.equal(await read(applied.skillMigrations[0].backup, 'references/private.md'), 'Keep attachment');
  assert.equal(await read(project, `.agents/skills/${name}/SKILL.md`), original);
  assert.equal((await seed(home)).skillMigrations.length, 0);
});
test('untracked namesakes block without changes', async t => {
  const { home } = await fixture(t);
  const name = 'my-review-code';
  await write(home, `assets/skills/${name}/SKILL.md`, body(name));
  await assert.rejects(catalog(home), /conflicts with builtin/);
  await assert.rejects(seed(home), /conflicts with builtin/);
  assert.equal(await read(home, `assets/skills/${name}/SKILL.md`), body(name));
  assert.equal(await read(home, 'bundle-state.json'), null);
});
test('failed complete-directory import leaves no partial Skill and retry succeeds', async t => {
  const { home, source } = await fixture(t); await seed(home);
  const rename = fs.rename;
  fs.rename = async (from, to) => {
    if (to === path.join(home, 'assets/skills/team-skill')) throw Error('injected import failure');
    return rename(from, to);
  };
  try { await assert.rejects(importAsset(home, source), /injected import failure/); }
  finally { fs.rename = rename; }
  assert.equal(await read(home, 'assets/skills/team-skill/SKILL.md'), null);
  assert.deepEqual(await fs.readdir(path.join(home, 'imports')), []);
  await importAsset(home, source);
});
test('new runtime keeps exact builtin trees while personal assets and existing project copies survive upgrades', async t => {
  const { home, source, project, root } = await fixture(t);
  await importAsset(home, source); await apply(home, project);
  await write(home, 'runtime/assets/skills/my-review-code/references/deleted.md', 'obsolete bundled file');
  await write(home, 'runtime/assets/skills/my-review-code/SKILL.md', 'old bundle');
  await write(project, '.agents/skills/my-review-code/SKILL.md', 'project customization');
  await seed(home, { updateBuiltins: true });
  assert.equal(await read(home, 'runtime/assets/skills/my-review-code/references/deleted.md'), null);
  assert.equal(await read(home, 'runtime/assets/skills/my-review-code/SKILL.md'), await read(PACKAGE, 'assets/skills/my-review-code/SKILL.md'));
  assert.equal(await read(home, 'assets/skills/team-skill/SKILL.md'), body('team-skill'));
  assert.equal(await read(project, '.agents/skills/my-review-code/SKILL.md'), 'project customization');
  const runtime = await import(pathToFileURL(path.join(home, 'runtime/src/store.mjs')));
  assert.equal((await runtime.catalog(home)).find(a => a.name === 'team-skill').origin, 'personal');
  const other = path.join(root, 'other home');
  assert.ok(!(await catalog(other)).some(a => a.name === 'team-skill'));
});

test('tool-only defaults keep newly imported Skills discoverable; explicit lists stay fixed', async t => {
  const { home, project, source, root } = await fixture(t);
  const cli = path.join(PACKAGE, 'bin/my-ai-infra.mjs');
  await exec(process.execPath, [cli, 'defaults', '--tools', 'codex', '--home', home]);
  await importAsset(home, source);
  await exec(process.execPath, [cli, 'init', '--yes', '--home', home, '--project', project]);
  assert.equal(await read(project, '.agents/skills/team-skill/SKILL.md'), body('team-skill'));
  await exec(process.execPath, [cli, 'defaults', '--skills', 'my-review-code', '--home', home]);
  const another = path.join(root, 'another'); await fs.mkdir(another);
  await exec(process.execPath, [cli, 'init', '--yes', '--home', home, '--project', another]);
  assert.equal(await read(another, '.agents/skills/team-skill/SKILL.md'), null);
  assert.equal(await read(project, '.agents/skills/team-skill/SKILL.md'), body('team-skill'));
});
test('a future bundle claiming a personal name fails before migration or runtime refresh', async t => {
  const { home, source, root } = await fixture(t);
  await importAsset(home, source);
  const next = path.join(root, 'new-package');
  for (const directory of ['src', 'assets', 'catalog']) await fs.cp(path.join(PACKAGE, directory), path.join(next, directory), { recursive: true });
  const registryPath = path.join(next, 'catalog/skills.json');
  const registry = JSON.parse(await fs.readFile(registryPath, 'utf8'));
  registry.skills.push({ name: 'team-skill', aliases: [], label: 'New builtin', category: 'support', default: false });
  await fs.writeFile(registryPath, json(registry));
  await write(next, 'assets/skills/team-skill/SKILL.md', body('team-skill') + 'Upstream version');
  const runtimeBefore = await read(home, 'runtime/assets/skills/my-review-code/SKILL.md');
  const updated = await import(pathToFileURL(path.join(next, 'src/store.mjs')));
  await assert.rejects(updated.seed(home, { updateBuiltins: true }), /conflicts with builtin/);
  assert.equal(await read(home, 'assets/skills/team-skill/SKILL.md'), body('team-skill'));
  assert.equal(await read(home, 'runtime/assets/skills/my-review-code/SKILL.md'), runtimeBefore);
});

test('failed runtime Skill replacement restores the previous complete directory', async t => {
  const { home } = await fixture(t); await seed(home);
  await write(home, 'runtime/assets/skills/my-review-code/references/old.md', 'old resource');
  const rename = fs.rename, target = path.join(home, 'runtime/assets/skills');
  fs.rename = async (from, to) => {
    if (to === target && path.basename(from).startsWith('.skills-')) throw Error('injected runtime failure');
    return rename(from, to);
  };
  try { await assert.rejects(seed(home, { updateBuiltins: true }), /injected runtime failure/); }
  finally { fs.rename = rename; }
  assert.equal(await read(home, 'runtime/assets/skills/my-review-code/references/old.md'), 'old resource');
  assert.ok(await read(home, 'runtime/assets/skills/my-review-code/SKILL.md'));
  assert.ok(!(await fs.readdir(path.join(home, 'runtime/assets'))).some(name => name.startsWith('.skills-')));
});
