import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { safe, stat } from './fs.mjs';
import { acquireWorkspaceLock, lockPath } from '../assets/skills/my-create-feature/scripts/feature-workspace.mjs';

export const conflict = message => Object.assign(Error(message), { exitCode: 2 });
const pendingRelative = 'mai-specs/.mai-migration/pending';

export function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value ?? null);
}
export function revisionOf(payload) {
  return digest(canonical(payload));
}
function alive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; }
}
async function readOwner(root) {
  const file = path.join(lockPath(root), 'owner.json');
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
export async function pendingInfo(root) {
  const directory = path.join(root, pendingRelative);
  const info = await stat(directory);
  if (!info) return null;
  if (!info.isDirectory() || info.isSymbolicLink()) throw conflict(`恢复材料不是普通目录：${pendingRelative}`);
  const journalFile = path.join(directory, 'journal.json');
  let journal = null;
  try { journal = JSON.parse(await fs.readFile(journalFile, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const committed = Boolean(await stat(path.join(directory, 'commit.json')));
  return { directory, journal, committed };
}

export async function assertWritableWorkspace(root) {
  const pending = await pendingInfo(root);
  const owner = await readOwner(root);
  const lock = await stat(lockPath(root));
  if (pending?.committed && owner && !alive(owner.pid)) {
    await fs.rm(pending.directory, { recursive: true, force: true });
    await fs.rm(path.join(lockPath(root), 'owner.json'), { force: true });
    await fs.rmdir(lockPath(root)).catch(error => { if (error.code !== 'ENOENT') throw error; });
    return;
  }
  if (pending && !pending.committed) throw conflict('存在未完成的迁移。请先执行 mai migrate recover --dry-run，确认后用本次 revision 恢复。');
  if (pending?.committed) throw conflict('已提交的迁移尚未清理，且原操作仍在进行。请待其结束后重试。');
  if (lock) {
    if (!owner) throw conflict(`工作区锁没有拥有者记录：${lockPath(root)}。请按原初始化流程核对后处理，不要推断其中有迁移日志。`);
    if (alive(owner.pid)) throw conflict(`另一项工作区写入正在运行（进程 ${owner.pid}）。请待其结束后重试。`);
    throw conflict(`工作区锁的进程已退出：${lockPath(root)}。请核对现场后再移除该锁。`);
  }
}

async function fileState(root, relative) {
  const file = await safe(root, relative);
  const info = await stat(file);
  if (!info) return null;
  if (info.isSymbolicLink() || !info.isFile()) throw conflict(`目标不是普通文件：${relative}`);
  const bytes = await fs.readFile(file);
  return { sha256: digest(bytes), mode: info.mode & 0o777, bytes, ino: info.ino, dev: info.dev };
}
function sameState(actual, expected) {
  if (actual === null || expected === null) return actual === expected;
  return actual.sha256 === expected.sha256 && actual.mode === expected.mode;
}

async function ensureParents(root, relative, created) {
  const parts = relative.split('/').slice(0, -1);
  let current = root;
  for (const part of parts) {
    current = path.join(current, part);
    const info = await stat(current);
    if (!info) {
      await fs.mkdir(current);
      created.push(path.relative(root, current).split(path.sep).join('/'));
    } else if (info.isSymbolicLink() || !info.isDirectory()) throw conflict(`父路径不是普通目录：${path.relative(root, current)}`);
  }
}

export async function submitTransaction(root, plan, expectedRevision, options = {}) {
  if (!plan?.canApply || plan.revision !== expectedRevision) throw conflict('项目内容自预览后已变化，未执行迁移。请重新预览。');
  if (!plan.actions.length) return { ...publicPlan(plan), applied: false, unchanged: true };
  await assertWritableWorkspace(root);
  const held = await acquireWorkspaceLock(root);
  const directory = path.join(root, pendingRelative);
  let prepared = false;
  try {
    const again = await options.replan();
    if (!again.canApply || again.revision !== expectedRevision) throw conflict('项目内容自预览后已变化，未执行迁移。请重新预览。');
    if (!again.actions.length) return { ...publicPlan(again), applied: false, unchanged: true };
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const journal = { token: held.token, revision: again.revision, actions: [], created: [] };
    for (let index = 0; index < again.actions.length; index++) {
      const action = again.actions[index];
      const before = action.before ? { sha256: action.before.sha256, mode: action.before.mode } : null;
      const after = action.after ? { sha256: digest(action.after), mode: action.mode ?? 0o644 } : null;
      const entry = { index, path: action.path, role: action.role, before, after, phase: 'prepared' };
      if (action.after) await fs.writeFile(path.join(directory, `${index}.after`), action.after, { mode: 0o600, flag: 'wx' });
      if (action.beforeBytes) await fs.writeFile(path.join(directory, `${index}.before`), action.beforeBytes, { mode: 0o600, flag: 'wx' });
      journal.actions.push(entry);
    }
    await fs.writeFile(path.join(directory, 'journal.json'), JSON.stringify(journal), { mode: 0o600, flag: 'wx' });
    prepared = true;
    const rank = { content: 0, index: 1, state: 2 };
    journal.actions.sort((left, right) => rank[left.role] - rank[right.role] || left.index - right.index);
    for (const entry of journal.actions) {
      if (options.failAfter === `before:${entry.role}` && entry === journal.actions.find(item => item.role === entry.role)) {
        throw conflict(`注入失败：${entry.role}`);
      }
      await publish(root, directory, journal, entry, options);
    }
    await verify(root, again);
    if (options.failAfter === 'before-commit') throw conflict('注入失败：提交标记');
    await fs.writeFile(path.join(directory, 'commit.json'), JSON.stringify({ revision: again.revision }), { mode: 0o600, flag: 'wx' });
    if (options.failAfter === 'before-cleanup') return { ...publicPlan(again), applied: true, cleanupPending: true };
    await fs.rm(directory, { recursive: true, force: true });
    prepared = false;
    return { ...publicPlan(again), applied: true };
  } catch (error) {
    if (await stat(path.join(directory, 'commit.json'))) return { ...publicPlan(plan), applied: true, cleanupPending: true };
    if (prepared) await rollback(root, directory);
    else await fs.rm(directory, { recursive: true, force: true });
    throw error;
  } finally {
    if (!(await stat(directory))) await held.release();
  }
}

async function publish(root, directory, journal, entry, options) {
  entry.phase = 'started';
  await fs.writeFile(path.join(directory, 'journal.json'), JSON.stringify(journal));
  if (options.afterStart) await options.afterStart(entry);
  const created = [];
  await ensureParents(root, entry.path, created);
  journal.created.push(...created);
  const actual = await fileState(root, entry.path);
  if (!sameState(actual && { sha256: actual.sha256, mode: actual.mode }, entry.before)) {
    entry.phase = 'failed';
    await fs.writeFile(path.join(directory, 'journal.json'), JSON.stringify(journal));
    throw conflict(`写入前内容已变化：${entry.path}`);
  }
  if (!entry.after) {
    await fs.unlink(await safe(root, entry.path));
    entry.phase = 'published';
    entry.deleted = true;
    await fs.writeFile(path.join(directory, 'journal.json'), JSON.stringify(journal));
    return;
  }
  const staging = path.join(directory, `${entry.index}.staging`);
  const handle = await fs.open(staging, 'wx', entry.after.mode);
  const bytes = await fs.readFile(path.join(directory, `${entry.index}.after`));
  await handle.writeFile(bytes);
  await handle.sync();
  const staged = await handle.stat();
  await handle.close();
  await fs.link(staging, path.join(directory, `${entry.index}.keep`));
  entry.ino = staged.ino;
  entry.dev = staged.dev;
  await fs.writeFile(path.join(directory, 'journal.json'), JSON.stringify(journal));
  if (options.beforeLink) await options.beforeLink(entry);
  const target = await safe(root, entry.path);
  try {
    if (!entry.before) await fs.link(staging, target);
    else {
      const checked = await fileState(root, entry.path);
      if (!sameState(checked && { sha256: checked.sha256, mode: checked.mode }, entry.before)) throw conflict(`替换前内容已变化：${entry.path}`);
      await fs.rename(staging, target);
    }
  } catch (error) {
    entry.phase = 'failed';
    entry.error = error.code || error.message;
    await fs.writeFile(path.join(directory, 'journal.json'), JSON.stringify(journal));
    if (error.code === 'EEXIST') throw conflict(`目标已存在且不属于本次操作：${entry.path}`);
    throw error;
  }
  const published = await fs.lstat(target);
  if (published.ino !== entry.ino || published.dev !== entry.dev) {
    entry.phase = 'unknown';
    await fs.writeFile(path.join(directory, 'journal.json'), JSON.stringify(journal));
    throw conflict(`无法证明 ${entry.path} 属于本次发布。现场已保留。`);
  }
  entry.phase = 'published';
  await fs.writeFile(path.join(directory, 'journal.json'), JSON.stringify(journal));
}

async function verify(root, plan) {
  for (const action of plan.actions) {
    const actual = await fileState(root, action.path);
    if (action.after === null) {
      if (actual) throw conflict(`删除未生效：${action.path}`);
      continue;
    }
    if (!actual || actual.sha256 !== digest(action.after)) throw conflict(`发布结果与计划不一致：${action.path}`);
  }
}

async function rollback(root, directory) {
  const journal = JSON.parse(await fs.readFile(path.join(directory, 'journal.json'), 'utf8'));
  for (const entry of [...journal.actions].reverse()) {
    if (entry.phase === 'prepared' || entry.phase === 'failed') continue;
    const target = await safe(root, entry.path);
    const info = await stat(target);
    if (entry.phase === 'started') {
      const keep = path.join(directory, `${entry.index}.keep`);
      const keepInfo = await stat(keep);
      if (info && keepInfo && info.ino === keepInfo.ino && info.dev === keepInfo.dev) entry.phase = 'published';
      else {
        const actual = info ? await fileState(root, entry.path) : null;
        if (sameState(actual && { sha256: actual.sha256, mode: actual.mode }, entry.before)) continue;
        throw conflict(`无法证明 ${entry.path} 的发布状态。请根据 ${directory} 人工恢复。`);
      }
    }
    if (entry.phase !== 'published') throw conflict(`无法恢复未知状态：${entry.path}`);
    if (entry.deleted) {
      if (info) throw conflict(`${entry.path} 在删除后又出现，未自动恢复。备份位于 ${directory}。`);
      const restore = path.join(directory, `${entry.index}.restore`);
      await fs.copyFile(path.join(directory, `${entry.index}.before`), restore);
      await fs.chmod(restore, entry.before.mode);
      await fs.rename(restore, target);
      continue;
    }
    if (!info || info.ino !== entry.ino || info.dev !== entry.dev) throw conflict(`${entry.path} 已与本次发布身份不一致，未回滚。备份位于 ${directory}。`);
    const body = await fs.readFile(target);
    if (digest(body) !== entry.after.sha256) throw conflict(`${entry.path} 内容已变化，未回滚。备份位于 ${directory}。`);
    if (!entry.before) await fs.unlink(target);
    else {
      const restore = path.join(directory, `${entry.index}.restore`);
      await fs.copyFile(path.join(directory, `${entry.index}.before`), restore);
      await fs.chmod(restore, entry.before.mode);
      await fs.rename(restore, target);
    }
  }
  for (const relative of [...journal.created].reverse()) {
    try { await fs.rmdir(await safe(root, relative)); } catch { /* keep non-empty parents */ }
  }
  await fs.rm(directory, { recursive: true, force: true });
  try { await fs.rmdir(path.dirname(directory)); } catch { /* keep migration state */ }
}

export function publicPlan(plan) {
  return {
    source: plan.source, operation: plan.operation, mode: plan.mode, authority: plan.authority,
    selection: plan.selection, created: plan.created, reused: plan.reused, revision: plan.revision,
    canApply: plan.canApply, findings: plan.findings, messages: plan.messages, submit: plan.submit,
    items: plan.items, affected: plan.affected,
    actions: (plan.actions || []).map(({ path: file, role, before, after }) => ({ path: file, role, action: after === null ? 'remove' : before ? 'update' : 'create' })),
  };
}

export async function planRecovery(root) {
  const pending = await pendingInfo(root);
  if (!pending) return { operation: 'recover', canApply: false, unchanged: true, messages: ['没有未完成的迁移，无须恢复。'], findings: [], actions: [], revision: null };
  if (!pending.journal) throw conflict(`恢复日志不可读：${pending.directory}。请按备份逐路径核对，不要删除公共锁。`);
  const owner = await readOwner(root);
  if (owner && alive(owner.pid)) throw conflict(`原操作进程 ${owner.pid} 仍在运行，不能恢复。`);
  const snapshot = [];
  for (const entry of pending.journal.actions) {
    let actual = null;
    try { actual = await fileState(root, entry.path); } catch (error) { actual = { error: error.message }; }
    snapshot.push({ path: entry.path, phase: entry.phase, sha256: actual?.sha256 || null });
  }
  const revision = revisionOf({ operation: 'recover', committed: pending.committed, journal: pending.journal.revision, snapshot });
  return {
    operation: 'recover', canApply: true, revision, committed: pending.committed, findings: [],
    messages: [pending.committed ? '事务已提交，恢复只会清理日志。' : '事务未提交，恢复会逆序撤回仍能证明属于本次操作的写入。', '执行期间请暂停编辑预览列出的受影响文件，完成后即可继续编辑。'],
    affected: pending.journal.actions.map(entry => entry.path),
    actions: pending.journal.actions.map(entry => ({ path: entry.path, role: entry.role, action: pending.committed ? 'cleanup' : 'rollback' })),
    submit: `mai migrate recover --revision ${revision}`,
  };
}

export async function submitRecovery(root, expectedRevision) {
  const plan = await planRecovery(root);
  if (!plan.canApply) return plan;
  if (plan.revision !== expectedRevision) throw conflict('项目内容自预览后已变化，未执行迁移。请重新预览。');
  const pending = await pendingInfo(root);
  const owner = await readOwner(root);
  if (owner && alive(owner.pid)) throw conflict(`原操作进程 ${owner.pid} 仍在运行，不能恢复。`);
  if (pending.committed) {
    await fs.rm(pending.directory, { recursive: true, force: true });
  } else await rollback(root, pending.directory);
  const lock = lockPath(root);
  await fs.rm(path.join(lock, 'owner.json'), { force: true });
  await fs.rmdir(lock).catch(error => { if (!['ENOENT', 'ENOTEMPTY'].includes(error.code)) throw error; });
  return { ...plan, applied: true, messages: ['已恢复到可继续预览的状态。'] };
}
