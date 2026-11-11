import path from 'node:path';

const conflict = message => Object.assign(new Error(message), { exitCode: 2 });

// Selection is validated independently of the filesystem; callers must still
// compare every selected ID against the current active directory snapshot.
export function selectChanges(options, activeIds) {
  const choices = ['change', 'changes', 'active', 'all'].filter(key => options[key] !== undefined && options[key] !== false);
  if (choices.length !== 1) throw new Error('请选择 --change、--changes、--active 或 --all 中的一项');
  if (choices[0] === 'all') return { mode: 'all', ids: [...activeIds].sort() };
  if (choices[0] === 'active') return { mode: 'active', ids: [...activeIds].sort() };
  const ids = choices[0] === 'change' ? [options.change] : String(options.changes).split(',');
  if (choices[0] === 'changes' && ids.length < 2) throw new Error('--changes 至少需要两个 change ID');
  if (ids.some(id => typeof id !== 'string' || !id || id !== id.trim() || id === '.' || id === '..' || id.includes('/') || id.includes('\\') || id.includes(',') || path.isAbsolute(id))) {
    throw new Error('change ID 必须是非空的直接子目录名称');
  }
  if (new Set(ids).size !== ids.length) throw new Error('change ID 不能重复');
  const missing = ids.filter(id => !activeIds.includes(id));
  if (missing.length) throw conflict(`找不到活动 change：${missing.join(', ')}`);
  return { mode: choices[0], ids: [...ids].sort() };
}
