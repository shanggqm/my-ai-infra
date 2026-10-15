import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

test('lint ignores installed tool entries but rejects linked JavaScript sources', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mai-lint-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'scripts'));
  await fs.mkdir(path.join(root, 'src'));
  await fs.mkdir(path.join(root, '.codex'));
  await fs.copyFile(new URL('../scripts/lint.mjs', import.meta.url), path.join(root, 'scripts/lint.mjs'));
  await fs.writeFile(path.join(root, 'src/main.mjs'), 'export const value = 1;\n');
  await fs.symlink('../src/main.mjs', path.join(root, '.codex/installed.mjs'));
  await fs.symlink('.agents/rules/AGENTS.md', path.join(root, 'AGENTS.md'));
  const run = () => exec(process.execPath, [path.join(root, 'scripts/lint.mjs')]);
  assert.match((await run()).stdout, /Source checks passed/);
  await fs.symlink('main.mjs', path.join(root, 'src/linked.mjs'));
  await assert.rejects(run(), error => /Unexpected source symlink/.test(error.stderr));
});
