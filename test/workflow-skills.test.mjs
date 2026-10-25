import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { apply, plan, doctor } from '../src/project.mjs';
import { allAssets, defaultConfig, importAsset, setup, PACKAGE, TOOLS, GLOBAL_TOOLS } from '../src/store.mjs';
import { SHORTCUT_SKILLS } from '../src/names.mjs';
import { hash, json, read, readJSON, write } from '../src/fs.mjs';

const exec = promisify(execFile);
const chosen = { ...defaultConfig(), tools: Object.keys(TOOLS) };
async function fixture(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'mai-workflows-')));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const home = path.join(root, 'home'), project = path.join(root, '项目 with spaces'), toolHome = path.join(root, 'tools');
  await fs.mkdir(project); await fs.mkdir(toolHome);
  return { root, home, project, toolHome };
}
async function legacy(project, home, { tracked = true } = {}) {
  const state = { version: 4, files: {} };
  await write(project, '.my-ai-infra.json', json({ ...chosen, skills: ['my-create-feature'] }));
  for (const name of [...SHORTCUT_SKILLS, 'team-old']) {
    const source = `.agents/prompts/${name}.md`, body = 'Changed old prompt\n';
    await write(project, source, body);
    state.files[source] = { kind: 'file', hash: hash('Original old prompt\n'), preserve: true };
    await write(project, `.agents/skills/${name}/SKILL.md`, `Read [body](../../prompts/${name}.md).\nCustomized wrapper.\n`);
    await write(project, `.agents/skills/${name}/agents/openai.yaml`, 'old policy\n');
    for (const target of [`.codex/prompts/${name}.md`, `.claude/commands/${name}.md`, `.cursor/commands/${name}.md`, `.github/prompts/${name}.prompt.md`]) {
      await write(project, target, 'Changed native command\n');
      state.files[target] = { kind: 'file', hash: hash('Original command\n') };
    }
  }
  await write(project, '.agents/assets/prompts/old/asset.json', 'invalid old manifest');
  await write(project, '.claude/commands/unrelated.md', 'Keep this command\n');
  await write(project, '.agents/skills/team-kept/SKILL.md', 'Keep this unrelated Skill\n');
  await write(project, '.agents/prompts/team-kept.md', 'Discard a Prompt with the same name as a normal Skill\n');
  await write(home, 'assets/prompts/broken/asset.json', 'invalid library prompt');
  if (tracked) await write(project, '.my-ai-infra/state.json', json(state));
}
async function checkSkills(project, global = false) {
  for (const name of SHORTCUT_SKILLS) {
    for (const file of ['SKILL.md', 'agents/openai.yaml']) {
      const source = path.join(project, '.agents/skills', name, file);
      assert.ok((await fs.lstat(source)).isFile());
      assert.equal(await fs.readFile(source, 'utf8'), await read(PACKAGE, `assets/skills/${name}/${file}`));
      for (const prefix of Object.values(global ? GLOBAL_TOOLS : TOOLS)) assert.equal(await fs.realpath(path.join(project, prefix, name, file)), source);
    }
    assert.match(await read(project, `.agents/skills/${name}/SKILL.md`), /disable-model-invocation: true/);
    assert.match(await read(project, `.agents/skills/${name}/agents/openai.yaml`), /allow_implicit_invocation: false/);
  }
}

test('four workflows install as ordinary selectable Skills and survive moving and repeated sync', async t => {
  const { root, home, project } = await fixture(t);
  const assets = await allAssets(home);
  assert.ok(assets.every(asset => asset.type !== 'prompts'));
  assert.equal(assets.filter(asset => asset.category === 'workflow').length, 4);
  const installed = await apply(home, project, chosen);
  assert.ok(installed.discovery.every(entry => entry.type !== 'prompts'));
  await checkSkills(project);
  await assert.rejects(fs.lstat(path.join(project, '.agents/prompts')), { code: 'ENOENT' });
  const moved = path.join(root, 'moved 项目'); await fs.rename(project, moved);
  await checkSkills(moved);
  assert.equal((await apply(home, moved)).recovery, null);
  assert.equal((await doctor(home, moved)).healthy, true);
  await apply(home, moved, { ...chosen, skills: ['my-init-repo-memory'] });
  assert.deepEqual((await readJSON(moved, '.my-ai-infra.json')).skills, ['my-init-repo-memory']);
  await assert.rejects(fs.lstat(path.join(moved, '.agents/skills/my-auto-feature')), { code: 'ENOENT' });
});

for (const policy of ['merge', 'replace', 'abort']) test(`init discards customized legacy Prompts and replaces wrappers (${policy})`, async t => {
  const { home, project } = await fixture(t);
  await legacy(project, home);
  const preview = await plan(home, project, undefined, { conflict: policy });
  assert.ok(preview.actions.some(action => action.path === '.agents/prompts' && action.action === 'remove'));
  assert.equal(await read(project, '.agents/prompts/my-auto-feature.md'), 'Changed old prompt\n');
  assert.equal((await doctor(home, project)).healthy, false);
  const output = await exec(process.execPath, [path.join(PACKAGE, 'bin/my-ai-infra.mjs'), 'init', '--home', home, '--project', project, '--yes', '--conflict', policy]);
  const result = JSON.parse(output.stdout);
  assert.equal(result.complete, true);
  await checkSkills(project);
  assert.deepEqual(new Set(result.config.skills), new Set(['my-create-feature', ...SHORTCUT_SKILLS]));
  for (const directory of ['.agents/prompts', '.agents/assets/prompts', '.codex/prompts', '.github/prompts', '.agents/skills/team-old']) await assert.rejects(fs.lstat(path.join(project, directory)), { code: 'ENOENT' });
  for (const name of [...SHORTCUT_SKILLS, 'team-old']) for (const directory of ['.claude/commands', '.cursor/commands']) await assert.rejects(fs.lstat(path.join(project, directory, name + '.md')), { code: 'ENOENT' });
  assert.equal(await read(project, '.claude/commands/unrelated.md'), 'Keep this command\n');
  assert.equal(await read(project, '.agents/skills/team-kept/SKILL.md'), 'Keep this unrelated Skill\n');
  await assert.rejects(fs.lstat(path.join(home, 'assets/prompts')), { code: 'ENOENT' });
  assert.ok(Object.keys((await readJSON(project, '.my-ai-infra/state.json')).files).every(file => !file.includes('/prompts/') && !file.includes('/team-old/')));
  assert.equal((await apply(home, project)).recovery, null);
  assert.equal((await doctor(home, project)).healthy, true);
});

test('untracked Prompt remnants are discarded; later ordinary Skill customization is preserved', async t => {
  const { home, project } = await fixture(t);
  await legacy(project, home, { tracked: false });
  await apply(home, project);
  await checkSkills(project);
  const file = '.agents/skills/my-auto-feature/SKILL.md';
  await fs.appendFile(path.join(project, file), '\nNew Skill customization\n');
  await apply(home, project, undefined, undefined, { conflict: 'merge' });
  assert.match(await read(project, file), /New Skill customization/);
});

test('preview rejects changed discarded content and failed apply restores old files and state', async t => {
  const { home, project } = await fixture(t);
  await legacy(project, home);
  const preview = await plan(home, project);
  await write(project, '.agents/prompts/late.md', 'Concurrent edit\n');
  await assert.rejects(apply(home, project, undefined, preview.revision), /changed since preview/);
  assert.equal(await read(project, '.agents/prompts/late.md'), 'Concurrent edit\n');
  const state = await read(project, '.my-ai-infra/state.json');
  const rename = fs.rename; let failed = false;
  fs.rename = async (from, to) => {
    if (!failed && to === path.join(project, '.my-ai-infra.json')) { failed = true; throw Error('injected write failure'); }
    return rename(from, to);
  };
  try { await assert.rejects(apply(home, project), /injected write failure/); }
  finally { fs.rename = rename; }
  assert.equal(await read(project, '.my-ai-infra/state.json'), state);
  assert.equal(await read(project, '.agents/prompts/late.md'), 'Concurrent edit\n');
  assert.match(await read(project, '.agents/skills/my-auto-feature/SKILL.md'), /Customized wrapper/);
  await apply(home, project);
  assert.equal((await doctor(home, project)).healthy, true);
});

test('retired directories and Skill file links never mutate external targets', async t => {
  const { root, home, project } = await fixture(t);
  const outside = path.join(root, 'outside'); await fs.mkdir(outside);
  await write(outside, 'private.md', 'External content\n');
  await fs.mkdir(path.join(project, '.agents/skills/my-auto-feature'), { recursive: true });
  await fs.symlink(outside, path.join(project, '.agents/prompts'));
  await fs.symlink(path.join(outside, 'private.md'), path.join(project, '.agents/skills/my-auto-feature/SKILL.md'));
  await apply(home, project, chosen);
  await checkSkills(project);
  assert.equal(await read(outside, 'private.md'), 'External content\n');
  assert.deepEqual(await fs.readdir(outside), ['private.md']);
  await assert.rejects(fs.lstat(path.join(project, '.agents/prompts')), { code: 'ENOENT' });
});

test('retired Prompt libraries are ignored by reads, rejected on import and removed without following links', async t => {
  const { root, home, project } = await fixture(t);
  const outside = path.join(root, 'outside'); await fs.mkdir(outside);
  await write(outside, 'unknown.md', 'External prompt\n');
  await fs.mkdir(path.join(home, 'assets'), { recursive: true });
  await fs.symlink(outside, path.join(home, 'assets/prompts'));
  assert.ok((await allAssets(home)).every(asset => asset.type !== 'prompts'));
  assert.ok((await fs.lstat(path.join(home, 'assets/prompts'))).isSymbolicLink());
  await assert.rejects(importAsset(home, path.join(outside, 'unknown.md'), 'prompts'), /Invalid asset type/);
  await apply(home, project, chosen);
  await assert.rejects(fs.lstat(path.join(home, 'assets/prompts')), { code: 'ENOENT' });
  assert.equal(await read(outside, 'unknown.md'), 'External prompt\n');
});

test('global setup replaces old workflow wrappers and discards old Prompt commands', async t => {
  const { home, toolHome } = await fixture(t);
  await legacy(toolHome, home);
  await setup(home, chosen.tools, toolHome, ['my-create-feature']);
  await checkSkills(toolHome, true);
  await assert.rejects(fs.lstat(path.join(toolHome, '.agents/prompts')), { code: 'ENOENT' });
  await assert.rejects(fs.lstat(path.join(toolHome, '.agents/skills/team-old')), { code: 'ENOENT' });
  assert.equal(await read(toolHome, '.claude/commands/unrelated.md'), 'Keep this command\n');
  await setup(home, chosen.tools, toolHome);
});

test('nested old wrappers are discarded even when their tracked source was customized', async t => {
  const { home, project } = await fixture(t);
  await legacy(project, home);
  const name = 'my-auto-feature', current = `.agents/skills/${name}/SKILL.md`, old = `.agents/assets/skills/${name}/SKILL.md`;
  const body = await read(project, current);
  await fs.unlink(path.join(project, current)); await write(project, old, body);
  const target = path.posix.relative(path.posix.dirname(current), old);
  await fs.symlink(target, path.join(project, current));
  const state = await readJSON(project, '.my-ai-infra/state.json');
  state.files[old] = { kind: 'file', hash: hash('Previous wrapper'), preserve: true };
  state.files[current] = { kind: 'symlink', target, hash: hash(target) };
  await write(project, '.my-ai-infra/state.json', json(state));
  await apply(home, project, undefined, undefined, { conflict: 'merge' });
  await checkSkills(project);
  await assert.rejects(fs.lstat(path.join(project, old)), { code: 'ENOENT' });
  assert.equal((await doctor(home, project)).healthy, true);
});

test('failed global setup restores discarded directories and previous workflow wrappers', async t => {
  const { home, toolHome } = await fixture(t);
  await legacy(toolHome, home);
  const rename = fs.rename; let failed = false;
  fs.rename = async (from, to) => {
    if (!failed && to === path.join(home, 'global-state.json')) { failed = true; throw Error('injected global write failure'); }
    return rename(from, to);
  };
  try { await assert.rejects(setup(home, chosen.tools, toolHome), /injected global write failure/); }
  finally { fs.rename = rename; }
  assert.equal(await read(toolHome, '.agents/prompts/my-auto-feature.md'), 'Changed old prompt\n');
  assert.match(await read(toolHome, '.agents/skills/my-auto-feature/SKILL.md'), /Customized wrapper/);
  await setup(home, chosen.tools, toolHome);
  await checkSkills(toolHome, true);
});

test('init with only a stale personal Prompt library promotes saved choices and keeps the preview valid', async t => {
  const { home, project } = await fixture(t);
  const pinned = { ...chosen, skills: ['my-create-feature'] };
  await write(home, 'defaults.json', json(pinned));
  await write(home, 'assets/prompts/my-auto-feature.md', 'Discard old library content\n');
  await write(project, '.my-ai-infra.json', json(pinned));
  const preview = await plan(home, project, pinned);
  assert.deepEqual((await readJSON(home, 'defaults.json')).skills, pinned.skills);
  const result = await apply(home, project, pinned, preview.revision);
  assert.equal(result.complete, true);
  await checkSkills(project);
  assert.deepEqual(new Set((await readJSON(home, 'defaults.json')).skills), new Set(['my-create-feature', ...SHORTCUT_SKILLS]));
  assert.equal((await apply(home, project)).recovery, null);
});
