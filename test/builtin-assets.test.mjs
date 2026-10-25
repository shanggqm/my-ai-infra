import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { PACKAGE } from '../src/store.mjs';
import { hash, json, read, write } from '../src/fs.mjs';

const exec = promisify(execFile);
const chosen = { version: 1, tools: ['codex', 'claudecode'], skills: ['my-review-code', 'my-init-repo-memory'] };
async function fixture(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'mai-builtins-')));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const bundle = path.join(root, 'package'), home = path.join(root, 'personal'), project = path.join(root, 'project');
  await fs.mkdir(bundle); await fs.mkdir(project);
  for (const dir of ['src', 'assets', 'bin', 'web', 'templates', 'catalog', 'design-system', 'package.json']) await fs.cp(path.join(PACKAGE, dir), path.join(bundle, dir), { recursive: true });
  for (const type of ['hooks', 'mcp', 'future-assets']) {
    await write(bundle, `assets/${type}/bundled-check/asset.json`, json({ name: 'bundled-check', description: 'Bundled extension', entry: 'entry.txt', targets: { codex: `.codex/${type}/bundled-check.txt` } }));
    await write(bundle, `assets/${type}/bundled-check/entry.txt`, 'Original package body\n');
    await write(bundle, `assets/${type}/bundled-check/obsolete.txt`, 'Old resource\n');
  }
  const store = await import(pathToFileURL(path.join(bundle, 'src/store.mjs')));
  const projectApi = await import(pathToFileURL(path.join(bundle, 'src/project.mjs')));
  return { root, bundle, home, project, store, projectApi };
}

test('CLI init upgrades every builtin from the package, archives old copies and preserves personal assets', async t => {
  const { root, bundle, home, project, store, projectApi } = await fixture(t);
  await projectApi.apply(home, project, chosen);
  const paths = ['skills/my-review-code/SKILL.md', 'agents/code-review.md', 'skills/my-init-repo-memory/SKILL.md', ...['hooks', 'mcp', 'future-assets'].map(type => `${type}/bundled-check/entry.txt`)];
  const state = { version: 1, files: {} }, archived = new Map();
  for (const relative of paths) {
    const old = await read(bundle, `assets/${relative}`);
    const legacy = old + '\nLegacy library customization.\n';
    await write(home, `assets/${relative}`, legacy);
    archived.set(relative, legacy);
    state.files[`assets/${relative}`] = hash(old);
    await write(bundle, `assets/${relative}`, old + '\nLatest package content.\n');
  }
  for (const type of ['hooks', 'mcp', 'future-assets']) {
    const relative = `${type}/bundled-check/asset.json`;
    const manifest = await read(bundle, `assets/${relative}`);
    await write(home, `assets/${relative}`, manifest);
    state.files[`assets/${relative}`] = hash(manifest);
    await write(home, `assets/${type}/bundled-check/custom.txt`, 'Keep custom attachment\n');
    await fs.rm(path.join(bundle, `assets/${type}/bundled-check/obsolete.txt`));
  }
  await write(home, 'bundle-state.json', json(state));
  const personal = '---\nname: team-only\ndescription: Team-only skill\n---\nKeep personal body\n';
  await write(home, 'assets/skills/team-only/SKILL.md', personal);
  const preview = await projectApi.plan(home, project, chosen);
  assert.equal(preview.assetMigrations.length, 4);
  assert.equal(preview.skillMigrations.length, 2);
  assert.equal(await read(home, 'assets/skills/my-init-repo-memory/SKILL.md'), archived.get('skills/my-init-repo-memory/SKILL.md'));
  const command = ['bin/my-ai-infra.mjs', 'init', '--home', home, '--project', project, '--tools', 'codex,claudecode', '--skills', 'my-review-code,my-init-repo-memory,team-only', '--yes'];
  const result = JSON.parse((await exec(process.execPath, command, { cwd: bundle })).stdout);
  assert.equal(result.complete, true);
  for (const relative of paths) {
    assert.equal(await read(project, `.agents/${relative}`), await read(bundle, `assets/${relative}`), relative);
    assert.equal(await read(home, `runtime/assets/${relative}`), await read(bundle, `assets/${relative}`));
    assert.equal(await read(home, `assets/${relative}`), null);
    const [type, source] = relative.split('/');
    const migration = (type === 'skills' ? result.skillMigrations : result.assetMigrations).find(copy => copy.sourceName === source && (type === 'skills' || copy.type === type));
    assert.ok(migration, relative);
    const backup = type === 'agents' ? migration.backup : path.join(migration.backup, relative.split('/').at(-1));
    assert.equal(await fs.readFile(backup, 'utf8'), archived.get(relative));
  }
  for (const type of ['hooks', 'mcp', 'future-assets']) {
    assert.equal(await read(project, `.agents/${type}/bundled-check/obsolete.txt`), null);
    assert.equal(await read(home, `runtime/assets/${type}/bundled-check/obsolete.txt`), null);
    const migration = result.assetMigrations.find(copy => copy.type === type);
    assert.equal(await read(migration.backup, 'custom.txt'), 'Keep custom attachment\n');
  }
  assert.equal(await read(home, 'assets/skills/team-only/SKILL.md'), personal);
  assert.equal(await read(project, '.agents/skills/team-only/SKILL.md'), personal);
  // Fresh projects and a repeated init use exactly the same latest package source.
  const fresh = path.join(root, 'fresh'); await fs.mkdir(fresh);
  await projectApi.apply(home, fresh, chosen);
  for (const relative of paths) assert.equal(await read(fresh, `.agents/${relative}`), await read(project, `.agents/${relative}`));
  assert.equal((await projectApi.apply(home, project)).complete, true);
  assert.ok((await store.allAssets(home)).every(asset => asset.name === 'team-only' ? asset.origin === 'personal' && !asset.readOnly : asset.origin === 'builtin' && asset.readOnly));
});

test('Web preview/apply uses package content; builtin edits and stale previews reject for all types', async t => {
  const { bundle, home, project, store } = await fixture(t);
  const { startWeb } = await import(pathToFileURL(path.join(bundle, 'src/web.mjs')));
  const name = 'my-init-repo-memory', legacy = `assets/prompts/${name}`;
  await write(home, `${legacy}/asset.json`, json({ name, description: 'Old prompt format', entry: 'prompt.md', targets: {} }));
  await write(home, `${legacy}/prompt.md`, 'Old format with customization\n');
  await write(home, `${legacy}/notes.md`, 'Preserve all old resources\n');
  await write(home, 'bundle-state.json', json({ version: 1, files: { [`${legacy}/prompt.md`]: hash('Old format\n') } }));
  const web = await startWeb({ home, project, port: 0 });
  t.after(() => new Promise(resolve => web.server.close(resolve)));
  const headers = { 'X-My-Ai-Token': web.token, 'Content-Type': 'application/json' };
  const post = (route, body) => fetch(web.origin + route, { method: 'POST', headers, body: JSON.stringify(body) });
  const state = await (await fetch(web.origin + '/api/state', { headers })).json();
  for (const type of ['skills', 'agents', 'hooks', 'mcp', 'future-assets']) {
    const asset = state.inventory.find(item => item.type === type);
    assert.equal(asset.origin, 'builtin'); assert.equal(asset.readOnly, true);
    const rejected = await post('/api/asset', { type, name: asset.name, content: asset.content, revision: asset.revision });
    assert.equal(rejected.status, 400); assert.match((await rejected.json()).error, /read-only/);
    const source = path.join(asset.sourceRoot, asset.sourceName);
    await assert.rejects(store.importAsset(home, source, type), /already exists|builtin/i);
  }
  const preview = await (await post('/api/plan', { project, config: chosen })).json();
  assert.equal(preview.assetMigrations.length, 0);
  assert.equal(await read(home, `${legacy}/notes.md`), 'Preserve all old resources\n');
  const body = { project, config: chosen, revision: preview.revision };
  await fs.appendFile(path.join(bundle, 'assets/hooks/bundled-check/entry.txt'), 'Changed after preview\n');
  const stale = await post('/api/apply', body); assert.equal(stale.status, 400);
  assert.match((await stale.json()).error, /changed since preview/);
  assert.equal(await read(project, '.my-ai-infra.json'), null);
  body.revision = (await (await post('/api/plan', { project, config: chosen })).json()).revision;
  const applied = await post('/api/apply', body); assert.equal(applied.status, 200);
  const result = await applied.json(); assert.equal(result.complete, true);
  await assert.rejects(fs.lstat(path.join(home, legacy)), { code: 'ENOENT' });
  assert.equal(await read(project, `.agents/skills/${name}/SKILL.md`), await read(bundle, `assets/skills/${name}/SKILL.md`));
  await write(home, 'assets/hooks/bundled-check/entry.txt', 'Unknown namesake\n');
  await assert.rejects(store.seed(home), /conflicts with builtin/);
  assert.equal(await read(home, 'assets/hooks/bundled-check/entry.txt'), 'Unknown namesake\n');
});
