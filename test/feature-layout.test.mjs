import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { initializeFeature } from '../assets/skills/my-create-feature/scripts/init-feature.mjs';
import { defaultLayout, validateFeature } from '../assets/skills/my-create-feature/scripts/validate-feature.mjs';
import { apply } from '../src/project.mjs';

const exec = promisify(execFile);
const validator = fileURLToPath(new URL('../assets/skills/my-create-feature/scripts/validate-feature.mjs', import.meta.url));
async function fixture(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'feature-layout-')));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const project = path.join(root, 'Python 项目'); await fs.mkdir(project);
  await fs.writeFile(path.join(project, 'pyproject.toml'), '[project]\nname="fixture"\nversion="0.1.0"\n');
  const result = await initializeFeature({ project, slug: 'minimal', title: '按需目录' });
  return { root, project, feature: result.path, specsRoot: path.dirname(result.path) };
}
async function snapshot(root) {
  const entries = {};
  async function walk(relative = '') {
    for (const entry of await fs.readdir(path.join(root, relative), { withFileTypes: true })) {
      const p = path.join(relative, entry.name);
      if (entry.isDirectory()) { entries[p + '/'] = 'directory'; await walk(p); }
      else if (entry.isSymbolicLink()) entries[p] = 'link:' + await fs.readlink(path.join(root, p));
      else entries[p] = (await fs.readFile(path.join(root, p))).toString('base64');
    }
  }
  await walk(); return entries;
}

test('read-only CLI accepts the minimal Feature without creating any future directories', async t => {
  const { project, feature } = await fixture(t), before = await snapshot(project);
  const { stdout } = await exec(process.execPath, [validator, '--feature', feature]);
  const result = JSON.parse(stdout);
  assert.equal(result.valid, true); assert.deepEqual(result.presentArtifacts, []);
  assert.deepEqual(result.issues, []); assert.deepEqual(result.warnings, []);
  assert.deepEqual(await snapshot(project), before);
  assert.deepEqual((await fs.readdir(feature)).sort(), ['BRIEF.md', 'context']);
});

test('a requested stage requires its real file, while later stages remain optional', async t => {
  const { feature } = await fixture(t);
  const missing = await validateFeature(feature, { artifact: 'prd' });
  assert.equal(missing.valid, false); assert.ok(missing.issues.some(i => i.code === 'missing-requested-artifact'));
  await fs.mkdir(path.join(feature, 'spec')); await fs.writeFile(path.join(feature, 'spec/PRD.md'), '# 产品规格\n');
  const result = await validateFeature(feature, { artifact: 'prd' });
  assert.equal(result.valid, true); assert.deepEqual(result.presentArtifacts, ['prd']);
  assert.deepEqual((await fs.readdir(feature)).sort(), ['BRIEF.md', 'context', 'spec']);
  assert.match(await fs.readFile(path.join(feature, 'BRIEF.md'), 'utf8'), /\| Phase \| draft \|/);
});

test('misplaced and duplicate outputs are reported without modifying them or raw same-name materials', async t => {
  const { project, feature } = await fixture(t);
  await fs.writeFile(path.join(feature, 'context/PRD.md'), '# 原始素材\n');
  assert.equal((await validateFeature(feature)).valid, true);
  await fs.mkdir(path.join(feature, 'spec')); await fs.writeFile(path.join(feature, 'spec/PRD.md'), '# 真源\n');
  await fs.writeFile(path.join(feature, 'PRD.md'), '# 误放文件及人工批注\n');
  const before = await snapshot(project), result = await validateFeature(feature);
  assert.equal(result.valid, false);
  assert.ok(result.issues.some(i => i.code === 'misplaced-artifact' && i.path === 'PRD.md'));
  assert.ok(result.issues.some(i => i.code === 'duplicate-artifact'));
  assert.deepEqual(await snapshot(project), before);
});

test('project-specific layout is used and subsequent installation preserves its edits', async t => {
  const { root, project, feature, specsRoot } = await fixture(t);
  const filename = path.join(specsRoot, 'FEATURE_LAYOUT.json');
  const layout = JSON.parse(await fs.readFile(defaultLayout, 'utf8'));
  layout.artifacts.find(a => a.id === 'prd').path = 'specification/PRD.md';
  const custom = JSON.stringify(layout, null, 2) + '\n'; await fs.writeFile(filename, custom);
  await fs.mkdir(path.join(feature, 'specification')); await fs.writeFile(path.join(feature, 'specification/PRD.md'), '# 定制路径\n');
  assert.equal((await validateFeature(feature, { artifact: 'prd' })).valid, true);
  await apply(path.join(root, 'personal'), project, { version: 1, tools: ['codex'], skills: ['my-create-feature'] });
  assert.equal(await fs.readFile(filename, 'utf8'), custom);
  assert.equal((await validateFeature(feature, { artifact: 'prd' })).valid, true);
});

test('legacy empty directories and placeholders are warnings and stay untouched', async t => {
  const { project, feature } = await fixture(t);
  await fs.mkdir(path.join(feature, 'design')); await fs.mkdir(path.join(feature, 'review'));
  await fs.writeFile(path.join(feature, 'review/.gitkeep'), '');
  const before = await snapshot(project), result = await validateFeature(feature);
  assert.equal(result.valid, true);
  assert.ok(result.warnings.some(i => i.code === 'empty-directory'));
  assert.ok(result.warnings.some(i => i.code === 'legacy-placeholder'));
  assert.deepEqual(await snapshot(project), before);
});

test('missing initial files and symlinks are reported; malformed contracts and unknown IDs fail read-only', async t => {
  const { root, project, feature, specsRoot } = await fixture(t);
  await fs.unlink(path.join(feature, 'context/_INDEX.md'));
  const outside = path.join(root, 'outside.md'); await fs.writeFile(outside, '# 原件\n');
  await fs.symlink(outside, path.join(feature, 'PRD.md'));
  const before = await snapshot(project), result = await validateFeature(feature);
  assert.equal(result.valid, false);
  assert.ok(result.issues.some(i => i.code === 'missing-initial-file'));
  assert.ok(result.issues.some(i => i.code === 'symlink'));
  await assert.rejects(validateFeature(feature, { artifact: 'nonexistent' }), /Unknown artifact/);
  assert.deepEqual(await snapshot(project), before);
  const layout = JSON.parse(await fs.readFile(defaultLayout, 'utf8'));
  layout.artifacts[0].path = '../outside.md';
  await fs.writeFile(path.join(specsRoot, 'FEATURE_LAYOUT.json'), JSON.stringify(layout));
  const malformed = await snapshot(project);
  await assert.rejects(validateFeature(feature), /Invalid/);
  assert.deepEqual(await snapshot(project), malformed);
  assert.equal(await fs.readFile(outside, 'utf8'), '# 原件\n');
});

test('legacy placeholders left in an upgraded Skill template are ignored without deleting them', async t => {
  const { root, project } = await fixture(t);
  const copy = path.join(root, 'legacy-template-skill');
  await fs.cp(path.dirname(path.dirname(validator)), copy, { recursive: true });
  const placeholder = path.join(copy, 'template/feature/design/.gitkeep');
  await fs.mkdir(path.dirname(placeholder), { recursive: true }); await fs.writeFile(placeholder, '');
  const result = await exec(process.execPath, [path.join(copy, 'scripts/init-feature.mjs'), '--project', project, '--slug', 'upgraded', '--title', '旧模板兼容']);
  const created = JSON.parse(result.stdout);
  assert.deepEqual(created.files.sort(), ['BRIEF.md', 'context/_INDEX.md']);
  assert.deepEqual((await fs.readdir(created.path)).sort(), ['BRIEF.md', 'context']);
  assert.equal(await fs.readFile(placeholder, 'utf8'), '');
});

test('project initialization layout conflicts stop with exit 2 and preserve the project', async t => {
  const { project, specsRoot } = await fixture(t);
  const layout = JSON.parse(await fs.readFile(defaultLayout, 'utf8'));
  layout.initialFiles.push('PROJECT_NOTES.md');
  await fs.writeFile(path.join(specsRoot, 'FEATURE_LAYOUT.json'), JSON.stringify(layout));
  const before = await snapshot(project);
  await assert.rejects(initializeFeature({ project, slug: 'new-feature', title: '新需求' }), e => e.exitCode === 2);
  assert.deepEqual(await snapshot(project), before);
});

test('later artifacts accidentally added to the initialization template are rejected before project writes', async t => {
  const { root, project, specsRoot } = await fixture(t);
  const copy = path.join(root, 'standalone-skill');
  await fs.cp(path.dirname(path.dirname(validator)), copy, { recursive: true });
  await fs.mkdir(path.join(copy, 'template/feature/spec'), { recursive: true });
  await fs.writeFile(path.join(copy, 'template/feature/spec/PRD.md'), '# 过早生成\n');
  const before = await snapshot(project);
  await assert.rejects(exec(process.execPath, [path.join(copy, 'scripts/init-feature.mjs'), '--project', project, '--slug', 'later', '--title', '后续目录']), e => e.code === 1 && /initialFiles/.test(e.stderr));
  assert.deepEqual(await snapshot(project), before);
  assert.deepEqual((await fs.readdir(specsRoot)).sort(), ['999-minimal', 'ROADMAP.md']);
});

test('simple design without PRD uses the same custom layout while an explicit PRD check still requires a real file', async t => {
  const { project, specsRoot } = await fixture(t);
  const layout = JSON.parse(await fs.readFile(defaultLayout, 'utf8'));
  layout.artifacts.find(a => a.id === 'design').path = 'notes/architecture.md';
  await fs.writeFile(path.join(specsRoot, 'FEATURE_LAYOUT.json'), JSON.stringify(layout));
  const created = await initializeFeature({ project, slug: 'simple-design', title: '直接设计', profile: 'simple' });
  await fs.mkdir(path.join(created.path, 'notes'));
  await fs.writeFile(path.join(created.path, 'notes/architecture.md'), '# 技术方案\nProfile: simple\n需求依据：BRIEF\nAC-01：本地样例可查询。\n');
  assert.equal((await validateFeature(created.path)).valid, true);
  assert.equal((await validateFeature(created.path, { artifact: 'design' })).valid, true);
  assert.equal((await validateFeature(created.path, { artifact: 'prd' })).valid, false);
  await assert.rejects(fs.stat(path.join(created.path, 'spec')), { code: 'ENOENT' });
});
