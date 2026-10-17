import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { apply, doctor, plan } from '../src/project.mjs';
import { PACKAGE } from '../src/store.mjs';
import { inspectEntry } from '../src/conflicts.mjs';
import { startWeb } from '../src/web.mjs';
import { snapshot } from '../src/entries.mjs';
import { json, write } from '../src/fs.mjs';

const tools = ['codex', 'claudecode', 'cursor', 'copilot'];
const prefixes = ['.agents/skills', '.claude/skills', '.cursor/skills', '.github/skills'];
const selected = { version: 1, tools, skills: ['my-create-prd', 'my-create-feature', 'my-review-code'] };
const reduced = { ...selected, skills: ['my-create-prd'] };
const absent = file => assert.rejects(fs.lstat(file), { code: 'ENOENT' });
async function fixture(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'mai-removal-')));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const home = path.join(root, 'personal'), project = path.join(root, 'project');
  await fs.mkdir(project);
  return { root, home, project };
}

test('Web deselection removes Skill trees and role directories; reselect restores files and aliases', async t => {
  const { home, project } = await fixture(t);
  await apply(home, project, selected);
  const original = await fs.readFile(path.join(project, '.agents/skills/my-create-feature/scripts/init-feature.mjs'), 'utf8');
  const web = await startWeb({ home, project, port: 0 });
  t.after(() => new Promise(resolve => web.server.close(resolve)));
  async function request(route, body) {
    const response = await fetch(web.origin + '/api/' + route, {
      method: 'POST', headers: { 'X-My-Ai-Token': web.token, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const result = await response.json();
    assert.equal(response.status, 200, JSON.stringify(result));
    return result;
  }
  const preview = await request('plan', { project, config: reduced });
  await fs.access(path.join(project, '.agents/skills/my-create-feature/SKILL.md'));
  const removed = await request('apply', { project, config: reduced, revision: preview.revision });
  assert.equal(removed.complete, true);
  for (const prefix of prefixes) for (const name of ['my-create-feature', 'my-review-code']) await absent(path.join(project, prefix, name));
  for (const directory of ['.agents/agents', '.agents/.generated', '.codex/agents', '.claude/agents', '.cursor/agents', '.github/agents']) await absent(path.join(project, directory));
  for (const directory of ['.agents', '.codex', '.claude', '.cursor', '.github']) assert.ok((await fs.stat(path.join(project, directory))).isDirectory());
  assert.equal(await fs.readFile(path.join(removed.recovery, 'before/.agents/skills/my-create-feature/scripts/init-feature.mjs'), 'utf8'), original);
  assert.equal((await doctor(home, project)).healthy, true);
  const added = await request('plan', { project, config: selected });
  await request('apply', { project, config: selected, revision: added.revision });
  assert.ok((await fs.lstat(path.join(project, '.agents/skills/my-create-feature/SKILL.md'))).isFile());
  for (const prefix of prefixes.slice(1)) {
    const file = path.join(project, prefix, 'my-create-feature/scripts/init-feature.mjs');
    assert.ok((await fs.lstat(file)).isSymbolicLink());
    assert.equal(await fs.readFile(file, 'utf8'), original);
  }
  assert.ok((await fs.lstat(path.join(project, '.codex/agents/code-review.toml'))).isSymbolicLink());
  assert.equal((await doctor(home, project)).healthy, true);
  assert.equal((await apply(home, project)).recovery, null);
});

test('removal preserves user files, modified assets, unknown empty directories and external links', async t => {
  const { root, home, project } = await fixture(t);
  await apply(home, project, selected);
  await write(project, '.agents/skills/my-create-feature/notes.txt', 'User notes');
  await fs.appendFile(path.join(project, '.agents/skills/my-review-code/SKILL.md'), '\nLocal edit\n');
  await fs.mkdir(path.join(project, '.cursor/skills/my-create-feature/user-empty'));
  const outside = path.join(root, 'outside'); await fs.mkdir(outside);
  await fs.writeFile(path.join(outside, 'keep.txt'), 'External file');
  await fs.symlink(outside, path.join(project, '.claude/skills/my-create-feature/external'));
  await apply(home, project, reduced, undefined, { conflict: 'merge' });
  assert.equal(await fs.readFile(path.join(project, '.agents/skills/my-create-feature/notes.txt'), 'utf8'), 'User notes');
  assert.match(await fs.readFile(path.join(project, '.agents/skills/my-review-code/SKILL.md'), 'utf8'), /Local edit/);
  assert.ok((await fs.stat(path.join(project, '.cursor/skills/my-create-feature/user-empty'))).isDirectory());
  assert.equal(await fs.readlink(path.join(project, '.claude/skills/my-create-feature/external')), outside);
  assert.equal(await fs.readFile(path.join(outside, 'keep.txt'), 'utf8'), 'External file');
  await absent(path.join(project, '.agents/skills/my-create-feature/scripts'));
  await absent(path.join(project, '.github/skills/my-create-feature'));
});

test('tool deselection preserves dormant extension sources and permits reinstall', async t => {
  const { home, project } = await fixture(t);
  await write(home, 'assets/hooks/demo/asset.json', json({ name: 'demo', description: 'test', entry: 'scripts/run.sh', targets: { claudecode: '.claude/hooks/demo/run.sh' } }));
  await write(home, 'assets/hooks/demo/scripts/run.sh', 'echo demo\n');
  await apply(home, project, reduced);
  await apply(home, project, { ...reduced, tools: ['codex'] });
  assert.equal(await fs.readFile(path.join(project, '.agents/hooks/demo/scripts/run.sh'), 'utf8'), 'echo demo\n');
  await absent(path.join(project, '.claude/hooks'));
  await fs.appendFile(path.join(project, '.agents/hooks/demo/scripts/run.sh'), '# Local edit\n');
  assert.equal((await apply(home, project)).recovery, null);
  await fs.access(path.join(home, 'assets/hooks/demo/scripts/run.sh'));
  await apply(home, project, reduced, undefined, { conflict: 'merge' });
  const alias = path.join(project, '.claude/hooks/demo/run.sh');
  assert.ok((await fs.lstat(alias)).isSymbolicLink());
  assert.equal(await fs.readFile(alias, 'utf8'), 'echo demo\n# Local edit\n');
});

test('CLI init removes entire inactive tool directories and old residuals, retaining canonical sources', async t => {
  const { root, home, project } = await fixture(t);
  await apply(home, project, selected);
  const source = await inspectEntry(project, '.agents/skills');
  await fs.mkdir(path.join(project, '.claude/skills/old-orphan/empty'), { recursive: true });
  await write(project, '.claude/settings.local.json', '{"local":true}\n');
  await write(project, '.claude/binary.dat', Buffer.from([0, 255, 10]));
  const outside = path.join(root, 'outside'); await fs.mkdir(outside);
  await fs.writeFile(path.join(outside, 'keep'), 'external');
  await fs.symlink(outside, path.join(project, '.claude/external'));
  const original = await inspectEntry(project, '.claude');
  const cli = ['init', '--home', home, '--project', project, '--tools', 'codex,cursor,copilot', '--yes'];
  const run = async () => JSON.parse((await promisify(execFile)(process.execPath, [path.join(PACKAGE, 'bin/my-ai-infra.mjs'), ...cli])).stdout);
  const result = await run();
  assert.equal(result.complete, true);
  await absent(path.join(project, '.claude'));
  await absent(path.join(project, 'CLAUDE.md'));
  assert.deepEqual(await inspectEntry(result.recovery, 'before/.claude'), original);
  assert.deepEqual(await inspectEntry(project, '.agents/skills'), source);
  assert.equal(await fs.readFile(path.join(outside, 'keep'), 'utf8'), 'external');
  assert.equal((await doctor(home, project)).healthy, true);
  assert.equal((await run()).recovery, null);
  // Simulate leftovers from a previous release after its state entries were removed.
  await fs.mkdir(path.join(project, '.claude/skills/old-orphan'), { recursive: true });
  await run();
  await absent(path.join(project, '.claude'));
  await apply(home, project, selected);
  assert.ok((await fs.lstat(path.join(project, '.claude/skills/my-create-feature/SKILL.md'))).isSymbolicLink());
});

test('Web tool removal deletes exclusive roots and preserves GitHub workflows and .agents sources', async t => {
  const { home, project } = await fixture(t);
  await apply(home, project, selected);
  for (const tool of ['.codex', '.cursor', '.github/skills', '.github/instructions', '.copilot']) await write(project, `${tool}/custom/keep-in-backup`, 'local');
  await write(project, '.github/workflows/ci.yml', 'workflow');
  await write(project, '.github/CODEOWNERS', 'owners');
  const source = await inspectEntry(project, '.agents/skills');
  const web = await startWeb({ home, project, port: 0 });
  t.after(() => new Promise(resolve => web.server.close(resolve)));
  const config = { ...selected, tools: ['claudecode'] };
  const request = async (route, body) => {
    const response = await fetch(web.origin + '/api/' + route, { method: 'POST', headers: { 'X-My-Ai-Token': web.token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const result = await response.json(); assert.equal(response.status, 200, JSON.stringify(result)); return result;
  };
  const preview = await request('plan', { project, config });
  assert.ok(preview.actions.some(action => action.path === '.cursor' && action.action === 'remove'));
  await fs.access(path.join(project, '.cursor/custom/keep-in-backup'));
  const result = await request('apply', { project, config, revision: preview.revision });
  assert.equal(result.complete, true);
  for (const directory of ['.codex', '.cursor', '.copilot', '.github/skills', '.github/agents', '.github/instructions']) await absent(path.join(project, directory));
  await absent(path.join(project, '.github/copilot-instructions.md'));
  assert.equal(await fs.readFile(path.join(project, '.github/workflows/ci.yml'), 'utf8'), 'workflow');
  assert.equal(await fs.readFile(path.join(project, '.github/CODEOWNERS'), 'utf8'), 'owners');
  assert.deepEqual(await inspectEntry(project, '.agents/skills'), source);
  assert.equal((await doctor(home, project)).healthy, true);
});

test('tool directory cleanup checks preview revision and rolls back whole directories on failure', async t => {
  const { home, project } = await fixture(t);
  await apply(home, project, selected);
  const config = { ...selected, tools: ['codex'] };
  const preview = await plan(home, project, config);
  await write(project, '.claude/new-file', 'changed after preview');
  await assert.rejects(apply(home, project, config, preview.revision), /changed since preview/);
  const before = new Map();
  for (const relative of ['.agents', '.claude', '.cursor', '.github', 'CLAUDE.md', '.my-ai-infra.json', '.my-ai-infra/state.json', '.gitignore']) before.set(relative, await inspectEntry(project, relative));
  const rename = fs.rename; let injected = false;
  fs.rename = async (source, target) => {
    if (source === path.join(project, '.cursor')) { injected = true; throw Error('tool cleanup failure'); }
    return rename(source, target);
  };
  try { await assert.rejects(apply(home, project, config), /tool cleanup failure/); }
  finally { fs.rename = rename; }
  assert.ok(injected);
  for (const [relative, entry] of before) assert.deepEqual(await inspectEntry(project, relative), entry, relative);
});

test('fresh init preserves unselected tools; later cleanup unlinks a tool root without following it', async t => {
  const { root, home, project } = await fixture(t);
  const outside = path.join(root, 'outside'); await fs.mkdir(outside);
  await fs.writeFile(path.join(outside, 'keep'), 'external');
  await fs.symlink(outside, path.join(project, '.claude'));
  await apply(home, project, { ...selected, tools: ['codex'] });
  assert.equal(await fs.readlink(path.join(project, '.claude')), outside);
  await apply(home, project);
  await absent(path.join(project, '.claude'));
  assert.equal(await fs.readFile(path.join(outside, 'keep'), 'utf8'), 'external');
});

test('inactive Copilot cleanup preserves an unknown shared GitHub directory link', async t => {
  const { root, home, project } = await fixture(t);
  await apply(home, project, { ...selected, tools: ['codex'] });
  const outside = path.join(root, 'outside');
  await fs.mkdir(path.join(outside, 'skills'), { recursive: true });
  await fs.writeFile(path.join(outside, 'skills/keep'), 'external');
  await fs.symlink(outside, path.join(project, '.github'));
  for (const conflict of ['merge', 'replace']) {
    const result = await apply(home, project, undefined, undefined, { conflict });
    assert.equal(result.complete, false);
    assert.equal(await fs.readlink(path.join(project, '.github')), outside);
    assert.equal(await fs.readFile(path.join(outside, 'skills/keep'), 'utf8'), 'external');
  }
});

test('a directory cleanup failure rolls back removed files, aliases and project state', async t => {
  const { home, project } = await fixture(t);
  await apply(home, project, selected);
  const state = JSON.parse(await fs.readFile(path.join(project, '.my-ai-infra/state.json'), 'utf8'));
  const before = new Map();
  for (const relative of [...Object.keys(state.files), '.my-ai-infra.json', '.my-ai-infra/state.json']) before.set(relative, await snapshot(project, relative));
  const registry = await fs.readFile(path.join(home, 'projects.json'), 'utf8');
  const rmdir = fs.rmdir; let count = 0;
  fs.rmdir = async directory => {
    if (directory.startsWith(project + path.sep) && ++count === 2) throw Error('cleanup failure');
    return rmdir(directory);
  };
  try { await assert.rejects(apply(home, project, reduced), /cleanup failure/); }
  finally { fs.rmdir = rmdir; }
  assert.ok(count >= 2);
  for (const [relative, entry] of before) assert.deepEqual(await snapshot(project, relative), entry, relative);
  assert.equal(await fs.readFile(path.join(home, 'projects.json'), 'utf8'), registry);
  assert.equal((await doctor(home, project)).healthy, true);
});
