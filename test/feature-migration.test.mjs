import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { equivalent, parseDelta } from '../src/spec-delta.mjs';
import { planMigration, submitMigration } from '../src/feature-migration.mjs';
import { alignChange } from '../src/openspec-align.mjs';
import { planRecovery, submitRecovery } from '../src/feature-transaction.mjs';

const exec = promisify(execFile);
const cli = path.join(import.meta.dirname, '../bin/my-ai-infra.mjs');
const current = `# Session

## Purpose

Sessions expire.

## Requirements

### Requirement: Timeout

The timeout is 15 minutes.

#### Scenario: Expired

- GIVEN an old session
- THEN access is refused

### Requirement: Retry

The retry limit is 3.
`;
const modified = `## MODIFIED Requirements

### Requirement: Timeout

The timeout is 30 minutes.

#### Scenario: Expired

- GIVEN an old session
- THEN access is refused
`;

async function project(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'mai-migrate-')));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'openspec/changes/add-login'), { recursive: true });
  await fs.mkdir(path.join(root, 'openspec/changes/add-search'), { recursive: true });
  await fs.mkdir(path.join(root, 'openspec/changes/archive/2026-01-02-old/specs/auth'), { recursive: true });
  await fs.mkdir(path.join(root, 'openspec/specs/auth'), { recursive: true });
  await fs.writeFile(path.join(root, 'openspec/changes/add-login/proposal.md'), '# Add login\n');
  await fs.writeFile(path.join(root, 'openspec/changes/add-login/design.md'), '# Design\n');
  await fs.writeFile(path.join(root, 'openspec/changes/add-login/tasks.md'), '- [x] done\n- [ ] next step\n');
  await fs.writeFile(path.join(root, 'openspec/changes/add-login/.openspec.yaml'), 'schema: spec-driven\n');
  await fs.mkdir(path.join(root, 'openspec/changes/add-login/specs/auth'), { recursive: true });
  await fs.writeFile(path.join(root, 'openspec/changes/add-login/specs/auth/spec.md'), modified);
  await fs.writeFile(path.join(root, 'openspec/changes/add-search/proposal.md'), '# Search\n');
  await fs.writeFile(path.join(root, 'openspec/changes/add-search/tasks.md'), '- [ ] search\n');
  await fs.writeFile(path.join(root, 'openspec/changes/add-search/.openspec.yaml'), 'schema: spec-driven\n');
  await fs.writeFile(path.join(root, 'openspec/specs/auth/spec.md'), current);
  await fs.writeFile(path.join(root, 'openspec/changes/archive/2026-01-02-old/proposal.md'), 'old');
  await fs.writeFile(path.join(root, 'openspec/changes/archive/2026-01-02-old/specs/auth/spec.md'), 'historical delta\n');
  return root;
}
async function run(root, args) {
  try { return { ...await exec(process.execPath, [cli, ...args, '--project', root], { cwd: root }), code: 0 }; }
  catch (error) { if (typeof error.code !== 'number') throw error; return error; }
}

test('delta parser recognizes four operations and ignores fenced headings', () => {
  const renamed = `${modified}\n## RENAMED Requirements\n\n### Requirement: Retry\nFROM: Retry\nTO: Attempt Limit\n\n## ADDED Requirements\n\n### Requirement: Audit\n\nRecords are kept.\n\n#### Scenario: Recorded\n\n- THEN an audit entry exists\n`;
  const delta = parseDelta(renamed, 'auth');
  assert.equal(delta.findings.some(item => item.blocking), false);
  assert.equal(delta.MODIFIED[0].name, 'Timeout');
  assert.equal(delta.RENAMED[0].from, 'Retry');
  assert.equal(delta.RENAMED[0].to, 'Attempt Limit');
  assert.equal(delta.ADDED[0].name, 'Audit');
  const fenced = parseDelta('## ADDED Requirements\n\n```\n## REMOVED Requirements\n### Requirement: Hidden\n```\n\n### Requirement: Visible\n\nShown.\n', 'auth');
  assert.deepEqual(fenced.ADDED.map(item => item.name), ['Visible']);
  assert.equal(fenced.REMOVED.length, 0);
});

test('preview is read-only and single import keeps the sibling change and source specs', async t => {
  const root = await project(t);
  const before = await fs.readFile(path.join(root, 'openspec/specs/auth/spec.md'));
  const preview = await planMigration(root, { change: 'add-login' });
  assert.equal(preview.canApply, true);
  assert.equal(preview.created, 1);
  assert.match(preview.messages[0], /单变更导入/);
  assert.deepEqual(await fs.readFile(path.join(root, 'openspec/specs/auth/spec.md')), before);
  const submitted = await submitMigration(root, { change: 'add-login' }, preview.revision);
  assert.equal(submitted.applied, true);
  const feature = preview.items[0].feature;
  const tasks = await fs.readFile(path.join(root, feature, 'design/TECH_DESIGN.md'), 'utf8');
  assert.match(tasks, /- \[x\] done\n- \[ \] next step/);
  const prd = await fs.readFile(path.join(root, feature, 'spec/PRD.md'), 'utf8');
  assert.match(prd, /验收标准/);
  assert.match(prd, /### AC-01：Expired/);
  assert.equal(await fs.lstat(path.join(root, feature, 'context/openspec')).then(() => 'present', error => error.code), 'ENOENT');
  assert.equal(await fs.lstat(path.join(root, feature, 'spec/deltas')).then(() => 'present', error => error.code), 'ENOENT');
  const brief = await fs.readFile(path.join(root, feature, 'BRIEF.md'), 'utf8');
  assert.match(brief, /下一项可执行任务：next step/);
  assert.match(brief, /spec\/PRD.md/);
  assert.equal(await fs.readFile(path.join(root, 'openspec/changes/add-search/proposal.md'), 'utf8'), '# Search\n');
  assert.deepEqual(await fs.readFile(path.join(root, 'openspec/specs/auth/spec.md')), before);
  const again = await planMigration(root, { change: 'add-login' });
  assert.equal(again.reused, 1);
  assert.equal(again.created, 0);
  assert.equal(again.items[0].feature, feature);
  const roadmap = await fs.readFile(path.join(root, 'mai-specs/ROADMAP.md'), 'utf8');
  assert.equal(roadmap.split(feature.split('/').at(-1)).length - 1, 1);
});

test('batch import is one revision and a conflicting item blocks the whole batch', async t => {
  const root = await project(t);
  const preview = await planMigration(root, { changes: 'add-search,add-login' });
  assert.equal(preview.canApply, true);
  assert.equal(preview.created, 2);
  assert.match(preview.messages.join('\n'), /依赖关系/);
  const submitted = await submitMigration(root, { changes: 'add-search,add-login' }, preview.revision);
  assert.equal(submitted.applied, true);
  assert.equal(new Set(preview.items.map(item => item.feature)).size, 2);
  const feature = preview.items.find(item => item.id === 'add-login').feature;
  await fs.writeFile(path.join(root, 'openspec/changes/add-login/proposal.md'), '# Diverged source\n');
  await fs.writeFile(path.join(root, feature, 'spec/PRD.md'), '# Diverged target\n');
  const blocked = await planMigration(root, { changes: 'add-login,add-search' });
  assert.equal(blocked.canApply, false);
  assert.match(blocked.messages.join('\n'), /无法继续迁移/);
});

test('stale revision and symlink input do not write', async t => {
  const root = await project(t);
  const preview = await planMigration(root, { active: true });
  await fs.writeFile(path.join(root, 'openspec/changes/add-login/tasks.md'), '- [ ] changed\n');
  await assert.rejects(submitMigration(root, { active: true }, preview.revision), /已变化/);
  assert.equal(await fs.readdir(path.join(root, 'mai-specs')).catch(error => error.code), 'ENOENT');
  await fs.symlink(root, path.join(root, 'openspec/changes/add-login/external'));
  await assert.rejects(planMigration(root, { change: 'add-login' }), /软链接/);
});

test('cutover copies current specs without replaying active or historical deltas', async t => {
  const root = await project(t);
  const preview = await planMigration(root, { all: true });
  assert.equal(preview.authority, 'mai');
  const submitted = await submitMigration(root, { all: true }, preview.revision);
  assert.equal(submitted.applied, true);
  assert.equal(await fs.readFile(path.join(root, 'mai-specs/specs/auth/spec.md'), 'utf8'), current);
  const state = JSON.parse(await fs.readFile(path.join(root, 'mai-specs/.mai-migration/state.json'), 'utf8'));
  assert.equal(state.authority.owner, 'mai');
  const index = await fs.readFile(path.join(root, 'mai-specs/history/INDEX.md'), 'utf8');
  assert.match(index, /2026-01-02-old/);
  assert.match(index, /auth/);
  const archived = submitted.items.find(item => item.id === 'old');
  assert.ok(archived.feature);
  const archivedName = archived.feature.split('/').at(-1);
  assert.match(await fs.readFile(path.join(root, archived.feature, 'spec/PRD.md'), 'utf8'), /PRD/);
  const brief = await fs.readFile(path.join(root, archived.feature, 'BRIEF.md'), 'utf8');
  assert.match(brief, /\| Phase \| done \|/);
  assert.match(brief, /ROADMAP 记在已完成/);
  assert.match(await fs.readFile(path.join(root, archived.feature, 'context/_INDEX.md'), 'utf8'), /spec\/PRD\.md/);
  assert.equal(await fs.lstat(path.join(root, archived.feature, 'spec/deltas')).then(() => 'present', error => error.code), 'ENOENT');
  const roadmap = await fs.readFile(path.join(root, 'mai-specs/ROADMAP.md'), 'utf8');
  assert.match(roadmap.split('## 已完成')[1], new RegExp(archivedName));
  assert.match(roadmap.split('## 进行中')[0], /add-login\/BRIEF\.md/);
  assert.match(index, new RegExp(archivedName));
  assert.equal(await fs.readFile(path.join(root, 'openspec/specs/auth/spec.md'), 'utf8'), current);
  const repeated = await planMigration(root, { all: true });
  assert.equal(repeated.actions.length, 0);
  const incremental = await planMigration(root, { change: 'add-login' });
  assert.equal(incremental.canApply, false);
  assert.match(incremental.messages.join('\n'), /不能再从 OpenSpec 增量导入/);
});

test('different source identities do not reuse a feature for the same relative path', async t => {
  const root = await project(t);
  await fs.mkdir(path.join(root, 'mai-specs/998-add-login'), { recursive: true });
  await fs.mkdir(path.join(root, 'mai-specs/.mai-migration'), { recursive: true });
  await fs.writeFile(path.join(root, 'mai-specs/998-add-login/BRIEF.md'), '# 998\n');
  const roadmap = await fs.readFile(new URL('../assets/skills/my-create-feature/template/ROADMAP.md', import.meta.url), 'utf8');
  await fs.writeFile(path.join(root, 'mai-specs/ROADMAP.md'), roadmap.replace('## 规划中\n\n| 需求 | 标题 | 规格 | 优先级 | 说明 |\n|---|---|---|---|---|', '## 规划中\n\n| 需求 | 标题 | 规格 | 优先级 | 说明 |\n|---|---|---|---|---|\n| 998 | [登录](998-add-login/BRIEF.md) | standard | P1 | 其他来源 |'));
  await fs.writeFile(path.join(root, 'mai-specs/.mai-migration/state.json'), JSON.stringify({ version: 1, authority: { owner: 'external', sourceId: null }, cutover: null, imports: { other: { 'openspec/changes/add-login': { featurePath: 'mai-specs/998-add-login', files: {} } } }, archives: {} }, null, 2) + '\n');
  const preview = await planMigration(root, { change: 'add-login' });
  assert.notEqual(preview.items[0]?.feature, 'mai-specs/998-add-login');
  assert.match(JSON.stringify(preview.findings), /add-login/);
});

test('CLI rejects mixed selectors and reports an empty active migration without writing', async t => {
  const root = await project(t);
  await fs.rm(path.join(root, 'openspec/changes/add-login'), { recursive: true });
  await fs.rm(path.join(root, 'openspec/changes/add-search'), { recursive: true });
  const empty = await run(root, ['migrate', 'openspec', '--active', '--dry-run']);
  assert.equal(empty.code, 0);
  assert.match(empty.stdout, /无可迁移项/);
  assert.equal(await fs.readdir(path.join(root, 'mai-specs')).catch(error => error.code), 'ENOENT');
  const mixed = await run(root, ['migrate', 'openspec', '--active', '--all', '--dry-run']);
  assert.equal(mixed.code, 1);
  const recover = await run(root, ['migrate', 'recover']);
  assert.equal(recover.code, 1);
  assert.match(recover.stderr, /dry-run/);
});

test('CLI accepts space-separated changes and places revision at the end', async t => {
  const root = await project(t);
  const preview = await run(root, ['migrate', 'openspec', '--changes', 'add-login', 'add-search', '--dry-run']);
  assert.equal(preview.code, 0, preview.stderr);
  const body = JSON.parse(preview.stdout);
  assert.deepEqual(body.selection, ['add-login', 'add-search']);
  assert.deepEqual(Object.keys(body).slice(-2), ['revision', 'submit']);
  assert.match(body.submit, /--changes add-login,add-search --revision [a-f0-9]{64}/);
  assert.match(body.messages.at(-1), new RegExp(body.revision));
  const comma = await run(root, ['migrate', 'openspec', '--changes', 'add-search,add-login', '--dry-run']);
  assert.equal(comma.code, 0, comma.stderr);
  assert.equal(JSON.parse(comma.stdout).revision, body.revision);
});

test('an injected index failure rolls the copied change back', async t => {
  const root = await project(t);
  const preview = await planMigration(root, { change: 'add-login' });
  await assert.rejects(submitMigration(root, { change: 'add-login' }, preview.revision, { failAfter: 'before:index' }), /注入失败/);
  assert.equal(await fs.readdir(path.join(root, 'mai-specs')).catch(error => error.code), 'ENOENT');
  assert.equal(await fs.readFile(path.join(root, 'openspec/changes/add-login/tasks.md'), 'utf8'), '- [x] done\n- [ ] next step\n');
});

test('archive command is not part of migration', async t => {
  const root = await project(t);
  const result = await run(root, ['feature', 'archive', '999-add-login', '--dry-run']);
  assert.equal(result.code, 1);
  assert.match(`${result.stderr}`, /Unknown command/);
});

test('a committed transaction keeps its files and recovery only removes the journal', async t => {
  const root = await project(t);
  const preview = await planMigration(root, { change: 'add-login' });
  const submitted = await submitMigration(root, { change: 'add-login' }, preview.revision, { failAfter: 'before-cleanup' });
  assert.equal(submitted.cleanupPending, true);
  const feature = preview.items[0].feature;
  const tasks = await fs.readFile(path.join(root, feature, 'design/TECH_DESIGN.md'), 'utf8');
  const ownerFile = path.join(root, 'mai-specs/.feature-init.lock/owner.json');
  const owner = JSON.parse(await fs.readFile(ownerFile, 'utf8'));
  owner.pid = 2147483647;
  await fs.writeFile(ownerFile, JSON.stringify(owner));
  const recovery = await planRecovery(root);
  assert.match(recovery.messages[0], /只会清理日志/);
  await submitRecovery(root, recovery.revision);
  assert.equal(await fs.readFile(path.join(root, feature, 'design/TECH_DESIGN.md'), 'utf8'), tasks);
  assert.equal(await fs.lstat(path.join(root, 'mai-specs/.mai-migration/pending')).then(() => 'present', error => error.code), 'ENOENT');
});

test('an external file created before linking is kept and a dead lock is not removed', async t => {
  const root = await project(t);
  const preview = await planMigration(root, { change: 'add-login' });
  let kept;
  await assert.rejects(submitMigration(root, { change: 'add-login' }, preview.revision, {
    async beforeLink(entry) {
      if (kept) return;
      kept = entry.path;
      await fs.writeFile(path.join(root, entry.path), 'external-keep\n');
    },
  }), /目标已存在/);
  assert.equal(await fs.readFile(path.join(root, kept), 'utf8'), 'external-keep\n');
  const lock = path.join(root, 'mai-specs/.feature-init.lock');
  await fs.rm(path.join(root, 'mai-specs'), { recursive: true, force: true });
  await fs.mkdir(lock, { recursive: true });
  const owner = JSON.stringify({ token: 'dead', pid: 2147483647 }) + '\n';
  await fs.writeFile(path.join(lock, 'owner.json'), owner);
  await assert.rejects(submitMigration(root, { change: 'add-login' }, preview.revision), /进程已退出/);
  assert.equal(await fs.readFile(path.join(lock, 'owner.json'), 'utf8'), owner);
});

test('a later source edit keeps a previously retained local copy', async t => {
  const root = await project(t);
  let preview = await planMigration(root, { change: 'add-login' });
  await submitMigration(root, { change: 'add-login' }, preview.revision);
  const proposal = path.join(root, preview.items[0].feature, 'spec/PRD.md');
  await fs.writeFile(proposal, '# Local edit\n');
  preview = await planMigration(root, { change: 'add-login' });
  assert.equal(preview.canApply, true);
  await submitMigration(root, { change: 'add-login' }, preview.revision);
  await fs.writeFile(path.join(root, 'openspec/changes/add-login/proposal.md'), '# Source edit\n');
  preview = await planMigration(root, { change: 'add-login' });
  assert.equal(preview.canApply, false);
  assert.match(preview.messages.join('\n'), /独立修改/);
  assert.equal(await fs.readFile(proposal, 'utf8'), '# Local edit\n');
});

test('an imported change archived by OpenSpec can still be cut over', async t => {
  const root = await project(t);
  const preview = await planMigration(root, { change: 'add-login' });
  await submitMigration(root, { change: 'add-login' }, preview.revision);
  const feature = preview.items[0].feature;
  await fs.rename(path.join(root, 'openspec/changes/add-login'), path.join(root, 'openspec/changes/archive/2026-02-02-add-login'));
  const cutover = await planMigration(root, { all: true });
  assert.equal(cutover.canApply, true, cutover.messages.join('\n'));
  await submitMigration(root, { all: true }, cutover.revision);
  assert.match(await fs.readFile(path.join(root, feature, 'spec/PRD.md'), 'utf8'), /Add login/);
  assert.equal(await fs.lstat(path.join(root, feature, 'context/openspec')).then(() => 'present', error => error.code), 'ENOENT');
  const index = await fs.readFile(path.join(root, 'mai-specs/history/INDEX.md'), 'utf8');
  const featureName = feature.split('/').at(-1);
  assert.match(index, /2026-02-02-add-login/);
  assert.match(index, new RegExp(featureName));
  const roadmap = await fs.readFile(path.join(root, 'mai-specs/ROADMAP.md'), 'utf8');
  assert.match(roadmap.split('## 已完成')[1], new RegExp(featureName));
  assert.match(await fs.readFile(path.join(root, feature, 'BRIEF.md'), 'utf8'), /\| Phase \| done \|/);
  assert.equal(roadmap.split(featureName).length - 1, 1);
  assert.equal(await fs.readFile(path.join(root, 'mai-specs/specs/auth/spec.md'), 'utf8'), current);
});

test('a removed imported change still blocks cutover', async t => {
  const root = await project(t);
  const preview = await planMigration(root, { change: 'add-login' });
  await submitMigration(root, { change: 'add-login' }, preview.revision);
  await fs.rm(path.join(root, 'openspec/changes/add-login'), { recursive: true });
  const cutover = await planMigration(root, { all: true });
  assert.equal(cutover.canApply, false);
  assert.match(cutover.messages.join('\n'), /不在活动目录或归档历史中/);
});

test('links outside the change are recorded without rewriting the source', async t => {
  const root = await project(t);
  const proposal = path.join(root, 'openspec/changes/add-login/proposal.md');
  const body = '# Add login\n\n[规格](../../specs/auth/spec.md)\n\n[缺失](../../missing.md)\n';
  await fs.writeFile(proposal, body);
  const preview = await planMigration(root, { change: 'add-login' });
  assert.equal(preview.canApply, true);
  const notes = preview.findings.filter(item => item.code === 'link').map(item => item.message).join('\n');
  assert.match(notes, /openspec\/specs\/auth\/spec.md/);
  assert.match(notes, /missing.md/);
  await submitMigration(root, { change: 'add-login' }, preview.revision);
  const index = await fs.readFile(path.join(root, preview.items[0].feature, 'context/_INDEX.md'), 'utf8');
  assert.match(index, /mai-specs\/specs\/auth\/spec.md/);
  assert.match(index, /失效/);
  assert.equal(await fs.readFile(proposal, 'utf8'), body);
  const aligned = await fs.readFile(path.join(root, preview.items[0].feature, 'spec/PRD.md'), 'utf8');
  assert.match(aligned, /openspec\/specs\/auth\/spec.md/);
  assert.equal(await fs.lstat(path.join(root, preview.items[0].feature, 'context/openspec')).then(() => 'present', error => error.code), 'ENOENT');
});

test('OpenSpec proposal, design and capability sections align into MAI artifacts', () => {
  const proposal = '## Why\n\n需要预约页。\n\n## What Changes\n\n- 新增预约页\n\n## Capabilities\n\n### New Capabilities\n\n- `checkup/booking-page`: 预约页\n\n## Impact\n\n- 新增 web/\n';
  const design = '## Context\n\n没有前端。\n\n## Goals / Non-Goals\n\n**Goals:**\n\n- 完成预约页\n\n**Non-Goals:**\n\n- 不做支付\n\n## Decisions\n\n使用 React。\n\n## Risks / Trade-offs\n\n- [刷新丢失] → 接受\n\n## Migration Plan\n\n新增前端。\n';
  const delta = '## Purpose\n\n完成预约。\n\n## ADDED Requirements\n\n### Requirement: Show packages\n\n系统 SHALL 展示套餐。\n\n#### Scenario: Available\n\n- **WHEN** 打开页面\n- **THEN** 展示套餐\n';
  const aligned = alignChange({
    id: 'add-checkup-booking-page', featureName: '999-add-checkup-booking-page', profile: 'standard',
    sourcePath: 'openspec/changes/add-checkup-booking-page',
    files: [
      { relative: 'proposal.md', bytes: Buffer.from(proposal) },
      { relative: 'design.md', bytes: Buffer.from(design) },
      { relative: 'tasks.md', bytes: Buffer.from('- [ ] 1.1 创建应用\n') },
      { relative: 'specs/checkup/booking-page/spec.md', bytes: Buffer.from(delta) },
      { relative: '.openspec.yaml', bytes: Buffer.from('schema: spec-driven\n') },
    ],
  });
  const prd = aligned.outputs.find(item => item.targetRel === 'spec/PRD.md').bytes.toString('utf8');
  assert.match(prd, /需要预约页/);
  assert.match(prd, /新增预约页/);
  assert.match(prd, /checkup\/booking-page/);
  assert.match(prd, /新增 web/);
  assert.match(prd, /完成预约/);
  assert.match(prd, /系统 SHALL 展示套餐/);
  assert.match(prd, /### AC-01：Available/);
  assert.match(prd, /\*\*When\*\*：打开页面/);
  assert.match(prd, /不做支付/);
  assert.doesNotMatch(prd, /没有单独的范围段落|没有 What Changes/);
  assert.deepEqual(aligned.warnings, []);
  const tech = aligned.outputs.find(item => item.targetRel === 'design/TECH_DESIGN.md').bytes.toString('utf8');
  assert.match(tech, /没有前端/);
  assert.match(tech, /使用 React/);
  assert.match(tech, /刷新丢失/);
  assert.match(tech, /新增前端/);
  assert.match(tech, /- \[ \] 1\.1 创建应用/);
  assert.equal(aligned.outputs.some(item => item.targetRel === '.openspec.yaml' || item.targetRel.startsWith('spec/deltas/')), false);
  const mismatched = alignChange({
    id: 'add-checkup-booking-page', featureName: '999-add-checkup-booking-page', profile: 'standard',
    sourcePath: 'openspec/changes/add-checkup-booking-page',
    files: [
      { relative: 'proposal.md', bytes: Buffer.from(proposal) },
      { relative: 'tasks.md', bytes: Buffer.from('- [ ] 1.1 创建应用\n') },
      { relative: 'specs/checkup/report/spec.md', bytes: Buffer.from(delta) },
    ],
  });
  assert.match(mismatched.warnings.join('\n'), /checkup\/booking-page/);
  assert.match(mismatched.warnings.join('\n'), /checkup\/report/);
});

test('a later task edit refreshes the BRIEF current task', async t => {
  const root = await project(t);
  let preview = await planMigration(root, { change: 'add-login' });
  await submitMigration(root, { change: 'add-login' }, preview.revision);
  await fs.writeFile(path.join(root, 'openspec/changes/add-login/tasks.md'), '- [x] done\n- [x] next step\n- [ ] third\n');
  preview = await planMigration(root, { change: 'add-login' });
  assert.equal(preview.canApply, true, preview.messages.join('\n'));
  await submitMigration(root, { change: 'add-login' }, preview.revision);
  const brief = await fs.readFile(path.join(root, preview.items[0].feature, 'BRIEF.md'), 'utf8');
  assert.match(brief, /下一项可执行任务：third/);
});

test('newline differences are equivalent and an unsupported heading blocks the delta', () => {
  assert.equal(equivalent('a\r\nb\n', 'a\nb\n'), true);
  const blocked = parseDelta('## CHANGED Requirements\n\n### Requirement: Timeout\n\nNo.\n', 'auth');
  assert.equal(blocked.findings.some(item => item.blocking), true);
});
