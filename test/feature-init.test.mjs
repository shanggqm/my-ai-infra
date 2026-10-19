import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { initializeFeature } from '../assets/skills/my-create-feature/scripts/init-feature.mjs';
import { apply } from '../src/project.mjs';
import { TOOLS } from '../src/store.mjs';

const exec = promisify(execFile);
const skill = fileURLToPath(new URL('../assets/skills/my-create-feature/', import.meta.url));
const script = path.join(skill, 'scripts/init-feature.mjs');
const defaultOptions = { slug: 'record-search', title: '资料检索' };
async function fixture(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'feature-init-')));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const project = path.join(root, 'project with 空格');
  await fs.mkdir(project);
  await fs.writeFile(path.join(project, 'go.mod'), 'module example.invalid/fixture\n');
  return { root, project, specsRoot: path.join(project, 'mai-specs') };
}
async function cli(project, args, entry = script, options = {}) {
  try { return { ...await exec(process.execPath, [entry, '--project', project, ...args], { cwd: project, timeout: 15000, ...options }), code: 0 }; }
  catch (error) { if (typeof error.code !== 'number') throw error; return error; }
}
async function missing(p) { await assert.rejects(fs.lstat(p), { code: 'ENOENT' }); }
async function featureNames(specsRoot) { return (await fs.readdir(specsRoot)).filter(n => /^(?:Feature-)?\d+-/.test(n)).sort(); }
const indexTemplate = () => fs.readFile(path.join(skill, 'template/ROADMAP.md'), 'utf8');

test('owner defaults to target-project Git name, honors explicit input and falls back to pending', async t => {
  const { root, project, specsRoot } = await fixture(t);
  // Isolate Git configuration from the developer machine without changing its configuration.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
  const globalConfig = path.join(root, 'gitconfig');
  Object.assign(env, { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: globalConfig });
  await fs.writeFile(globalConfig, '[user]\n\tname = Global Owner\n');
  const git = args => exec('git', args, { cwd: project, env });
  await git(['init', '--quiet']);
  await git(['config', '--local', 'user.name', '  本地 | 负责人  ']);
  const configPath = path.join(project, '.git/config');
  const originalConfig = await fs.readFile(configPath);
  const args = ['--slug', 'local-owner', '--title', '负责人默认值'];
  // Launch from another directory to ensure --project controls configuration lookup.
  const checked = await cli(project, [...args, '--check'], script, { env, cwd: root });
  assert.equal(checked.code, 0, checked.stderr);
  await missing(specsRoot);
  async function expectOwner(slug, owner, extra = [], runEnv = env) {
    const result = await cli(project, ['--slug', slug, '--title', '负责人默认值', ...extra], script, { env: runEnv, cwd: root });
    assert.equal(result.code, 0, result.stderr);
    const brief = await fs.readFile(JSON.parse(result.stdout).brief, 'utf8');
    assert.ok(brief.includes(`| 负责人 | ${owner} |`), brief);
  }
  await expectOwner('local-owner', '本地 \\| 负责人');
  await expectOwner('explicit-owner', '指定负责人', ['--owner', '指定负责人']);
  assert.deepEqual(await fs.readFile(configPath), originalConfig);
  await git(['config', '--local', '--unset', 'user.name']);
  await expectOwner('global-owner', 'Global Owner');
  await fs.writeFile(globalConfig, '');
  await expectOwner('missing-owner', '待填');
  await git(['config', '--local', 'user.name', '   ']);
  await expectOwner('blank-owner', '待填');
  await fs.writeFile(configPath, '[invalid config');
  await expectOwner('unreadable-owner', '待填');
  await expectOwner('no-git-owner', '待填', [], { ...env, PATH: root });
  await expectOwner('explicit-without-git', '指定负责人', ['--owner', '指定负责人'], { ...env, PATH: root });
});

test('preflight is read-only and execution recalculates IDs after another Feature is created', async t => {
  const { project, specsRoot } = await fixture(t);
  const checked = await cli(project, ['--slug', 'record-search', '--title', '资料检索', '--check']);
  assert.equal(checked.code, 0, checked.stderr);
  assert.deepEqual(JSON.parse(checked.stdout), { ready: true, created: false, project, slug: 'record-search', profile: 'standard', files: ['BRIEF.md', path.join('context', '_INDEX.md')] });
  await missing(specsRoot);
  const other = await initializeFeature({ ...defaultOptions, project, slug: 'other' });
  const before = await fs.readFile(other.roadmap);
  const io = { ...fs };
  for (const method of ['mkdir', 'writeFile', 'rename', 'link', 'unlink', 'rm', 'rmdir']) io[method] = async () => { throw Error(`Unexpected write: ${method}`); };
  assert.equal((await initializeFeature({ ...defaultOptions, project }, { io, checkOnly: true })).ready, true);
  assert.deepEqual(await fs.readFile(other.roadmap), before);
  const created = await initializeFeature({ ...defaultOptions, project });
  assert.equal(created.id, '998');
  await assert.rejects(initializeFeature({ ...defaultOptions, project }, { io, checkOnly: true }), e => e.exitCode === 2);
});

test('preflight exposes index and lock conflicts without changing the project', async t => {
  const { project, specsRoot } = await fixture(t);
  await fs.mkdir(specsRoot);
  const roadmap = path.join(specsRoot, 'ROADMAP.md');
  const invalid = '# ROADMAP\n## 规划中\n| 自定义 |\n|---|\n';
  await fs.writeFile(roadmap, invalid);
  await assert.rejects(initializeFeature({ ...defaultOptions, project }, { checkOnly: true }), e => e.exitCode === 2);
  assert.equal(await fs.readFile(roadmap, 'utf8'), invalid);
  assert.deepEqual(await fs.readdir(specsRoot), ['ROADMAP.md']);
  await fs.mkdir(path.join(specsRoot, '.feature-init.lock'));
  await assert.rejects(initializeFeature({ ...defaultOptions, project }, { checkOnly: true }), e => e.exitCode === 2 && /holds/.test(e.message));
  assert.equal(await fs.readFile(roadmap, 'utf8'), invalid);
});

test('one initialization copies original bytes and completes the context index from prepared input', async t => {
  const { root, project, specsRoot } = await fixture(t);
  const original = path.join(root, '访谈.pdf'), extracted = path.join(root, '访谈提取.md');
  const bytes = Buffer.from([0x25, 0x50, 0x44, 0x46, 0, 255, 128]);
  await fs.writeFile(original, bytes);
  await fs.writeFile(extracted, '用户原话\n{{TITLE}}\n');
  const context = path.join(root, 'context.json');
  await fs.writeFile(context, JSON.stringify({
    materials: [{ path: original, source: '用户访谈', summary: '已核验 | 需求' }, { path: extracted, derivedFrom: '访谈.pdf' }],
    findings: ['确认 {{TITLE}} 保留原文'], questions: ['非阻塞问题\n后续细化'],
  }));
  const args = ['--slug', 'record-search', '--title', '资料检索', '--context', context];
  const preflight = await cli(project, [...args, '--check']);
  assert.equal(preflight.code, 0, preflight.stderr);
  await missing(specsRoot);
  const run = await cli(project, args);
  assert.equal(run.code, 0, run.stderr);
  const created = JSON.parse(run.stdout);
  assert.deepEqual(await fs.readFile(path.join(created.path, 'context/访谈.pdf')), bytes);
  assert.deepEqual(await fs.readFile(path.join(created.path, 'context/访谈提取.md')), await fs.readFile(extracted));
  assert.deepEqual(await fs.readFile(original), bytes);
  const index = await fs.readFile(path.join(created.path, 'context/_INDEX.md'), 'utf8');
  assert.ok(index.includes('已核验 \\| 需求'));
  assert.ok(index.includes('未解析'));
  assert.ok(index.includes('| 访谈.pdf |'));
  assert.ok(index.includes('- 确认 {{TITLE}} 保留原文'));
  assert.ok(index.includes('- 非阻塞问题\n  后续细化'));
  assert.deepEqual(created.files.sort(), ['BRIEF.md', 'context/_INDEX.md', 'context/访谈.pdf', 'context/访谈提取.md'].sort());
  assert.ok((await fs.readFile(created.roadmap, 'utf8')).includes(`${created.name}/BRIEF.md`));
  await missing(path.join(specsRoot, '.feature-init.lock'));
});

test('invalid or conflicting context inputs stop before creating any project files', async t => {
  const { root, project, specsRoot } = await fixture(t);
  await fs.mkdir(path.join(root, 'other'));
  const a = path.join(root, 'source.pdf'), b = path.join(root, 'other/source.pdf');
  await fs.writeFile(a, 'one'); await fs.writeFile(b, 'two');
  const reserved = path.join(root, 'BRIEF.md'); await fs.writeFile(reserved, 'raw material');
  const linked = path.join(root, 'linked.pdf'); await fs.symlink(a, linked);
  const context = path.join(root, 'context.json');
  for (const value of [
    { materials: [{ path: a }, { path: b }] },
    { materials: [{ path: reserved }] },
    { materials: [{ path: linked }] },
    { materials: [{ path: path.join(root, 'missing.pdf') }] },
    { materials: [{ path: '../outside' }] },
    { findings: [1] }, { unknown: true },
  ]) {
    await fs.writeFile(context, JSON.stringify(value));
    for (const checkOnly of [true, false]) {
      await assert.rejects(initializeFeature({ ...defaultOptions, project, context }, { checkOnly }));
      await missing(specsRoot);
    }
  }
  assert.equal(await fs.readFile(a, 'utf8'), 'one');
  assert.equal(await fs.readFile(b, 'utf8'), 'two');
});

test('output verification prevents publishing an index when generated content changes', async t => {
  const { project, specsRoot } = await fixture(t);
  const io = { ...fs, writeFile: async (...args) => {
    await fs.writeFile(...args);
    if (String(args[0]).endsWith('BRIEF.md')) await fs.writeFile(args[0], 'outside edit');
  } };
  await assert.rejects(initializeFeature({ ...defaultOptions, project }, { io }), e => e.exitCode === 2 && /not written correctly/.test(e.message));
  assert.equal(await fs.readFile(path.join(specsRoot, '999-record-search/BRIEF.md'), 'utf8'), 'outside edit');
  await missing(path.join(specsRoot, 'ROADMAP.md'));
  await missing(path.join(specsRoot, '999-record-search/context/_INDEX.md'));
});

test('path validation runs inside initialization and binary imports roll back on failure', async t => {
  const { root, project, specsRoot } = await fixture(t);
  const material = path.join(root, 'input.bin'), bytes = Buffer.from([0, 255, 128]);
  await fs.writeFile(material, bytes);
  const context = path.join(root, 'context.json');
  await fs.writeFile(context, JSON.stringify({ materials: [{ path: material }] }));
  const unexpected = path.join(specsRoot, '999-record-search/unexpected-link');
  const io = { ...fs, writeFile: async (...args) => {
    await fs.writeFile(...args);
    if (String(args[0]).endsWith('input.bin')) await fs.symlink(material, unexpected);
  } };
  await assert.rejects(initializeFeature({ ...defaultOptions, project, context }, { io }), e => e.exitCode === 2 && /path validation failed/.test(e.message));
  assert.ok((await fs.lstat(unexpected)).isSymbolicLink());
  await missing(path.join(specsRoot, 'ROADMAP.md'));
  await missing(path.join(specsRoot, '999-record-search/context/input.bin'));
  await missing(path.join(specsRoot, '.feature-init.lock'));
  assert.deepEqual(await fs.readFile(material), bytes);
});

test('standalone CLI renders the bundled tree, preserves literal user values and returns actual paths', async t => {
  const { project, specsRoot } = await fixture(t);
  const summary = '文字 | {{TITLE}}\n保留第二行';
  const r = await cli(project, ['--slug', 'record-search', '--title', '资料 [检索]', '--priority', 'P2', '--summary', summary, '--background', '人工浏览耗时', '--modules', 'api|web']);
  assert.equal(r.code, 0, r.stderr);
  const result = JSON.parse(r.stdout);
  assert.equal(result.id, '999');
  assert.equal(result.phase, 'draft');
  assert.equal(result.path, path.join(specsRoot, '999-record-search'));
  const brief = await fs.readFile(result.brief, 'utf8');
  assert.ok(brief.includes(summary));
  assert.ok(brief.includes('| 涉及子系统 | api\\|web |'));
  assert.match(brief, /\| Phase \| draft \|/);
  assert.deepEqual(result.files.sort(), ['BRIEF.md', 'context/_INDEX.md']);
  assert.deepEqual((await fs.readdir(result.path)).sort(), ['BRIEF.md', 'context']);
  assert.deepEqual(await fs.readdir(path.join(result.path, 'context')), ['_INDEX.md']);
  await missing(path.join(result.path, 'spec/PRD.md'));
  const roadmap = await fs.readFile(result.roadmap, 'utf8');
  assert.match(roadmap, /资料 \\\[检索\\\]/);
  assert.ok(roadmap.includes('文字 \\| {{TITLE}}<br>保留第二行'));
  assert.equal(await fs.readFile(path.join(project, 'go.mod'), 'utf8'), 'module example.invalid/fixture\n');
  await missing(path.join(specsRoot, '.feature-init.lock'));
});

test('numbers descend from the smallest directory or index-only ID and keep newest directories first', async t => {
  const { project, specsRoot } = await fixture(t);
  await fs.mkdir(path.join(specsRoot, '999-previous'), { recursive: true });
  const original = '# Custom notes\n\n## 规划中\n| 需求 | 标题 | 优先级 | 说明 |\n|---|---|---|---|\n| 950 | 外部归档 | P1 | 保留编号 |\n';
  await fs.writeFile(path.join(specsRoot, 'ROADMAP.md'), original);
  const result = await initializeFeature({ ...defaultOptions, project });
  assert.equal(result.id, '949');
  assert.match(await fs.readFile(result.brief, 'utf8'), /^# 949:/);
  assert.ok((await fs.readFile(result.roadmap, 'utf8')).startsWith(original));
  const second = await initializeFeature({ ...defaultOptions, project, slug: 'other', title: '其他' });
  assert.equal(second.id, '948');
  assert.deepEqual(await featureNames(specsRoot), [second.name, result.name, '999-previous']);
});

test('mai-specs initialization ignores other workspace roots and preserves their files', async t => {
  const { root, project, specsRoot } = await fixture(t);
  const others = ['requirements', 'specs'];
  for (const name of others) {
    await fs.mkdir(path.join(project, name, 'Feature-999-record-search'), { recursive: true });
    await fs.writeFile(path.join(project, name, 'ROADMAP.md'), '# Unrelated workspace\nFeature-999\n');
    await fs.writeFile(path.join(project, name, 'FEATURE_LAYOUT.json'), 'not our layout');
  }
  const result = await initializeFeature({ ...defaultOptions, project });
  assert.equal(result.id, '999');
  assert.equal(result.path, path.join(specsRoot, '999-record-search'));
  for (const name of others) {
    assert.equal(await fs.readFile(path.join(project, name, 'ROADMAP.md'), 'utf8'), '# Unrelated workspace\nFeature-999\n');
    assert.equal(await fs.readFile(path.join(project, name, 'FEATURE_LAYOUT.json'), 'utf8'), 'not our layout');
    assert.deepEqual((await fs.readdir(path.join(project, name))).sort(), ['FEATURE_LAYOUT.json', 'Feature-999-record-search', 'ROADMAP.md']);
  }
  const home = path.join(root, 'personal');
  await apply(home, project);
  assert.ok(await fs.readFile(path.join(specsRoot, '_templates/PRD.tmpl.md'), 'utf8'));
  for (const name of others) {
    assert.equal(await fs.readFile(path.join(project, name, 'FEATURE_LAYOUT.json'), 'utf8'), 'not our layout');
    assert.deepEqual((await fs.readdir(path.join(project, name))).sort(), ['FEATURE_LAYOUT.json', 'Feature-999-record-search', 'ROADMAP.md']);
  }
});

test('repeated slug refuses initialization without changing existing Feature or index', async t => {
  const { project, specsRoot } = await fixture(t);
  const first = await initializeFeature({ ...defaultOptions, project });
  await fs.appendFile(first.brief, '\n用户批注：保留。\n');
  const beforeBrief = await fs.readFile(first.brief), beforeIndex = await fs.readFile(first.roadmap);
  const r = await cli(project, ['--slug', 'record-search', '--title', '新的描述']);
  assert.equal(r.code, 2);
  assert.equal(JSON.parse(r.stderr).conflict, true);
  assert.deepEqual(await fs.readFile(first.brief), beforeBrief);
  assert.deepEqual(await fs.readFile(first.roadmap), beforeIndex);
  assert.deepEqual(await featureNames(specsRoot), [first.name]);
  await missing(path.join(specsRoot, '.feature-init.lock'));
});

test('index-only slug collisions match the complete slug, allowing a different suffix-sharing name', async t => {
  const { project, specsRoot } = await fixture(t);
  await fs.mkdir(specsRoot);
  const roadmap = path.join(specsRoot, 'ROADMAP.md');
  await fs.writeFile(roadmap, (await indexTemplate()) + '\n[外部归档](998-other-record-search/BRIEF.md)\n');
  const created = await initializeFeature({ ...defaultOptions, project });
  assert.equal(created.id, '997');
  const before = await fs.readFile(roadmap, 'utf8');
  await assert.rejects(initializeFeature({ ...defaultOptions, project, slug: 'other-record-search' }), e => e.exitCode === 2);
  assert.equal(await fs.readFile(roadmap, 'utf8'), before);
  assert.deepEqual(await featureNames(specsRoot), [created.name]);
});

test('ROADMAP insertion preserves CRLF, comments, existing rows and later sections', async t => {
  const { project, specsRoot } = await fixture(t);
  await fs.mkdir(specsRoot);
  const original = '# Custom\r\n\r\n## 规划中\r\n\r\n| 需求 | 标题 | 优先级 | 说明 |\r\n|---|---|---|---|\r\n| 996 | 旧记录 | P0 | 保留 |\r\n\r\n人工备注：保持原文。\r\n\r\n## 已完成\r\n| 995 | 旧记录 | P1 | 已完成 |\r\n';
  const roadmap = path.join(specsRoot, 'ROADMAP.md');
  await fs.writeFile(roadmap, original);
  const result = await initializeFeature({ ...defaultOptions, project });
  assert.equal(result.id, '994');
  const actual = await fs.readFile(roadmap, 'utf8');
  const row = actual.split('\r\n').find(line => line.startsWith('| 994 |'));
  assert.ok(row);
  assert.equal(actual.replace(row + '\r\n', ''), original);
});

test('incompatible index layout and duplicate numbers stop before generating files', async t => {
  const { project, specsRoot } = await fixture(t);
  await fs.mkdir(specsRoot);
  const roadmap = path.join(specsRoot, 'ROADMAP.md');
  const custom = '# ROADMAP\n## 规划中\n| 名称 | 备注 |\n|---|---|\n';
  await fs.writeFile(roadmap, custom);
  await assert.rejects(initializeFeature({ ...defaultOptions, project }), e => e.exitCode === 2);
  assert.equal(await fs.readFile(roadmap, 'utf8'), custom);
  assert.deepEqual(await featureNames(specsRoot), []);
  await fs.writeFile(roadmap, await indexTemplate());
  await fs.mkdir(path.join(specsRoot, '999-a'));
  await fs.mkdir(path.join(specsRoot, '999-b'));
  await assert.rejects(initializeFeature({ ...defaultOptions, project }), e => e.exitCode === 2);
  assert.deepEqual(await featureNames(specsRoot), ['999-a', '999-b']);
});

test('invalid input is rejected without creating mai-specs', async t => {
  const { project, specsRoot } = await fixture(t);
  for (const args of [
    ['--slug', '../escape', '--title', 'x'], ['--slug', 'A-b', '--title', 'x'],
    ['--slug', 'ok', '--title', 'line\nbreak'], ['--slug', 'ok', '--title', 'x', '--priority', 'P8'],
    ['--slug'], ['--slug', 'ok', '--title', 'x', '--slug', 'duplicate'],
    ['--slug', 'ok', '--title', 'x', '--unknown', 'value'],
  ]) {
    const r = await cli(project, args);
    assert.equal(r.code, 1, JSON.stringify(args));
    await missing(specsRoot);
  }
});

test('symlinked mai-specs/index and a held lock preserve outside data', async t => {
  const { root, project, specsRoot } = await fixture(t);
  const outside = path.join(root, 'outside'); await fs.mkdir(outside);
  await fs.symlink(outside, specsRoot);
  await assert.rejects(initializeFeature({ ...defaultOptions, project }), e => e.exitCode === 2);
  assert.deepEqual(await fs.readdir(outside), []);
  await fs.unlink(specsRoot); await fs.mkdir(specsRoot);
  const file = path.join(outside, 'ROADMAP.md'); await fs.writeFile(file, 'private index\n');
  await fs.symlink(file, path.join(specsRoot, 'ROADMAP.md'));
  await assert.rejects(initializeFeature({ ...defaultOptions, project }), e => e.exitCode === 2);
  assert.equal(await fs.readFile(file, 'utf8'), 'private index\n');
  await fs.unlink(path.join(specsRoot, 'ROADMAP.md'));
  const lock = path.join(specsRoot, '.feature-init.lock'); await fs.mkdir(lock);
  await fs.writeFile(path.join(lock, 'owner'), 'another initializer');
  await assert.rejects(initializeFeature({ ...defaultOptions, project }), e => e.exitCode === 2);
  assert.equal(await fs.readFile(path.join(lock, 'owner'), 'utf8'), 'another initializer');
  assert.deepEqual(await featureNames(specsRoot), []);
});

test('two concurrent processes never allocate the same Feature or overwrite an index', async t => {
  const { project, specsRoot } = await fixture(t);
  const results = await Promise.all(['first', 'second'].map(slug => cli(project, ['--slug', slug, '--title', slug])));
  const successes = results.filter(r => r.code === 0).map(r => JSON.parse(r.stdout));
  assert.ok(successes.length >= 1);
  assert.ok(results.every(r => r.code === 0 || r.code === 2));
  assert.equal(new Set(successes.map(s => s.id)).size, successes.length);
  assert.equal((await featureNames(specsRoot)).length, successes.length);
  const index = await fs.readFile(path.join(specsRoot, 'ROADMAP.md'), 'utf8');
  for (const r of successes) assert.ok(index.includes(r.name + '/BRIEF.md'));
  await missing(path.join(specsRoot, '.feature-init.lock'));
});

test('write or index commit failure rolls back owned files and preserves the original index', async t => {
  const { project, specsRoot } = await fixture(t);
  await fs.mkdir(specsRoot);
  const roadmap = path.join(specsRoot, 'ROADMAP.md'), original = await indexTemplate();
  await fs.writeFile(roadmap, original);
  for (const failure of ['file', 'index']) {
    const io = { ...fs,
      writeFile: async (...args) => {
        if (failure === 'file' && String(args[0]).endsWith(path.join('context', '_INDEX.md'))) throw Error('simulated disk failure');
        return fs.writeFile(...args);
      },
      rename: async (...args) => { if (failure === 'index' && args[1] === roadmap) throw Error('simulated index commit failure'); return fs.rename(...args); },
    };
    await assert.rejects(initializeFeature({ ...defaultOptions, project }, { io }), /simulated/);
    assert.equal(await fs.readFile(roadmap, 'utf8'), original);
    assert.deepEqual(await featureNames(specsRoot), []);
    await missing(path.join(specsRoot, '.feature-init.lock'));
  }
});

test('an external index edit detected during creation is retained and reported as a conflict', async t => {
  const { project, specsRoot } = await fixture(t);
  await fs.mkdir(specsRoot);
  const roadmap = path.join(specsRoot, 'ROADMAP.md');
  await fs.writeFile(roadmap, await indexTemplate());
  const external = '# External edit: keep this\n';
  const io = { ...fs, writeFile: async (...args) => {
    if (String(args[0]).endsWith('BRIEF.md')) await fs.writeFile(roadmap, external);
    return fs.writeFile(...args);
  } };
  await assert.rejects(initializeFeature({ ...defaultOptions, project }, { io }), e => e.exitCode === 2);
  assert.equal(await fs.readFile(roadmap, 'utf8'), external);
  assert.deepEqual(await featureNames(specsRoot), []);
});

test('missing or malformed templates fail before writing a target project', async t => {
  const { root, project, specsRoot } = await fixture(t);
  const copy = path.join(root, 'standalone-skill'); await fs.cp(skill, copy, { recursive: true });
  const entry = path.join(copy, 'scripts/init-feature.mjs');
  const brief = path.join(copy, 'template/feature/BRIEF.md');
  const original = await fs.readFile(brief, 'utf8');
  await fs.writeFile(brief, original + '\n{{UNKNOWN_FIELD}}\n');
  let r = await cli(project, ['--slug', 'ok', '--title', 'x'], entry);
  assert.equal(r.code, 1); await missing(specsRoot);
  await fs.writeFile(brief, original);
  await fs.unlink(path.join(copy, 'template/feature/context/_INDEX.md'));
  r = await cli(project, ['--slug', 'ok', '--title', 'x'], entry);
  assert.equal(r.code, 1); await missing(specsRoot);
});

test('rollback preserves outside content added to a newly created Feature', async t => {
  const { project, specsRoot } = await fixture(t);
  await fs.mkdir(specsRoot);
  const roadmap = path.join(specsRoot, 'ROADMAP.md'), original = await indexTemplate();
  await fs.writeFile(roadmap, original);
  const userFile = path.join(specsRoot, '999-record-search/user-added.txt');
  const io = { ...fs, rename: async (...args) => {
    if (args[1] === roadmap) { await fs.writeFile(userFile, 'outside change\n'); throw Error('simulated commit failure'); }
    return fs.rename(...args);
  } };
  await assert.rejects(initializeFeature({ ...defaultOptions, project }, { io }), /simulated/);
  assert.equal(await fs.readFile(userFile, 'utf8'), 'outside change\n');
  assert.equal(await fs.readFile(roadmap, 'utf8'), original);
  await missing(path.join(specsRoot, '999-record-search/BRIEF.md'));
});

test('all four installed adapters include working script/templates and preserve legacy project templates', async t => {
  const { project, root } = await fixture(t);
  const legacy = path.join(project, 'mai-specs/_templates/BRIEF.tmpl.md');
  await fs.mkdir(path.dirname(legacy), { recursive: true }); await fs.writeFile(legacy, 'User-owned legacy template\n');
  await apply(path.join(root, 'personal'), project, { version: 1, tools: Object.keys(TOOLS), skills: ['my-create-feature'] });
  for (const [tool, prefix] of Object.entries(TOOLS)) {
    const installed = path.join(project, prefix, 'my-create-feature');
    assert.deepEqual(await fs.readFile(path.join(installed, 'scripts/init-feature.mjs')), await fs.readFile(script));
    assert.deepEqual(await fs.readFile(path.join(installed, 'template/feature/BRIEF.md')), await fs.readFile(path.join(skill, 'template/feature/BRIEF.md')));
    const r = await cli(project, ['--slug', 'from-' + tool, '--title', tool], path.join(installed, 'scripts/init-feature.mjs'));
    assert.equal(r.code, 0, r.stderr);
    assert.match(await fs.readFile(JSON.parse(r.stdout).brief, 'utf8'), /\| Phase \| draft \|/);
    const validation = await exec(process.execPath, [path.join(installed, 'scripts/validate-feature.mjs'), '--feature', JSON.parse(r.stdout).path]);
    assert.equal(JSON.parse(validation.stdout).valid, true);
  }
  assert.equal(await fs.readFile(legacy, 'utf8'), 'User-owned legacy template\n');
});

test('new projects allocate 999, 998 and 997 with plain IDs and matching index links', async t => {
  const { project, specsRoot } = await fixture(t);
  for (const [id, slug] of [['999', 'first'], ['998', 'second'], ['997', 'third']]) {
    const r = await cli(project, ['--slug', slug, '--title', slug]);
    assert.equal(r.code, 0, r.stderr); const result = JSON.parse(r.stdout);
    assert.equal(result.id, id); assert.equal(result.name, `${id}-${slug}`);
    assert.match(await fs.readFile(result.brief, 'utf8'), new RegExp(`^# ${id}:`));
    assert.ok((await fs.readFile(result.roadmap, 'utf8')).includes(`| ${id} | [${slug}](${id}-${slug}/BRIEF.md)`));
  }
  assert.deepEqual(await featureNames(specsRoot), ['997-third', '998-second', '999-first']);
});

test('zero padding is retained through 009, 008 and 000 before wrapping back to 999', async t => {
  const { project, specsRoot } = await fixture(t);
  await fs.mkdir(path.join(specsRoot, '010-previous'), { recursive: true });
  assert.equal((await initializeFeature({ project, slug: 'nine', title: '九' })).id, '009');
  assert.equal((await initializeFeature({ project, slug: 'eight', title: '八' })).id, '008');
  await fs.appendFile(path.join(specsRoot, 'ROADMAP.md'), '\n[外部归档](001-archived/BRIEF.md)\n');
  const last = await initializeFeature({ project, slug: 'last', title: '最后一个' });
  assert.equal(last.id, '000');
  assert.equal((await initializeFeature({ project, slug: 'wrapped', title: '循环' })).id, '999');
  assert.equal((await initializeFeature({ project, slug: 'wrapped-again', title: '继续循环' })).id, '998');
});

test('wraparound skips numbers reserved by both directories and index-only records', async t => {
  const { project, specsRoot } = await fixture(t);
  await fs.mkdir(path.join(specsRoot, '999-existing'), { recursive: true });
  const brief = path.join(specsRoot, '999-existing/BRIEF.md'); await fs.writeFile(brief, '# 用户内容\n');
  await fs.writeFile(path.join(specsRoot, 'ROADMAP.md'), (await indexTemplate()) + '\n[最小编号](000-old/BRIEF.md)\n[仅索引记录](997-indexed/BRIEF.md)\n');
  assert.equal((await initializeFeature({ project, slug: 'wrap-one', title: '循环一' })).id, '998');
  assert.equal((await initializeFeature({ project, slug: 'wrap-two', title: '循环二' })).id, '996');
  assert.equal(await fs.readFile(brief, 'utf8'), '# 用户内容\n');
});

test('a fully occupied numbering space stops without changing any existing records', async t => {
  const { project, specsRoot } = await fixture(t); await fs.mkdir(specsRoot);
  const roadmap = path.join(specsRoot, 'ROADMAP.md');
  const original = (await indexTemplate()) + Array.from({ length: 1000 }, (_, n) => `| ${String(n).padStart(3, '0')} | 已登记 | P1 | 保留 |\n`).join('');
  await fs.writeFile(roadmap, original);
  const r = await cli(project, ['--slug', 'full', '--title', '满额']);
  assert.equal(r.code, 2); assert.match(r.stderr, /All Feature numbers/);
  assert.equal(await fs.readFile(roadmap, 'utf8'), original);
  assert.deepEqual(await featureNames(specsRoot), []);
});

test('legacy and mixed numbering stop for user choice without renaming directories or changing the index', async t => {
  const { project, specsRoot } = await fixture(t);
  await fs.mkdir(path.join(specsRoot, 'Feature-001-old'), { recursive: true });
  const old = path.join(specsRoot, 'Feature-001-old/BRIEF.md'); await fs.writeFile(old, '# 已有需求\n用户批注\n');
  const roadmap = path.join(specsRoot, 'ROADMAP.md'); await fs.writeFile(roadmap, await indexTemplate());
  for (const mixed of [false, true]) {
    if (mixed) await fs.mkdir(path.join(specsRoot, '999-new'));
    const before = await fs.readFile(roadmap), names = await featureNames(specsRoot);
    const r = await cli(project, ['--slug', 'next', '--title', '下一个']);
    assert.equal(r.code, 2); assert.match(r.stderr, /Legacy/);
    assert.deepEqual(await featureNames(specsRoot), names); assert.deepEqual(await fs.readFile(roadmap), before);
    assert.equal(await fs.readFile(old, 'utf8'), '# 已有需求\n用户批注\n');
  }
  await fs.rm(path.join(specsRoot, 'Feature-001-old'), { recursive: true });
  await fs.appendFile(roadmap, '\n| Feature-002 | 仅索引旧记录 | P1 | 保留 |\n');
  const before = await fs.readFile(roadmap);
  assert.equal((await cli(project, ['--slug', 'next', '--title', '下一个'])).code, 2);
  assert.deepEqual(await fs.readFile(roadmap), before);
});

test('invalid or conflicting new numbers in directories and index links fail before creating a Feature', async t => {
  const { project, specsRoot } = await fixture(t);
  await fs.mkdir(specsRoot); const roadmap = path.join(specsRoot, 'ROADMAP.md');
  for (const name of ['99-short', '1000-too-large']) {
    await fs.mkdir(path.join(specsRoot, name)); await fs.writeFile(roadmap, await indexTemplate());
    await assert.rejects(initializeFeature({ ...defaultOptions, project }), e => e.exitCode === 2);
    await fs.rmdir(path.join(specsRoot, name));
  }
  for (const extra of ['\n| 1000 | 非法编号 | P1 | 保留 |\n', '\n[a](999-a/BRIEF.md) [b](999-b/BRIEF.md)\n']) {
    const original = (await indexTemplate()) + extra; await fs.writeFile(roadmap, original);
    await assert.rejects(initializeFeature({ ...defaultOptions, project }), e => e.exitCode === 2);
    assert.equal(await fs.readFile(roadmap, 'utf8'), original);
    assert.deepEqual(await featureNames(specsRoot), []);
  }
});

test('profiles share the ID pool, render the same value in BRIEF and five-column index, and preflight never writes', async t => {
  const { project, specsRoot } = await fixture(t);
  for (const [profile, id] of [['simple', '999'], ['standard', '998']]) {
    const options = { project, profile, slug: `${profile}-demo`, title: 'Demo', summary: 'keep | {{PROFILE}}' };
    const checked = await initializeFeature(options, { checkOnly: true });
    assert.equal(checked.profile, profile);
    if (id === '999') await missing(specsRoot);
    const result = await initializeFeature(options);
    assert.equal(result.profile, profile);
    assert.equal(result.id, id);
    assert.equal(result.name, `${id}-${profile}-demo`);
    assert.match(await fs.readFile(result.brief, 'utf8'), new RegExp(`\\| Profile \\| ${profile} \\|`));
    assert.ok((await fs.readFile(result.roadmap, 'utf8')).includes(`| ${id} | [Demo](${result.name}/BRIEF.md) | ${profile} | P1 | keep \\| {{PROFILE}} |`));
    assert.deepEqual((await fs.readdir(result.path)).sort(), ['BRIEF.md', 'context']);
  }
  assert.deepEqual(await featureNames(specsRoot), ['998-standard-demo', '999-simple-demo']);
});

test('legacy four-column and mixed-section indexes preserve every old byte while recording profile', async t => {
  const { project, specsRoot } = await fixture(t);
  await fs.mkdir(specsRoot);
  const roadmap = path.join(specsRoot, 'ROADMAP.md');
  for (const [n, header] of [
    [4, '| 需求 | 标题 | 优先级 | 说明 |\r\n|---|---|---|---|'],
    [5, '| 需求 | 标题 | 规格 | 优先级 | 说明 |\r\n|---|---|---|---|---|'],
  ]) {
    const before = `# Notes\r\n\r\n## 规划中\r\n${header}\r\n\r\n人工批注\r\n## 进行中\r\n| 需求 | 标题 | 优先级 | 说明 |\r\n|---|---|---|---|\r\n| 900 | 旧项 | P0 | 勿动 |\r\n`;
    await fs.writeFile(roadmap, before);
    const result = await initializeFeature({ ...defaultOptions, project, slug: `mixed-${n}`, profile: 'simple' });
    const after = await fs.readFile(roadmap, 'utf8');
    const row = after.split('\r\n').find(line => line.startsWith(`| ${result.id} |`));
    assert.equal(after.replace(row + '\r\n', ''), before);
    assert.ok(row.includes(n === 4 ? '| P1 | 规格：simple；待补充 |' : '| simple | P1 | 待补充 |'));
  }
  const before = '# Notes\r\n## 已完成\r\n| 需求 | 标题 | 优先级 | 说明 |\r\n|---|---|---|---|\r\n';
  await fs.writeFile(roadmap, before);
  await initializeFeature({ ...defaultOptions, project, slug: 'missing-section', profile: 'simple' });
  const after = await fs.readFile(roadmap, 'utf8');
  assert.ok(after.startsWith(before));
  assert.ok(after.includes('| 需求 | 标题 | 规格 | 优先级 | 说明 |\r\n'));
});

test('unknown profiles and corrupt registries fail without any write, using the installed relative resource', async t => {
  const { root, project, specsRoot } = await fixture(t);
  const copy = path.join(root, 'moved-skill'); await fs.cp(skill, copy, { recursive: true });
  const entry = path.join(copy, 'scripts/init-feature.mjs');
  const registry = path.join(copy, 'references/FEATURE_PROFILES.json');
  const source = await fs.readFile(registry, 'utf8');
  const base = ['--slug', 'demo', '--title', 'Demo'];
  for (const profile of ['unknown', 'Simple', '', ' ']) {
    for (const checkOnly of [true, false]) {
      const result = await cli(project, [...base, '--profile', profile, ...(checkOnly ? ['--check'] : [])], entry);
      assert.equal(result.code, 1);
      await missing(specsRoot);
    }
  }
  const invalid = [null, '{', '[]', '{}', '{"default":"standard","profiles":{}}',
    JSON.stringify({ default: 'absent', profiles: { simple: { label: '轻量' } } }),
    JSON.stringify({ default: 'simple', profiles: { simple: { label: '' } } }),
    JSON.stringify({ default: 'simple', profiles: { Simple: { label: '轻量' } } }),
    JSON.stringify({ default: 'simple', profiles: { simple: { label: '轻量', extra: 1 } } }),
    JSON.stringify({ ...JSON.parse(source), extra: 1 })];
  for (const body of invalid) {
    if (body === null) await fs.rm(registry); else await fs.writeFile(registry, body);
    for (const checkOnly of [true, false]) {
      const result = await cli(project, [...base, ...(checkOnly ? ['--check'] : [])], entry);
      assert.equal(result.code, 1, body);
      assert.match(result.stderr, /Profile registry/);
      await missing(specsRoot);
    }
  }
  await fs.writeFile(registry, JSON.stringify({ ...JSON.parse(source), default: 'simple' }));
  const checked = await cli(project, [...base, '--check'], entry, { cwd: root });
  assert.equal(checked.code, 0, checked.stderr);
  assert.equal(JSON.parse(checked.stdout).profile, 'simple');
  await missing(specsRoot);
  const created = await cli(project, base, entry, { cwd: root });
  assert.equal(JSON.parse(created.stdout).profile, 'simple');
});

test('legacy BRIEF templates allow standard only and contradictory Profile metadata fails prewrite', async t => {
  const { root, project, specsRoot } = await fixture(t);
  const copy = path.join(root, 'old-template-skill'); await fs.cp(skill, copy, { recursive: true });
  const entry = path.join(copy, 'scripts/init-feature.mjs'), brief = path.join(copy, 'template/feature/BRIEF.md');
  const source = await fs.readFile(brief, 'utf8');
  const args = ['--slug', 'demo', '--title', 'Demo'];
  await fs.writeFile(brief, source.replace('| Profile | {{PROFILE}} |\n', ''));
  assert.equal((await cli(project, [...args, '--check'], entry)).code, 0);
  for (const check of [[], ['--check']]) {
    assert.equal((await cli(project, [...args, '--profile', 'simple', ...check], entry)).code, 1);
    await missing(specsRoot);
  }
  for (const body of [source.replace('{{PROFILE}}', 'standard'), source + '\n| Profile | simple |\n']) {
    await fs.writeFile(brief, body);
    assert.equal((await cli(project, [...args, '--profile', 'simple'], entry)).code, 1);
    await missing(specsRoot);
  }
  await fs.writeFile(brief, source.replace('| Profile | {{PROFILE}} |\n', ''));
  const result = await cli(project, args, entry);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).profile, 'standard');
});

test('ambiguous index tables fail before the first write', async t => {
  const { project, specsRoot } = await fixture(t);
  await fs.mkdir(specsRoot);
  const roadmap = path.join(specsRoot, 'ROADMAP.md');
  const original = (await indexTemplate()).replace('## 进行中', '| 第二张表 |\n|---|\n\n## 进行中');
  await fs.writeFile(roadmap, original);
  const io = { ...fs };
  for (const method of ['mkdir', 'writeFile', 'rename', 'link']) io[method] = async () => { throw Error(`Unexpected write: ${method}`); };
  await assert.rejects(initializeFeature({ ...defaultOptions, project }, { io }), e => e.exitCode === 2 && /ambiguous/.test(e.message));
  assert.equal(await fs.readFile(roadmap, 'utf8'), original);
});

test('legacy missing Profile cannot disagree with a changed registry default', async t => {
  const { root, project, specsRoot } = await fixture(t);
  const copy = path.join(root, 'legacy-default'); await fs.cp(skill, copy, { recursive: true });
  const registry = path.join(copy, 'references/FEATURE_PROFILES.json');
  const definition = JSON.parse(await fs.readFile(registry, 'utf8'));
  definition.default = 'simple'; await fs.writeFile(registry, JSON.stringify(definition));
  const brief = path.join(copy, 'template/feature/BRIEF.md');
  await fs.writeFile(brief, (await fs.readFile(brief, 'utf8')).replace('| Profile | {{PROFILE}} |\n', ''));
  for (const extra of [[], ['--check']]) {
    const result = await cli(project, ['--slug', 'demo', '--title', 'Demo', '--profile', 'standard', ...extra], path.join(copy, 'scripts/init-feature.mjs'));
    assert.equal(result.code, 1);
    assert.match(result.stderr, /BRIEF template/);
    await missing(specsRoot);
  }
});

test('Profile examples outside the metadata table cannot authorize simple initialization', async t => {
  const { root, project, specsRoot } = await fixture(t);
  const copy = path.join(root, 'profile-examples'); await fs.cp(skill, copy, { recursive: true });
  const entry = path.join(copy, 'scripts/init-feature.mjs'), brief = path.join(copy, 'template/feature/BRIEF.md');
  const source = (await fs.readFile(brief, 'utf8')).replace('| Profile | {{PROFILE}} |\n', '');
  const row = '| Profile | {{PROFILE}} |';
  const examples = [
    `<!-- Retired metadata\n${row}\n-->`,
    `\x60\x60\x60markdown\n${row}\n\x60\x60\x60`,
    `~~~markdown\n${row}\n~~~`,
    `\x60\x60\x60\x60markdown\n\x60\x60\x60\n${row}\n\x60\x60\x60\x60`,
    `    ${row}`,
    `| 示例 | 值 |\n|---|---|\n${row}`,
  ];
  const before = await fs.readdir(project);
  for (const example of examples) {
    await fs.writeFile(brief, source + '\n' + example + '\n');
    for (const check of [[], ['--check']]) {
      const result = await cli(project, ['--slug', 'example', '--title', '示例', '--profile', 'simple', ...check], entry);
      assert.equal(result.code, 1, example);
      assert.match(result.stderr, /BRIEF template/);
      await missing(specsRoot);
      assert.deepEqual(await fs.readdir(project), before);
    }
  }
});

test('real Profile metadata coexists with hidden examples and legacy default remains supported', async t => {
  const { root, project, specsRoot } = await fixture(t);
  const copy = path.join(root, 'visible-profile'); await fs.cp(skill, copy, { recursive: true });
  const entry = path.join(copy, 'scripts/init-feature.mjs'), brief = path.join(copy, 'template/feature/BRIEF.md');
  const source = await fs.readFile(brief, 'utf8');
  const examples = '\n<!--\n| Profile | invalid |\n-->\n\x60\x60\x60markdown\n<!-- unclosed sample comment\n| Profile | invalid |\n\x60\x60\x60\n~~~\n| Profile | invalid |\n~~~\n    | Profile | invalid |\n';
  // Samples before metadata must not hide the actual table; CRLF is also supported.
  await fs.writeFile(brief, (examples + source).replaceAll('\n', '\r\n'));
  for (const profile of ['simple', 'standard']) {
    const args = ['--slug', profile, '--title', '有效元数据：`<!--` 与 ``a`<!--``', '--profile', profile];
    const checked = await cli(project, [...args, '--check'], entry);
    assert.equal(checked.code, 0, checked.stderr);
    const result = await cli(project, args, entry);
    assert.equal(result.code, 0, result.stderr);
    const created = JSON.parse(result.stdout);
    assert.equal(created.profile, profile);
    assert.ok((await fs.readFile(created.brief, 'utf8')).includes(`| Profile | ${profile} |\r\n`));
    assert.ok((await fs.readFile(created.roadmap, 'utf8')).includes(`| ${profile} | P1 |`));
  }
  await fs.writeFile(brief, source.replace('| Profile | {{PROFILE}} |\n', '') + '\n<!--\n| Profile | {{PROFILE}} |\n-->\n');
  const legacy = await cli(project, ['--slug', 'legacy', '--title', '旧模板', '--summary', '保留字面 {{PROFILE}}'], entry);
  assert.equal(legacy.code, 0, legacy.stderr);
  assert.equal(JSON.parse(legacy.stdout).profile, 'standard');
  assert.ok((await fs.readFile(JSON.parse(legacy.stdout).brief, 'utf8')).includes('保留字面 {{PROFILE}}'));
  assert.equal((await featureNames(specsRoot)).length, 3);
});

test('rendered input cannot hide a modern Profile field and leave an inconsistent index', async t => {
  const { project, specsRoot } = await fixture(t);
  for (const profile of ['simple', 'standard']) {
    for (const checkOnly of [true, false]) {
      await assert.rejects(initializeFeature({ project, slug: 'hidden', title: '<!--', profile }, { checkOnly }), /BRIEF template/);
      await missing(specsRoot);
      assert.deepEqual(await fs.readdir(project), ['go.mod']);
    }
  }
});
