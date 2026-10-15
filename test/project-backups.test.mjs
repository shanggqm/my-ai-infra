import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { apply, plan, doctor } from '../src/project.mjs';
import { recoveryDirectory, pruneBackups } from '../src/conflicts.mjs';
import { write, json } from '../src/fs.mjs';
const chosen = { version: 1, tools: ['codex'], skills: ['my-create-feature'] };
async function fixture(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'project-backups-')));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const home = path.join(root, 'home'), project = path.join(root, 'project');
  await fs.mkdir(project); return { home, project };
}
const missing = file => assert.rejects(fs.lstat(file), { code: 'ENOENT' });
test('global backups isolate projects, previews and no-op sync do not create backups; layout is optional', async t => {
  const { home, project } = await fixture(t);
  await plan(home, project, chosen); await missing(home);
  const first = await apply(home, project, chosen);
  assert.ok(first.recovery.startsWith(home + path.sep));
  await missing(path.join(project, '.my-ai-infra/backups'));
  await missing(path.join(project, 'mai-specs/FEATURE_LAYOUT.json'));
  assert.equal((await doctor(home, project)).healthy, true);
  assert.equal((await apply(home, project)).recovery, null);
  assert.equal((await fs.readdir(path.dirname(first.recovery))).length, 1);
  const custom = '{"custom":"keep exactly"}\n';
  await write(project, 'mai-specs/FEATURE_LAYOUT.json', custom);
  await apply(home, project);
  assert.equal(await fs.readFile(path.join(project, 'mai-specs/FEATURE_LAYOUT.json'), 'utf8'), custom);
  const other = path.join(project, 'other'); await fs.mkdir(other);
  const second = await apply(home, other, chosen);
  assert.notEqual(path.dirname(first.recovery), path.dirname(second.recovery));
});
test('retention keeps seven days and at least three completed operations, leaves incomplete and unrelated entries', async t => {
  const { home, project } = await fixture(t), now = Date.now(), day = 86400000;
  const records = [];
  for (const age of [20, 19, 18, 17, 4, 3, 2, 1]) {
    const location = await recoveryDirectory(home, project, `${now - age * day}-${randomUUID()}`);
    await write(location, 'completed.json', json({ project, completedAt: now - age * day }));
    records.push(location);
  }
  const incomplete = await recoveryDirectory(home, project, `${now - 30 * day}-${randomUUID()}`);
  await write(incomplete, 'journal.json', '[]');
  const unknown = path.join(path.dirname(incomplete), 'personal-notes'); await write(unknown, 'keep', 'keep');
  await pruneBackups(home, project, now);
  for (const location of records.slice(0, 4)) await missing(location);
  for (const location of [...records.slice(4), incomplete, unknown]) await fs.access(location);
  // All three recent operations survive even once they exceed seven days.
  await pruneBackups(home, project, now + 50 * day);
  await missing(records[4]);
  for (const location of records.slice(5)) await fs.access(location);
});
test('next successful change prunes old backups; previews and no-op sync leave them alone', async t => {
  const { home, project } = await fixture(t);
  await apply(home, project, chosen);
  const old = [];
  for (let i = 0; i < 4; i++) {
    const time = Date.now() - (20 + i) * 86400000;
    const location = await recoveryDirectory(home, project, `${time}-${randomUUID()}`);
    await write(location, 'completed.json', json({ project, completedAt: time })); old.push(location);
  }
  await plan(home, project); await apply(home, project);
  for (const location of old) await fs.access(location);
  await fs.unlink(path.join(project, 'mai-specs/ROADMAP.md'));
  await apply(home, project);
  await fs.access(old[0]);
  for (const location of old.slice(1)) await missing(location);
});
test('cross-device directory backup and rollback preserve bytes and links on failure', async t => {
  const { home, project } = await fixture(t);
  await fs.mkdir(path.join(project, '.gitignore'));
  const bytes = Buffer.from([0, 255, 128]);
  await fs.writeFile(path.join(project, '.gitignore/data'), bytes);
  await fs.symlink('data', path.join(project, '.gitignore/link'));
  const rename = fs.rename;
  fs.rename = async (from, to) => {
    if (to === path.join(project, '.my-ai-infra/state.json')) throw Error('Injected failure');
    if (from.startsWith(project + path.sep) && to.startsWith(home + path.sep) || from.startsWith(home + path.sep) && to.startsWith(project + path.sep)) throw Object.assign(Error('Cross device'), { code: 'EXDEV' });
    return rename(from, to);
  };
  try { await assert.rejects(apply(home, project, chosen, undefined, { conflict: 'replace' }), /Injected failure/); }
  finally { fs.rename = rename; }
  assert.deepEqual(await fs.readFile(path.join(project, '.gitignore/data')), bytes);
  assert.equal(await fs.readlink(path.join(project, '.gitignore/link')), 'data');
});
