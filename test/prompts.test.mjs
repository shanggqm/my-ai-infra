import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { extensionCatalog } from '../src/assets.mjs';
import { apply, plan, doctor } from '../src/project.mjs';
import { seed, setup, defaultConfig, PACKAGE, importAsset, saveAsset, allAssets } from '../src/store.mjs';
import { hash, json, read, readJSON, write } from '../src/fs.mjs';

const names = ['my-auto-design', 'my-auto-feature', 'my-init-repo-memory'];
const tools = ['codex', 'claudecode', 'cursor', 'copilot'];
const chosen = { ...defaultConfig(), tools };
async function fixture(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'infra-prompts-')));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const home = path.join(root, 'personal'), project = path.join(root, 'project'), toolHome = path.join(root, 'tools');
  await fs.mkdir(project); await fs.mkdir(toolHome);
  return { root, home, project, toolHome };
}
async function checkLinks(root, assets, global = false) {
  for (const asset of assets) {
    const center = path.join(root, '.agents/prompts', asset.entry);
    assert.ok((await fs.lstat(center)).isFile());
    for (const entry of Object.values(global ? asset.globalTargets : asset.targets)) {
      const alias = path.join(root, entry);
      if (entry.endsWith('/SKILL.md')) {
        assert.equal((await fs.lstat(alias)).isFile(),entry.startsWith('.agents/'), entry);
        const body = await fs.readFile(alias,'utf8');
        const reference = body.match(/\]\(([^)]+)\)/)[1];
        assert.equal(path.resolve(path.dirname(await fs.realpath(alias)),decodeURI(reference)),center);
        assert.match(body,/disable-model-invocation: true/);
        assert.match(await fs.readFile(path.join(path.dirname(await fs.realpath(alias)),'agents/openai.yaml'),'utf8'),/allow_implicit_invocation: false/);
      } else {
        assert.ok((await fs.lstat(alias)).isSymbolicLink(), entry);
        assert.equal(path.isAbsolute(await fs.readlink(alias)), false);
        assert.equal(await fs.realpath(alias), center);
      }
    }
  }
}

test('bundled prompts install one body with native entries for four tools, survive moving and repeated sync', async t => {
  const { root, home, project } = await fixture(t);
  const assets = (await extensionCatalog(home)).filter(a => a.type === 'prompts');
  assert.deepEqual(assets.map(a => a.name), names);
  assert.ok(assets.every(a => a.flat && Object.keys(a.contents).length === 1 && a.entry === `${a.name}.md`));
  const preview = await plan(home, project, chosen);
  assert.deepEqual(await fs.readdir(project), []);
  await assert.rejects(fs.stat(home), { code: 'ENOENT' });
  const result = await apply(home, project, chosen, preview.revision);
  assert.equal(result.complete, true);
  await checkLinks(project, assets);
  const center = '.agents/prompts/my-auto-feature.md';
  const body = await read(project, center);
  const moved = path.join(root, 'moved project');
  await fs.rename(project, moved);
  await checkLinks(moved, assets);
  await apply(home, moved);
  assert.equal(await read(moved, center), body);
  assert.equal((await doctor(home, moved)).healthy, true);
});

test('prompt body edits stay centralized and merge protects project customization', async t => {
  const { home, project } = await fixture(t);
  await apply(home, project, chosen);
  const center = '.agents/prompts/my-auto-design.md';
  const alias = '.claude/skills/my-auto-design/SKILL.md';
  const customized = (await read(project, center)) + '\nProject-specific acceptance rule.\n';
  await fs.writeFile(path.join(project, center), customized);
  assert.equal(await read(project, center), customized);
  const result = await apply(home, project, undefined, undefined, { conflict: 'merge' });
  assert.equal(await read(project, center), customized);
  assert.ok(result.review.some(item => item.path === center));
  await checkLinks(project, (await extensionCatalog(home)).filter(a => a.type === 'prompts'));
  // Removing a selected tool removes its managed alias without losing the central customization.
  await apply(home, project, { ...chosen, tools: ['codex'] }, undefined, { conflict: 'merge' });
  await assert.rejects(fs.lstat(path.join(project, alias)), { code: 'ENOENT' });
  assert.equal(await read(project, center), customized);
});

test('builtin Prompt copies are archived and setup uses current package content', async t => {
  const { home, toolHome } = await fixture(t);
  await seed(home);
  const oldKey = 'assets/prompts/my-auto-feature.md';
  const personalKey = 'assets/prompts/my-auto-design.md';
  const old = '---\ndescription: "Previous builtin"\n---\nPrevious builtin prompt\n';
  await write(home, oldKey, old);
  const baseline = await readJSON(home, 'bundle-state.json');
  baseline.files[oldKey] = hash(old);
  await write(home, 'bundle-state.json', json(baseline));
  const personal = (await read(PACKAGE, personalKey)) + '\nPersonal acceptance rule.\n';
  await write(home, personalKey, personal);
  baseline.files[personalKey] = hash(await read(PACKAGE,personalKey));
  await write(home, 'bundle-state.json', json(baseline));
  const upgraded = await seed(home, { updateBuiltins: true });
  assert.equal(upgraded.assetMigrations.length,2);
  assert.equal(await read(home,oldKey),null);
  assert.equal(await read(home,personalKey),null);
  const archived = upgraded.assetMigrations.find(copy => copy.name === 'my-auto-design');
  assert.equal(await fs.readFile(archived.backup,'utf8'),personal);
  await setup(home, tools, toolHome);
  const assets = (await extensionCatalog(home)).filter(a => a.type === 'prompts');
  await checkLinks(toolHome, assets, true);
  for (const asset of assets) assert.equal(asset.globalTargets.copilot, `.agents/skills/${asset.name}/SKILL.md`);
  await assert.rejects(fs.stat(path.join(toolHome, '.copilot/prompts')), { code: 'ENOENT' });
  assert.equal(await read(toolHome, '.agents/prompts/my-auto-design.md'), await read(PACKAGE,personalKey));
});

test('single-file Prompt import and edit validate metadata, reject duplicates and stale writes', async t => {
  const { root, home, project } = await fixture(t);
  const source = path.join(root, 'my-shortcut.md');
  const body = '---\ndescription: "简短流程"\n---\n\n使用 my-review-code 审查当前变更。\n';
  await fs.writeFile(source, body);
  await importAsset(home, source, 'prompts');
  const asset = (await allAssets(home)).find(a => a.name === 'my-shortcut');
  assert.equal(asset.description, '简短流程');
  assert.equal(asset.content, body);
  await assert.rejects(importAsset(home, source, 'prompts'), /already exists/);
  await assert.rejects(saveAsset(home, asset.name, '# Missing description', asset.revision, 'prompts'), /description/);
  assert.equal(await read(home, 'assets/prompts/my-shortcut.md'), body);
  const edited = body.replace('简短流程', '更新描述').replace('当前变更', '指定方案的实现');
  await saveAsset(home, asset.name, edited, asset.revision, 'prompts');
  await assert.rejects(saveAsset(home, asset.name, body, asset.revision, 'prompts'), /changed since/);
  const updated = (await allAssets(home)).find(a => a.name === asset.name);
  assert.equal(updated.description, '更新描述');
  await apply(home, project, chosen);
  await checkLinks(project, [updated]);
  assert.equal(await read(project, '.agents/prompts/my-shortcut.md'), edited);
  await assert.rejects(fs.stat(path.join(home, 'assets/prompts/my-shortcut')), { code: 'ENOENT' });
});

test('legacy personal Prompt remains its sole source on upgrade; ambiguous flat and folder sources reject', async t => {
  const { home } = await fixture(t);
  const name = 'team-legacy';
  await write(home, `assets/prompts/${name}/asset.json`, json({ name, description: 'Personal legacy prompt', entry: 'prompt.md', targets: { claudecode: `.claude/commands/${name}.md` } }));
  await write(home, `assets/prompts/${name}/prompt.md`, 'Keep my legacy customization.\n');
  await write(home, 'runtime/assets/prompts/my-auto-feature/prompt.md', 'Old runtime body\n');
  await seed(home, { updateBuiltins: true });
  await assert.rejects(fs.stat(path.join(home, 'runtime/assets/prompts/my-auto-feature')), { code: 'ENOENT' });
  const backup = (await fs.readdir(path.join(home, 'backups'))).find(p => p.startsWith('runtime-assets-'));
  assert.equal(await read(home, `backups/${backup}/prompts/my-auto-feature/prompt.md`), 'Old runtime body\n');
  const assets = (await extensionCatalog(home)).filter(a => a.type === 'prompts' && a.name === name);
  assert.equal(assets.length, 1);
  assert.equal(assets[0].content, 'Keep my legacy customization.\n');
  await assert.rejects(fs.stat(path.join(home, `assets/prompts/${name}.md`)), { code: 'ENOENT' });
  await write(home, `assets/prompts/${name}.md`, '---\ndescription: "Duplicate"\n---\nOther text\n');
  await assert.rejects(seed(home), /Duplicate asset/);
  assert.equal(await read(home, `assets/prompts/${name}/prompt.md`), 'Keep my legacy customization.\n');
});
