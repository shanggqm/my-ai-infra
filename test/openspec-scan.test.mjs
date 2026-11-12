import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { scanOpenSpec } from '../src/migrations/openspec-scan.mjs';

test('source scan is read-only, scoped, includes binary material and rejects links', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mai-openspec-scan-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  for (const dir of ['openspec/changes/a', 'openspec/changes/b', 'openspec/changes/archive/old', 'openspec/specs/auth']) {
    await fs.mkdir(path.join(root, dir), { recursive: true });
  }
  await fs.writeFile(path.join(root, 'openspec/changes/a/tasks.md'), '- [ ] work\n');
  await fs.writeFile(path.join(root, 'openspec/changes/a/.openspec.yaml'), 'schema: spec-driven\n');
  await fs.writeFile(path.join(root, 'openspec/changes/a/image.bin'), Buffer.from([0, 255]));
  await fs.writeFile(path.join(root, 'openspec/changes/archive/old/proposal.md'), 'old');
  await fs.writeFile(path.join(root, 'openspec/specs/auth/spec.md'), 'auth');
  const one = await scanOpenSpec(root, { change: 'a' });
  assert.deepEqual(one.selection.ids, ['a']);
  assert.deepEqual(one.files.map(f => f.path), ['openspec/changes/a/.openspec.yaml', 'openspec/changes/a/image.bin', 'openspec/changes/a/tasks.md']);
  assert.equal(one.files[1].size, 2);
  assert.equal(one.metadata.a.supported, true);
  const all = await scanOpenSpec(root, { all: true });
  assert(all.files.some(f => f.path === 'openspec/specs/auth/spec.md'));
  assert(all.files.some(f => f.path === 'openspec/changes/archive/old/proposal.md'));
  await fs.symlink(root, path.join(root, 'openspec/changes/a/external'));
  await assert.rejects(scanOpenSpec(root, { change: 'a' }), /软链接/);
});
