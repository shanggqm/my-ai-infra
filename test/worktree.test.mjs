import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const script = fileURLToPath(new URL('../assets/skills/my-create-worktree/scripts/create-worktree.sh', import.meta.url));
const gitEnv = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' };
async function command(bin, args, cwd, env = gitEnv) {
  try { return { ...(await exec(bin, args, { cwd, env, timeout: 15000 })), code: 0 }; }
  catch (error) { if (typeof error.code !== 'number') throw error; return error; }
}
async function git(cwd, ...args) {
  const r = await command('git', args, cwd);
  assert.equal(r.code, 0, r.stderr);
  return r.stdout.trim();
}
async function fixture(t, name = 'repo') {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'worktree-review-')));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const parent = path.join(root, 'parent with 空格'), repo = path.join(parent, name);
  const template = path.join(root, 'empty-template');
  await fs.mkdir(repo, { recursive: true });
  await fs.mkdir(template);
  await git(repo, 'init', '--template=' + template, '-b', 'main');
  await git(repo, 'config', 'user.name', 'Isolated Test');
  await git(repo, 'config', 'user.email', 'test@example.invalid');
  await fs.writeFile(path.join(repo, 'README.md'), 'fixture\n');
  await commit(repo, 'initial');
  return { root, parent, repo, initial: await git(repo, 'rev-parse', 'HEAD') };
}
async function commit(repo, message) {
  await git(repo, 'add', '.');
  await git(repo, 'commit', '-m', message);
}
async function run(repo, args, env) { return command('/bin/bash', [script, ...args], repo, env); }
async function absent(p) { await assert.rejects(fs.lstat(p), { code: 'ENOENT' }); }
async function refs(repo) { return git(repo, 'show-ref'); }

test('uses caller HEAD from a linked worktree and honors an explicit base with spaced paths', async t => {
  const { repo, parent, initial } = await fixture(t, 'primary repo 中文');
  const linked = path.join(parent, 'linked worktree 中文');
  await git(repo, 'worktree', 'add', '-b', 'feature/current', linked);
  await fs.writeFile(path.join(linked, 'feature.txt'), 'linked commit\n');
  await commit(linked, 'feature');
  const head = await git(linked, 'rev-parse', 'HEAD');
  const r = await run(linked, ['--branch', 'codex/child', '--dir', 'child worktree 中文']);
  assert.equal(r.code, 0, r.stderr);
  const target = path.join(parent, 'child worktree 中文');
  assert.equal(await git(target, 'rev-parse', 'HEAD'), head);
  assert.match(r.stdout, new RegExp(head));
  assert.equal(await git(repo, 'rev-parse', 'HEAD'), initial);
  const explicit = await run(linked, ['--branch', 'codex/explicit', '--base', 'main']);
  assert.equal(explicit.code, 0, explicit.stderr);
  assert.equal(await git(path.join(parent, 'primary repo 中文-worktree-explicit'), 'rev-parse', 'HEAD'), initial);
  assert.equal(await git(linked, 'rev-parse', 'HEAD'), head);
});

test('detached caller uses its committed HEAD and preserves uncommitted changes', async t => {
  const { repo, parent, initial } = await fixture(t);
  await git(repo, 'checkout', '--detach', initial);
  await fs.writeFile(path.join(repo, 'README.md'), 'uncommitted input\n');
  const before = await git(repo, 'status', '--porcelain');
  const r = await run(repo, ['--branch', 'codex/detached']);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(await git(path.join(parent, 'repo-worktree-detached'), 'rev-parse', 'HEAD'), initial);
  assert.equal(await git(repo, 'status', '--porcelain'), before);
  assert.equal(await fs.readFile(path.join(repo, 'README.md'), 'utf8'), 'uncommitted input\n');
});

test('existing branch stops for a user choice; explicit reuse keeps its existing commit', async t => {
  const { repo, parent, initial } = await fixture(t);
  await git(repo, 'branch', 'feature/existing', initial);
  await fs.writeFile(path.join(repo, 'later.txt'), 'later\n');
  await commit(repo, 'later');
  const before = await refs(repo);
  const args = ['--branch', 'feature/existing', '--dir', 'existing-target'];
  const r = await run(repo, args);
  assert.equal(r.code, 2, r.stderr);
  assert.match(r.stderr, /Ask the user/);
  assert.equal(await refs(repo), before);
  await absent(path.join(parent, 'existing-target'));
  const reused = await run(repo, [...args, '--reuse-existing']);
  assert.equal(reused.code, 0, reused.stderr);
  assert.equal(await git(path.join(parent, 'existing-target'), 'rev-parse', 'HEAD'), initial);
  assert.equal(await refs(repo), before);
});

test('explicit base conflicting with an existing branch stops without moving it', async t => {
  const { repo, parent, initial } = await fixture(t);
  await git(repo, 'branch', 'feature/existing', initial);
  await fs.writeFile(path.join(repo, 'later.txt'), 'later\n');
  await commit(repo, 'later');
  const before = await refs(repo);
  const r = await run(repo, ['--branch', 'feature/existing', '--dir', 'conflict', '--reuse-existing', '--base', 'main']);
  assert.equal(r.code, 2, r.stderr);
  assert.match(r.stderr, /different commits/);
  assert.equal(await refs(repo), before);
  await absent(path.join(parent, 'conflict'));
  const same = await run(repo, ['--branch', 'feature/existing', '--dir', 'same', '--reuse-existing', '--base', initial]);
  assert.equal(same.code, 0, same.stderr);
});

test('a branch already checked out reports its workspace and does not force reuse', async t => {
  const { repo, parent } = await fixture(t);
  const before = await refs(repo);
  const r = await run(repo, ['--branch', 'main', '--reuse-existing', '--dir', 'occupied']);
  assert.equal(r.code, 2, r.stderr);
  assert.match(r.stderr, /checked out/);
  assert.ok(r.stderr.includes(repo));
  assert.equal(await refs(repo), before);
  await absent(path.join(parent, 'occupied'));
});

test('existing directories, files and dangling links are preserved on conflict', async t => {
  const { repo, parent } = await fixture(t);
  const directory = path.join(parent, 'directory'), file = path.join(parent, 'file'), link = path.join(parent, 'link');
  await fs.mkdir(directory);
  await fs.writeFile(path.join(directory, 'user.txt'), 'keep directory\n');
  await fs.writeFile(file, 'keep file\n');
  await fs.symlink('missing-user-target', link);
  const before = await refs(repo);
  for (const name of ['directory', 'file', 'link']) {
    const r = await run(repo, ['--branch', 'codex/' + name, '--dir', name]);
    assert.equal(r.code, 2, r.stderr);
    assert.equal(await refs(repo), before);
  }
  assert.equal(await fs.readFile(path.join(directory, 'user.txt'), 'utf8'), 'keep directory\n');
  assert.equal(await fs.readFile(file, 'utf8'), 'keep file\n');
  assert.equal(await fs.readlink(link), 'missing-user-target');
});

test('missing but registered worktree stops without pruning or adding a branch', async t => {
  const { repo, parent } = await fixture(t);
  const missing = path.join(parent, 'missing');
  await git(repo, 'worktree', 'add', '-b', 'feature/old', missing);
  await fs.rm(missing, { recursive: true });
  const before = await refs(repo), inventory = await git(repo, 'worktree', 'list', '--porcelain');
  const r = await run(repo, ['--branch', 'codex/replacement', '--dir', 'missing']);
  assert.equal(r.code, 2, r.stderr);
  assert.match(r.stderr, /already registered/);
  assert.equal(await refs(repo), before);
  assert.equal(await git(repo, 'worktree', 'list', '--porcelain'), inventory);
  await absent(missing);
});

test('invalid arguments and bases leave refs and worktree inventory unchanged', async t => {
  const { repo } = await fixture(t);
  const before = await refs(repo), inventory = await git(repo, 'worktree', 'list', '--porcelain');
  for (const args of [
    [], ['--branch'], ['--branch', '--dir', 'target'], ['--branch', '-bad'],
    ['--branch', 'bad..branch'], ['--branch', 'codex/x', '--dir', '../escape'],
    ['--branch', 'codex/x', '--dir', '.'], ['--branch', 'codex/x', '--dir', 'bad\nname'],
    ['--branch', 'codex/x', '--base', 'missing-ref'],
    ['--branch', 'codex/x', '--reuse-existing'], ['--branch', 'codex/x', '--link-modules'],
  ]) {
    const r = await run(repo, args);
    assert.equal(r.code, 1, JSON.stringify(args) + r.stderr);
    assert.equal(await refs(repo), before);
    assert.equal(await git(repo, 'worktree', 'list', '--porcelain'), inventory);
  }
});

test('non-repositories and repositories without commits fail before creating a branch', async t => {
  const { root } = await fixture(t);
  const empty = path.join(root, 'empty');
  await fs.mkdir(empty);
  assert.equal((await run(empty, ['--branch', 'codex/x'])).code, 1);
  await git(empty, 'init', '-b', 'main');
  assert.equal((await run(empty, ['--branch', 'codex/x'])).code, 1);
  assert.equal(await git(empty, 'for-each-ref', '--format=%(refname)'), '');
});

test('tracked config and symlinks follow the selected Git commit without extra linking', async t => {
  const { repo, parent, initial } = await fixture(t);
  await fs.writeFile(path.join(repo, '.env'), 'TRACKED_FIXTURE=keep\n');
  await fs.writeFile(path.join(repo, '.mcp.json'), '{}\n');
  await fs.symlink('README.md', path.join(repo, 'tracked-link'));
  await commit(repo, 'tracked config');
  const before = await git(repo, 'status', '--porcelain');
  const older = await run(repo, ['--branch', 'codex/older', '--base', initial]);
  assert.equal(older.code, 0, older.stderr);
  for (const name of ['.env', '.mcp.json', 'tracked-link']) await absent(path.join(parent, 'repo-worktree-older', name));
  const current = await run(repo, ['--branch', 'codex/current']);
  assert.equal(current.code, 0, current.stderr);
  const target = path.join(parent, 'repo-worktree-current');
  assert.equal((await fs.lstat(path.join(target, '.env'))).isSymbolicLink(), false);
  assert.equal(await fs.readFile(path.join(target, '.env'), 'utf8'), 'TRACKED_FIXTURE=keep\n');
  assert.equal(await fs.readFile(path.join(target, '.mcp.json'), 'utf8'), '{}\n');
  assert.equal(await fs.readlink(path.join(target, 'tracked-link')), 'README.md');
  assert.equal(await git(repo, 'status', '--porcelain'), before);
});

for (const [stack, manifest, body, dependency] of [
  ['javascript', 'package.json', '{"name":"fixture","packageManager":"yarn@4.0.0"}\n', 'node_modules'],
  ['python', 'pyproject.toml', '[project]\nname = "fixture"\nversion = "0.1.0"\n', '.venv'],
  ['go', 'go.mod', 'module example.invalid/fixture\n\ngo 1.22\n', 'vendor'],
]) {
  test(`${stack} project only checks out Git files without sharing local files or running setup`, async t => {
    const { repo, root, parent } = await fixture(t);
    await fs.writeFile(path.join(repo, manifest), body);
    await fs.writeFile(path.join(repo, '.gitignore'), '.env*\n.mcp.json\n.vscode/\n' + dependency + '/\n');
    await commit(repo, 'stack fixture');
    const files = ['.env', '.env.staging', '.mcp.json', '.vscode/settings.json', 'nested/.env.local', dependency + '/user-cache'];
    for (const relative of files) {
      await fs.mkdir(path.dirname(path.join(repo, relative)), { recursive: true });
      await fs.writeFile(path.join(repo, relative), 'local fixture: ' + relative + '\n');
    }
    const stubs = path.join(root, 'stubs'), marker = path.join(root, 'unexpected-command');
    await fs.mkdir(stubs);
    for (const bin of ['npm', 'pnpm', 'yarn', 'bun', 'uv', 'pip', 'pip3', 'poetry', 'go', 'make', 'cursor']) {
      await fs.writeFile(path.join(stubs, bin), '#!/bin/sh\nprintf called >> "$WORKTREE_TEST_MARKER"\nexit 19\n', { mode: 0o755 });
    }
    const before = await git(repo, 'status', '--porcelain');
    const r = await run(repo, ['--branch', 'codex/' + stack], { ...gitEnv, PATH: stubs + path.delimiter + process.env.PATH, WORKTREE_TEST_MARKER: marker });
    assert.equal(r.code, 0, r.stderr);
    const target = path.join(parent, 'repo-worktree-' + stack);
    assert.equal(await fs.readFile(path.join(target, manifest), 'utf8'), body);
    for (const relative of files) {
      await absent(path.join(target, relative));
      assert.equal(await fs.readFile(path.join(repo, relative), 'utf8'), 'local fixture: ' + relative + '\n');
    }
    await absent(marker);
    assert.equal(await git(repo, 'status', '--porcelain'), before);
    assert.match(r.stdout, /Worktree created/);
    assert.doesNotMatch(r.stdout, /install completed|Worktree Ready/);
  });
}
