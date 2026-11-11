import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { previewOpenSpecSource } from '../src/migrations/openspec-preview.mjs';

test('source preview reports metadata gaps and changes when source membership changes', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mai-openspec-preview-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'openspec/changes/a'), { recursive: true });
  const initial = await previewOpenSpecSource(root, { all: true });
  assert(initial.findings.some(f => f.id === 'a' && f.severity === 'block'));
  await fs.writeFile(path.join(root, 'openspec/changes/a/.openspec.yaml'), 'schema: spec-driven\n');
  const next = await previewOpenSpecSource(root, { all: true });
  assert.notEqual(initial.sourceRevision, next.sourceRevision);
  assert.deepEqual(next.findings, []);
  await fs.mkdir(path.join(root, 'openspec/changes/b'));
  const added = await previewOpenSpecSource(root, { all: true });
  assert.notEqual(next.sourceRevision, added.sourceRevision);
  await assert.rejects(fs.stat(path.join(root, 'mai-specs')), { code: 'ENOENT' });
});
