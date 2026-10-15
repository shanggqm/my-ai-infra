import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { bindMemoryProject, readMemory, saveMemory, putMemory, deleteMemory, recallMemory, parseMemory, renderMemory, MEMORY_HEADER } from '../src/memory.mjs';
import { apply, plan } from '../src/project.mjs';
import { read, write, json } from '../src/fs.mjs';
import { setup, config } from '../src/store.mjs';
import { startWeb } from '../src/web.mjs';
const exec = promisify(execFile);
const chosen = { version: 1, tools: ['codex'], skills: ['my-create-memory'] };
const entry = (overrides = {}) => ({ title: '最小方案', id: 'pref-minimal', key: 'architecture.complexity', scenes: ['design'], status: 'approved', basis: 'explicit', source: '用户消息 B', evidence: '以后在这个项目先给最小方案', updated: '2026-10-14', body: '先给出满足当前验收的最小方案；保留团队硬约束。', ...overrides });
async function fixture(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'memory-test-')));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const home = path.join(root, 'personal'), project = path.join(root, 'project');
  await fs.mkdir(project); await write(project, '.my-ai-infra.json', json(chosen));
  return { root, home, project };
}
const exists = async file => Boolean(await fs.stat(file).catch(() => null));

test('read and recall are read-only; absent memory does not seed or bind', async t => {
  const { home, project } = await fixture(t);
  assert.equal((await readMemory(home, { project })).revision, 'missing');
  assert.equal((await recallMemory(home, { project, scene: 'design' })).context, '');
  assert.equal(await exists(home), false);
  assert.deepEqual(JSON.parse(await read(project, '.my-ai-infra.json')), chosen);
});

test('Markdown round trips and rejects inferred approval, duplicates and unbounded growth', () => {
  assert.deepEqual(parseMemory(renderMemory([entry()])), [entry()]);
  assert.throws(() => renderMemory([entry({ basis: 'inferred' })]), /推断/);
  assert.throws(() => parseMemory(renderMemory([entry(), entry({ id: 'other', body: 'Different' })])), /重复/);
  assert.throws(() => parseMemory(renderMemory([entry(), entry({ id: 'other', key: 'other' })])), /重复/);
  const candidates = Array.from({ length: 6 }, (_, i) => entry({ id: `p-${i}`, key: `k-${i}`, status: 'inbox', basis: 'inferred', body: `候选 ${i}` }));
  assert.throws(() => parseMemory(renderMemory(candidates)), /上限/);
  assert.throws(() => renderMemory([entry({ body: 'x'.repeat(801) })]), /800/);
  assert.throws(() => parseMemory(MEMORY_HEADER + 'unstructured text'), /二级标题/);
  assert.throws(() => renderMemory([entry({ scenes: ['unknown'] })]), /Scenes/);
});

test('stable identity survives moves and sync; explicit fork and rebind preserve original memory', async t => {
  const { root, home, project } = await fixture(t);
  const bound = await bindMemoryProject(home, project);
  assert.equal(await exists(bound.path), false);
  await putMemory(home, { project }, renderMemory([entry()]), 'missing');
  const moved = path.join(root, 'moved'); await fs.rename(project, moved);
  assert.equal((await readMemory(home, { project: moved })).entries.length, 1);
  await apply(home, moved, chosen);
  assert.equal((await plan(home, moved, chosen)).config.projectId, bound.projectId);
  const fork = await bindMemoryProject(home, moved, 'new');
  assert.notEqual(fork.projectId, bound.projectId);
  assert.equal((await readMemory(home, { project: moved })).entries.length, 0);
  await bindMemoryProject(home, moved, bound.projectId);
  assert.equal((await readMemory(home, { project: moved })).entries.length, 1);
});

test('Git worktrees and subdirectories share the main identity without changing their config', async t => {
  const { root, home, project } = await fixture(t);
  await exec('git', ['init', project]); await exec('git', ['-C', project, 'add', '.my-ai-infra.json']);
  await exec('git', ['-C', project, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'fixture']);
  const worktree = path.join(root, 'worktree');
  await exec('git', ['-C', project, 'worktree', 'add', '-b', 'test-memory', worktree]);
  const nested = path.join(worktree, 'src'); await fs.mkdir(nested);
  const bound = await bindMemoryProject(home, nested);
  await putMemory(home, { project: nested }, renderMemory([entry()]), 'missing');
  assert.equal((await readMemory(home, { project })).projectId, bound.projectId);
  assert.equal((await readMemory(home, { project: nested })).projectId, bound.projectId);
  assert.equal((await readMemory(home, { project: nested })).entries.length, 1);
  assert.deepEqual(JSON.parse(await read(worktree, '.my-ai-infra.json')), chosen);
});

test('retries do not grow memory; competing writes accept one and stale writes cannot overwrite', async t => {
  const { home, project } = await fixture(t); await bindMemoryProject(home, project);
  const first = await putMemory(home, { project }, renderMemory([entry()]), 'missing');
  const retry = await putMemory(home, { project }, renderMemory([entry({ updated: '2026-10-15', source: '重复转交' })]), first.revision);
  assert.equal(retry.changed, false); assert.equal(retry.revision, first.revision);
  await assert.rejects(putMemory(home, { project }, renderMemory([entry({ body: '另一条' })]), 'missing'), /变化/);
  const outcomes = await Promise.allSettled(['一', '二'].map(body => putMemory(home, { project }, renderMemory([entry({ body })]), first.revision)));
  assert.equal(outcomes.filter(r => r.status === 'fulfilled').length, 1);
  const current = await readMemory(home, { project }); assert.equal(current.entries.length, 1);
  await deleteMemory(home, { project }, entry().id, current.revision);
  assert.equal((await readMemory(home, { project })).entries.length, 0);
  assert.equal(await exists(path.join(home, 'backups')), false);
});

test('recall isolates projects, status and scenes; project wins and budgets retain whole entries', async t => {
  const { root, home, project } = await fixture(t); await bindMemoryProject(home, project);
  await saveMemory(home, { scope: 'global' }, renderMemory([entry({ id: 'global', body: '全局方案' }), entry({ id: 'tone', key: 'tone', scenes: ['all'], body: '简洁表达' })]), 'missing');
  await saveMemory(home, { project }, renderMemory([entry(), entry({ id: 'candidate', key: 'maybe', status: 'inbox', basis: 'inferred', body: '待确认' }), entry({ id: 'old', key: 'old', status: 'deprecated', body: '已失效' }), entry({ id: 'tests', key: 'tests', scenes: ['test-plan'], body: '测试偏好' })]), 'missing');
  const other = path.join(root, 'other'); await fs.mkdir(other); await write(other, '.my-ai-infra.json', json(chosen)); await bindMemoryProject(home, other);
  await putMemory(home, { project: other }, renderMemory([entry({ body: '另一个项目' })]), 'missing');
  const result = await recallMemory(home, { project, scene: 'design' });
  assert.deepEqual(new Set(result.entries.map(e => e.id)), new Set(['pref-minimal', 'tone']));
  assert.doesNotMatch(result.context, /另一个项目|全局方案|待确认|已失效|测试偏好/);
  assert.ok(result.excluded.some(e => e.reason.includes('项目偏好优先')));
  const current = await readMemory(home, { project });
  await putMemory(home, { project }, renderMemory([entry({ body: '边界'.repeat(200) })]), current.revision);
  const limited = await recallMemory(home, { project, scene: 'design', budget: 200 });
  assert.ok(limited.excluded.some(e => e.id === entry().id && e.reason.includes('预算')));
  assert.doesNotMatch(limited.context, /边界/);
});

test('forged project IDs and symlinks cannot redirect memory writes outside the home', async t => {
  const { root, home, project } = await fixture(t);
  await write(project, '.my-ai-infra.json', json({ ...chosen, projectId: '../../escape' }));
  await assert.rejects(readMemory(home, { project }), /projectId/);
  await write(project, '.my-ai-infra.json', json(chosen));
  const bound = await bindMemoryProject(home, project);
  const outside = path.join(root, 'outside.md'); await fs.writeFile(outside, renderMemory([entry()])); await fs.symlink(outside, bound.path);
  await assert.rejects(saveMemory(home, { project }, renderMemory([entry({ body: 'overwrite' })]), 'missing'), /escapes|Symlink/);
  assert.match(await fs.readFile(outside, 'utf8'), /最小方案/);
});

test('CLI and custom-home installed wrapper read Markdown without distributing private memory', async t => {
  const { root, home, project } = await fixture(t);
  const cli = path.resolve('bin/my-ai-infra.mjs');
  const run = async args => JSON.parse((await exec(process.execPath, [cli, ...args, '--home', home])).stdout);
  await run(['memory', 'bind', '--project', project]);
  const input = path.join(root, 'entry.md'); await fs.writeFile(input, renderMemory([entry()]));
  await run(['memory', 'put', '--project', project, '--file', input, '--revision', 'missing']);
  assert.equal((await run(['memory', 'recall', '--project', project, '--scene', 'design'])).entries.length, 1);
  const toolHome = path.join(root, 'tool-home'); await fs.mkdir(toolHome); await setup(home, ['codex'], toolHome, ['my-create-memory']);
  const wrapper = path.join(toolHome, '.agents/skills/my-create-memory/scripts/my-ai-infra.mjs');
  assert.equal(JSON.parse((await exec(process.execPath, [wrapper, 'memory', 'get', '--project', project])).stdout).entries.length, 1);
  assert.ok(!(await plan(home, project, chosen)).actions.some(a => a.path.endsWith('/memory.md')));
  await assert.rejects(exec(process.execPath, [cli, 'memory', 'put', '--home', home, '--project', project, '--file', input]), /revision/);
});

test('Web authenticates reads, confirms candidates, rejects stale save and supports delete', async t => {
  const { home, project } = await fixture(t); await bindMemoryProject(home, project);
  await putMemory(home, { project }, renderMemory([entry({ status: 'inbox', basis: 'inferred' })]), 'missing');
  const web = await startWeb({ home, project, port: 0 }); t.after(() => new Promise(resolve => web.server.close(resolve)));
  const request = (route, body, token = web.token) => fetch(web.origin + '/api/memory/' + route, { method: 'POST', headers: { 'x-my-ai-token': token, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await request('read', { project }, 'wrong')).status, 403);
  const current = await (await request('read', { project })).json();
  assert.equal((await (await request('recall', { project, scene: 'design' })).json()).entries.length, 0);
  const confirmed = await (await request('status', { project, id: entry().id, status: 'approved', revision: current.revision })).json();
  assert.equal(confirmed.entries[0].basis, 'confirmed');
  assert.equal((await request('save', { project, content: MEMORY_HEADER, revision: current.revision })).status, 400);
  assert.equal((await (await request('recall', { project, scene: 'design' })).json()).entries.length, 1);
  assert.equal((await request('delete', { project, id: entry().id, revision: confirmed.revision })).status, 200);
  assert.equal((await readMemory(home, { project })).entries.length, 0);
});


test('project identity cannot leak through new-project defaults', async t => {
  const { home, project } = await fixture(t);
  await assert.rejects(config({ ...chosen, projectId: 'project-one' }, home, { allowProjectId: false }), /只能用于项目/);
  await write(home, 'defaults.json', json({ ...chosen, projectId: 'project-one' }));
  await assert.rejects(plan(home, project), /只能用于项目/);
});


test('non-Git nested paths resolve the configured project and preserve the requested UI target', async t => {
  const { home, project } = await fixture(t);
  await bindMemoryProject(home, project);
  const nested = path.join(project, 'src'); await fs.mkdir(nested);
  const current = await readMemory(home, { project: nested });
  assert.equal(current.root, project);
  assert.equal(current.requestedProject, nested);
  assert.ok(current.projectId);
  await putMemory(home, { project: nested }, renderMemory([entry()]), current.revision);
  assert.equal((await recallMemory(home, { project, scene: 'design' })).entries.length, 1);
});
