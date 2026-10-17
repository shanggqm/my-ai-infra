import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { apply, doctor, plan, publicPlan } from '../src/project.mjs';
import { catalog, config as normalizeConfig, defaultConfig, importAsset, saveAsset, setup, skillName, metadata, TOOLS } from '../src/store.mjs';
import { BUILTINS, NAMING_VERSION, normalizeText } from '../src/names.mjs';
import { hash, json, locked, read, write } from '../src/fs.mjs';
import { startWeb } from '../src/web.mjs';

const exec = promisify(execFile);
async function fixture(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'my-ai-infra-')));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const project = path.join(root, 'project'), home = path.join(root, 'personal'), toolHome = path.join(root, 'tools');
  await fs.mkdir(project); await fs.mkdir(toolHome);
  return { root, project, home, toolHome };
}
const config = (tools = ['codex'], skills = defaultConfig().skills) => ({ version: 1, tools, skills });

test('plan is read-only, initializes all adapters, and repeated installation is stable', async t => {
  const { home, project } = await fixture(t);
  const chosen = config(Object.keys(TOOLS), [...defaultConfig().skills, 'my-create-worktree']);
  const before = await plan(home, project, chosen);
  assert.ok(before.actions.some(a => a.path === 'mai-specs/_templates/PRD.tmpl.md' && a.action === 'create'));
  await assert.rejects(fs.stat(path.join(project, 'mai-specs')), { code: 'ENOENT' });
  assert.equal(await read(project, '.my-ai-infra.json'), null);
  await assert.rejects(fs.stat(home), { code: 'ENOENT' });
  await apply(home, project, chosen, before.revision);
  for (const name of ['README.md', 'ROADMAP.md', '_templates/PRD.tmpl.md', '_templates/TECH_DESIGN.tmpl.md', '_templates/TEST_PLAN.tmpl.md']) {
    assert.ok(await read(project, `mai-specs/${name}`), name);
  }
  await assert.rejects(fs.stat(path.join(project, 'requirements')), { code: 'ENOENT' });
  await assert.rejects(fs.stat(path.join(project, 'specs')), { code: 'ENOENT' });
  const worktreeScript = await fs.readFile(new URL('../assets/skills/my-create-worktree/scripts/create-worktree.sh', import.meta.url), 'utf8');
  for (const prefix of Object.values(TOOLS)) {
    assert.match(await read(project, `${prefix}/my-create-feature/SKILL.md`), /name: "?my-create-feature/);
    assert.match(await read(project, `${prefix}/my-review-design/SKILL.md`), /name: "?my-review-design/);
    assert.equal(await read(project, `${prefix}/my-verify-feature/SKILL.md`), null);
    assert.equal(await read(project, `${prefix}/my-create-worktree/scripts/create-worktree.sh`), worktreeScript);
    assert.match(await read(project, `${prefix}/my-create-prd/SKILL.md`), /mai-specs\/_templates\/PRD\.tmpl\.md/);
  }
  for (const name of ['CLAUDE.md','AGENTS.md','.github/copilot-instructions.md']) assert.equal(await read(project, name), '');
  assert.equal(await read(project, '.agents/AGENTS.md'), null);
  assert.equal((await doctor(home, project)).healthy, true);
  const repeated = await apply(home, project);
  assert.equal(repeated.summary.update || 0, 0);
  assert.equal(repeated.summary.create || 0, 0);
});
test('preserves instructions outside managed blocks and user-owned requirement documents', async t => {
  const { home, project } = await fixture(t);
  await write(project, 'AGENTS.md', '# Existing rules\nKeep this.\n');
  await write(project, '.gitignore', 'user-logs/\n');
  await apply(home, project);
  await write(project, '.agents/rules/AGENTS.md', (await read(project, 'AGENTS.md')) + '\nNew user rule.\n');
  await write(project, 'mai-specs/ROADMAP.md', '# My roadmap\n');
  await apply(home, project, config(['codex', 'copilot']));
  assert.match(await read(project, 'AGENTS.md'), /Keep this/);
  assert.match(await read(project, 'AGENTS.md'), /New user rule/);
  assert.equal(await read(project, 'mai-specs/ROADMAP.md'), '# My roadmap\n');
  assert.match(await read(project, '.gitignore'), /^user-logs/);
});
test('unknown same-name assets block the whole project installation', async t => {
  const { home, project } = await fixture(t);
  await write(project, '.agents/skills/my-create-feature/SKILL.md', '# user asset');
  const p = await plan(home, project);
  assert.ok(p.actions.some(a => a.action === 'conflict'));
  await assert.rejects(apply(home, project), /Conflicting files/);
  assert.equal(await read(project, '.my-ai-infra.json'), null);
  assert.equal(await read(project, 'AGENTS.md'), null);
  assert.equal(await read(project, '.agents/skills/my-create-feature/SKILL.md'), '# user asset');
});
test('global edits sync to projects while modified project copies block updates', async t => {
  const { home, project } = await fixture(t);
  await saveAsset(home, 'team-feature', '---\nname: team-feature\ndescription: Personal test\n---\n', null); await apply(home, project);
  const asset = (await catalog(home)).find(a => a.name === 'team-feature');
  const modified = asset.content + '\nPersonal addition.\n';
  await saveAsset(home, asset.name, modified, asset.revision);
  await apply(home, project);
  assert.equal(await read(project, '.agents/skills/team-feature/SKILL.md'), modified);
  await write(project, '.agents/skills/team-feature/SKILL.md', modified + '\nProject edit');
  await assert.rejects(apply(home, project, config(['claudecode'], ['team-feature'])), /Conflicting files/);
  assert.equal(await read(project, '.claude/skills/team-feature/SKILL.md'), null);
});
test('switching tools retains the canonical assets and unrelated files', async t => {
  const { home, project } = await fixture(t);
  await apply(home, project);
  await write(project, '.agents/skills/other/SKILL.md', 'user skill');
  await apply(home, project, config(['copilot']));
  assert.match(await read(project, '.agents/skills/my-create-feature/SKILL.md'), /my-create-feature/);
  assert.equal(await read(project, '.agents/skills/other/SKILL.md'), 'user skill');
  assert.match(await read(project, '.github/skills/my-create-feature/SKILL.md'), /name: "?my-create-feature/);
  assert.equal((await doctor(home, project)).healthy, true);
});
test('rejects stale previews after project files or global assets change', async t => {
  const { home, project } = await fixture(t);
  await saveAsset(home, 'team-feature', '---\nname: team-feature\ndescription: Personal test\n---\n', null); await apply(home, project);
  const p = await plan(home, project);
  await write(project, '.agents/rules/AGENTS.md', 'Concurrent project rule.\n');
  await assert.rejects(apply(home, project, p.config, p.revision), /changed since preview/);
  const p2 = await plan(home, project);
  const asset = (await catalog(home)).find(a => a.name === 'team-feature');
  await saveAsset(home, asset.name, asset.content + '\nchanged global', asset.revision);
  await assert.rejects(apply(home, project, p2.config, p2.revision), /changed since preview/);
});
test('rejects symlinked output directories without writing outside the project', async t => {
  const { home, project, root } = await fixture(t);
  const outside = path.join(root, 'outside'); await fs.mkdir(outside);
  await fs.symlink(outside, path.join(project, '.agents'));
  await assert.rejects(apply(home, project), /Symlink path/);
  assert.deepEqual(await fs.readdir(outside), []);
});
test('state path traversal cannot authorize removal of user files', async t => {
  const { home, project } = await fixture(t);
  await write(project, 'keep.txt', 'important');
  await write(project, '.my-ai-infra/state.json', json({ version: 1, files: { '.agents/skills/x/../../../keep.txt': { kind: 'file', hash: hash('important') } } }));
  await assert.rejects(apply(home, project), /Invalid managed path/);
  assert.equal(await read(project, 'keep.txt'), 'important');
});
test('global setup installs an entry Skill whose runtime works without the source package', async t => {
  const { home, toolHome } = await fixture(t);
  await setup(home, Object.keys(TOOLS), toolHome);
  const wrapper = path.join(toolHome, '.agents/skills/my-ai-infra/scripts/my-ai-infra.mjs');
  const { stdout } = await exec(process.execPath, [wrapper, 'catalog'], { cwd: toolHome });
  assert.equal(JSON.parse(stdout).length, BUILTINS.length);
  assert.match(await read(toolHome, '.copilot/skills/my-ai-infra/SKILL.md'), /name: "?my-ai-infra/);
  await write(toolHome, '.agents/skills/my-ai-infra/SKILL.md', '# edited by user');
  await assert.rejects(setup(home, ['codex'], toolHome), /Global asset conflict/);
});
test('imports custom assets and rejects duplicates, malformed metadata and symlinks', async t => {
  const { home, root } = await fixture(t);
  const custom = path.join(root, 'custom-skill'); await fs.mkdir(custom);
  await write(custom, 'SKILL.md', '---\nname: custom-skill\ndescription: Test skill\n---\nDo useful work.\n');
  await write(custom, 'references/help.md', 'help');
  assert.equal((await importAsset(home, custom)).files, 2);
  await assert.rejects(importAsset(home, custom), /already exists/);
  await assert.rejects(saveAsset(home, 'bad', '# no metadata', null), /metadata/);
  await fs.symlink(path.join(custom, 'SKILL.md'), path.join(custom, 'link.md'));
  await assert.rejects(importAsset(home, custom), /symlink/);
});
test('saveAsset requires the latest revision and backs up replaced content', async t => {
  const { home, project } = await fixture(t); await saveAsset(home, 'team-feature', '---\nname: team-feature\ndescription: Personal test\n---\n', null); await apply(home, project);
  const asset = (await catalog(home)).find(a => a.name === 'team-feature');
  await saveAsset(home, asset.name, asset.content + '\nA', asset.revision);
  await assert.rejects(saveAsset(home, asset.name, asset.content + '\nB', asset.revision), /changed since/);
  assert.ok((await fs.readdir(path.join(home, 'backups'))).length > 0);
});
test('HTTP configuration supports authenticated preview/apply and rejects cross-origin writes', async t => {
  const { home, project } = await fixture(t);
  const web = await startWeb({ home, project, port: 0 });
  t.after(() => new Promise(resolve => web.server.close(resolve)));
  const request = (route, data, extra = {}) => fetch(web.origin + '/api/' + route, { method: data ? 'POST' : 'GET', headers: { 'X-My-Ai-Token': web.token, 'Content-Type': 'application/json', ...extra }, ...(data ? { body: json(data) } : {}) });
  assert.equal((await fetch(web.origin + '/api/state')).status, 403);
  assert.equal((await request('state', undefined, { Origin: 'https://evil.example' })).status, 403);
  const state = await (await request('state')).json(); assert.equal(state.assets.length, BUILTINS.length);
  assert.ok(state.assets.some(a => a.name === 'my-implement-code'));
  assert.ok(!state.assets.some(a => a.name === 'my-create-code'));
  assert.ok(!state.assets.some(a => ['my-create-skill', 'my-archive-feature', 'my-explore-codebase'].includes(a.name)));
  const p = await (await request('plan', { project, config: config(['cursor', 'copilot']) })).json();
  assert.equal((await request('apply', { project, config: p.config })).status, 400);
  const result = await request('apply', { project, config: p.config, revision: p.revision });
  assert.equal(result.status, 200);
  assert.equal((await doctor(home, project)).healthy, true);
  const defaults = config(['copilot']);
  assert.equal((await request('defaults', { config: defaults, previous: state.defaults })).status, 200);
  assert.equal((await request('defaults', { config: defaults, previous: state.defaults })).status, 400);
});
test('CLI accepts tool preferences and doctor returns failure for an uninitialized project', async t => {
  const { home, project } = await fixture(t);
  const cli = new URL('../bin/my-ai-infra.mjs', import.meta.url).pathname;
  await assert.rejects(exec(process.execPath, [cli, 'doctor', '--home', home, '--project', project]));
  await exec(process.execPath, [cli, 'init', '--home', home, '--project', project, '--tools', 'claude,copilot', '--yes']);
  const chosen = JSON.parse(await read(project, '.my-ai-infra.json'));
  assert.deepEqual(chosen.tools, ['claudecode', 'copilot']);
  await assert.rejects(exec(process.execPath, [cli, 'init', '--unknown']));
});
test('operation lock rejects overlapping updates', async t => {
  const { home } = await fixture(t);
  await locked(home, () => assert.rejects(locked(home, () => {}), /Another operation/));
});
test('failed project writes roll back previously changed files and configuration', async t => {
  const { home, project } = await fixture(t);
  await apply(home, project);
  const before = await read(project, '.my-ai-infra.json');
  const rename = fs.rename;
  let failed = false;
  fs.rename = async (from, to) => {
    if (!failed && to === path.join(project, '.github/skills/my-create-feature/SKILL.md')) { failed = true; throw Error('Simulated disk failure'); }
    return rename(from, to);
  };
  try { await assert.rejects(apply(home, project, config(['copilot'])), /Simulated disk failure/); }
  finally { fs.rename = rename; }
  assert.equal(await read(project, '.my-ai-infra.json'), before);
  assert.match(await read(project, '.agents/skills/my-create-feature/SKILL.md'), /name: "?my-create-feature/);
  assert.equal(await read(project, '.github/skills/my-create-feature/SKILL.md'), null);
  await assert.rejects(fs.lstat(path.join(project, '.github')), { code: 'ENOENT' });
  assert.equal((await doctor(home, project)).healthy, true);
});
test('project initializes from personal defaults without changing an existing project selection', async t => {
  const { home, project, root } = await fixture(t);
  await apply(home, project);
  await write(home, 'defaults.json', json(config(['copilot'])));
  const other = path.join(root, 'other'); await fs.mkdir(other);
  await apply(home, other);
  assert.deepEqual(JSON.parse(await read(other, '.my-ai-infra.json')).tools, ['copilot']);
  assert.deepEqual(JSON.parse(await read(project, '.my-ai-infra.json')).tools, ['codex']);
});
test('global and project symlink roots are not followed for asset writes', async t => {
  const { home, root } = await fixture(t);
  const outside = path.join(root, 'outside'); await fs.mkdir(outside);
  await fs.symlink(outside, home);
  await assert.rejects(setup(home), /Symlink root/);
  assert.deepEqual(await fs.readdir(outside), []);
});
test('import rejects binary resources instead of silently corrupting them', async t => {
  const { home, root } = await fixture(t);
  const source = path.join(root, 'binary-skill'); await fs.mkdir(source);
  await write(source, 'SKILL.md', '---\nname: binary-skill\ndescription: Example\n---\n');
  await fs.writeFile(path.join(source, 'image.bin'), Buffer.from([0xff, 0xfe, 0x80]));
  await assert.rejects(importAsset(home, source), /Binary assets/);
});
test('legacy configuration names resolve without creating a second installed identity', async t => {
  const { home, project } = await fixture(t);
  const input = config(['codex'], ['create-feature', 'my-init-feature', 'my-create-feature', 'my-generate-prd', 'generate-prd']);
  const normalized = await normalizeConfig(input, home);
  assert.deepEqual(normalized.skills, ['my-create-feature', 'my-create-prd']);
  const p = await plan(home, project, input);
  assert.ok(p.actions.some(a => a.path === '.agents/skills/my-create-feature/SKILL.md'));
  assert.ok(!p.actions.some(a => a.path === '.agents/skills/create-feature/SKILL.md'));
  await assert.rejects(fs.stat(home), { code: 'ENOENT' });
});
test('legacy personal assets and managed project copies migrate with edits, attachments and preview intact', async t => {
  const { home, project } = await fixture(t);
  const text = '---\nname: create-tech-design\ndescription: Personal customized design\n---\n\nKeep my custom decisions.\n';
  await write(home, 'bundle-state.json', json({version:1,files:{'create-tech-design/SKILL.md':hash(text)}}));
  await write(home, 'assets/skills/create-tech-design/SKILL.md', text);
  await write(home, 'assets/skills/create-tech-design/references/notes.md', 'Personal notes');
  await write(project, '.my-ai-infra.json', json(config(['copilot'], ['create-tech-design'])));
  await write(project, '.github/skills/create-tech-design/SKILL.md', text);
  await write(project, '.my-ai-infra/state.json', json({ version: 1, files: { '.github/skills/create-tech-design/SKILL.md': { kind: 'file', hash: hash(text) } } }));
  const p = await plan(home, project);
  assert.equal(p.config.skills[0], 'my-create-design');
  assert.equal(await read(home, 'assets/skills/create-tech-design/SKILL.md'), text);
  await apply(home, project, p.config, p.revision);
  assert.equal(await read(home, 'assets/skills/create-tech-design/SKILL.md'), null);
  assert.equal(await read(home, 'assets/skills/my-create-design/SKILL.md'), null);
  assert.equal(await read(project, '.github/skills/my-create-design/references/notes.md'), null);
  assert.equal(await read(project, '.github/skills/create-tech-design/SKILL.md'), null);
  assert.equal((await doctor(home, project)).healthy, true);
  const backups = await fs.readdir(path.join(home, 'backups'));
  const naming = backups.find(name => name.startsWith('builtin-skills-'));
  assert.equal(await read(home, `backups/${naming}/create-tech-design/SKILL.md`), text);
});
test('duplicate legacy and canonical personal sources stop migration before any rewrite', async t => {
  const { home, project } = await fixture(t);
  const body = name => `---\nname: ${name}\ndescription: Custom\n---\n`;
  await write(home, 'assets/skills/create-feature/SKILL.md', body('create-feature'));
  await write(home, 'assets/skills/my-create-feature/SKILL.md', body('my-create-feature'));
  await assert.rejects(apply(home, project), /conflicts with builtin/);
  assert.equal(await read(home, 'assets/skills/create-feature/SKILL.md'), body('create-feature'));
  assert.equal(await read(project, '.my-ai-infra.json'), null);
});
test('registry metadata matches every built-in identity and naming rejects ambiguous slugs', async t => {
  const { home } = await fixture(t);
  const list = await catalog(home);
  assert.deepEqual(new Set(list.map(a => a.name)), new Set(BUILTINS.map(a => a.name)));
  assert.equal(new Set(BUILTINS.flatMap(a => [a.name, ...a.aliases])).size, BUILTINS.flatMap(a => [a.name, ...a.aliases]).length);
  for (const a of list) assert.match(a.content, new RegExp('^name: "?' + a.name + '"?$', 'm'));
  for (const name of ['a--b', 'a-', '-a', 'A-b', 'a'.repeat(65)]) assert.throws(() => skillName(name), /Invalid/);
  assert.equal(normalizeText('create-worktree scripts/create-worktree.sh'), 'my-create-worktree scripts/create-worktree.sh');
  assert.equal(normalizeText('create-feature references/create-feature.md'), 'my-create-feature references/create-feature.md');
});
test('P0 additions are available to an existing store without replacing its personal choices', async t => {
  const { home, project } = await fixture(t);
  const oldChoice = config(['copilot'], ['my-create-feature']);
  const personal = '---\nname: my-create-feature\ndescription: Personal feature\n---\nKeep my workflow.\n';
  await write(home, 'bundle-state.json', json({version:1,files:{'my-create-feature/SKILL.md':hash(personal)}}));
  await write(home, 'assets/skills/my-create-feature/SKILL.md', personal);
  await write(home, 'defaults.json', json(oldChoice));
  const entries = await catalog(home);
  assert.ok(entries.some(s => s.name === 'my-review-design'));
  const chosen = config(['copilot'], ['my-create-feature', 'my-review-design']);
  const preview = await plan(home, project, chosen);
  assert.equal(await read(home, 'assets/skills/my-review-design/SKILL.md'), null);
  await apply(home, project, chosen, preview.revision);
  assert.notEqual(await read(project, '.github/skills/my-create-feature/SKILL.md'), personal);
  assert.equal(await read(home, 'defaults.json'), json(oldChoice));
  assert.match(await read(project, '.github/skills/my-review-design/SKILL.md'), /name: "?my-review-design/);
  assert.equal((await doctor(home, project)).healthy, true);
});
test('my-create-code migrates to my-implement-code across adapters while preserving personal content and preferences', async t => {
  const { home, project } = await fixture(t);
  const original = '---\nname: my-create-code\ndescription: Personal implementation\n---\nKeep my implementation workflow.\n';
  const oldChoice = config(Object.keys(TOOLS), ['my-create-code']);
  await write(home, 'bundle-state.json', json({version:1,files:{'my-create-code/SKILL.md':hash(original)}}));
  await write(home, 'assets/skills/my-create-code/SKILL.md', original);
  await write(home, 'assets/skills/my-create-code/references/custom.md', 'Personal notes');
  await write(home, 'defaults.json', json(oldChoice));
  await write(project, '.my-ai-infra.json', json(oldChoice));
  const owned = {};
  for (const prefix of Object.values(TOOLS)) {
    const file = `${prefix}/my-create-code/SKILL.md`;
    await write(project, file, original);
    owned[file] = { kind: 'file', hash: hash(original) };
  }
  await write(project, '.my-ai-infra/state.json', json({ version: 1, files: owned }));
  const p = await plan(home, project);
  assert.deepEqual(p.config.skills, ['my-implement-code']);
  assert.equal(await read(home, 'assets/skills/my-create-code/SKILL.md'), original);
  await apply(home, project, p.config, p.revision);
  assert.equal(await read(home, 'assets/skills/my-create-code/SKILL.md'), null);
  assert.equal(await read(home, 'assets/skills/my-implement-code/SKILL.md'), null);
  assert.deepEqual(JSON.parse(await read(home, 'defaults.json')).skills, ['my-implement-code']);
  for (const prefix of Object.values(TOOLS)) {
    assert.equal(await read(project, `${prefix}/my-create-code/SKILL.md`), null);
    assert.match(await read(project, `${prefix}/my-implement-code/SKILL.md`), /name: "my-implement-code"/);
    assert.equal(await read(project, `${prefix}/my-implement-code/references/custom.md`), null);
  }
  const backups = await fs.readdir(path.join(home, 'backups'));
  const naming = backups.find(name => name.startsWith('builtin-skills-'));
  assert.equal(await read(home, `backups/${naming}/my-create-code/SKILL.md`), original);
  assert.equal((await doctor(home, project)).healthy, true);
});
test('removed built-ins and aliases are absent from fresh catalogs, defaults and all adapters', async t => {
  const { home, project } = await fixture(t);
  const removed = ['my-create-skill', 'my-archive-feature', 'my-explore-codebase'];
  const aliases = ['create-skill', 'archive-feature', 'explore-oss-project'];
  assert.equal(BUILTINS.length, 10);
  assert.equal(defaultConfig().skills.length, BUILTINS.length);
  assert.ok(!(await catalog(home)).some(s => [...removed, ...aliases].includes(s.name)));
  for (const name of [...removed, ...aliases]) {
    await assert.rejects(plan(home, project, config(['codex'], [name])), /Unknown Skill/);
  }
  assert.equal(await read(project, '.my-ai-infra.json'), null);
  await apply(home, project, config(Object.keys(TOOLS)));
  for (const name of [...removed, ...aliases]) {
    assert.equal(await read(home, `assets/skills/${name}/SKILL.md`), null);
    assert.equal(await read(home, `runtime/assets/skills/${name}/SKILL.md`), null);
    for (const prefix of Object.values(TOOLS)) assert.equal(await read(project, `${prefix}/${name}/SKILL.md`), null);
  }
  assert.equal((await doctor(home, project)).healthy, true);
});
test('previous personal assets remain user owned after built-in removal', async t => {
  const { home, project } = await fixture(t);
  const name = 'my-create-skill';
  const body = `---\nname: ${name}\ndescription: Personal retained skill\n---\nPersonal decisions.\n`;
  await write(home, `assets/skills/${name}/SKILL.md`, body);
  await write(home, 'defaults.json', json(config(['codex'], [name])));
  await apply(home, project);
  const asset = (await catalog(home)).find(a => a.name === name);
  assert.equal(asset.category, 'custom');
  assert.equal(asset.default, false);
  assert.equal(await read(home, `assets/skills/${name}/SKILL.md`), body);
  assert.deepEqual(JSON.parse(await read(home, 'defaults.json')).skills, [name]);
});
test('updating a stable runtime removes obsolete bundled aliases from its active catalog with recovery copies', async t => {
  const { home, toolHome } = await fixture(t);
  await setup(home, ['codex'], toolHome);
  const wrapper = path.join(toolHome, '.agents/skills/my-ai-infra/scripts/my-ai-infra.mjs');
  const old = '---\nname: my-create-code\ndescription: Previous bundle\n---\nOld bundle content.\n';
  await write(home, 'runtime/assets/skills/my-create-code/SKILL.md', old);
  await assert.rejects(exec(process.execPath, [wrapper, 'catalog']), /Both legacy and canonical/);
  await setup(home, ['codex'], toolHome);
  assert.equal(await read(home, 'runtime/assets/skills/my-create-code/SKILL.md'), null);
  const entries = JSON.parse((await exec(process.execPath, [wrapper, 'catalog'])).stdout);
  assert.equal(entries.length, BUILTINS.length);
  assert.ok(entries.some(s => s.name === 'my-implement-code'));
  const backups = await fs.readdir(path.join(home, 'backups'));
  const runtime = backups.find(name => name.startsWith('runtime-assets-'));
  assert.equal(await read(home, `backups/${runtime}/skills/my-create-code/SKILL.md`), old);
});
