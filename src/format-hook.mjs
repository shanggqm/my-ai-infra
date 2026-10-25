import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { hash, json } from './fs.mjs';

export const FORMAT_ASSET = 'my-format';
export const FORMAT_SOURCE = '.agents/hooks/my-format/run.mjs';
export const FORMAT_CONFIGS = {
  codex: { path: '.codex/hooks.json', event: 'Stop', grouped: true },
  claudecode: { path: '.claude/settings.json', event: 'Stop', grouped: true },
  cursor: { path: '.cursor/hooks.json', event: 'stop', version: 1 },
  copilot: { path: '.github/hooks/my-ai-infra-format.json', event: 'Stop', version: 1 },
};
const marker = ' --my-ai-infra-format';
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const quote = value => "'" + value.replaceAll("'", "'\"'\"'") + "'";
const owned = item => object(item) && typeof item.command === 'string' && item.command.endsWith(marker);

function handler(root) {
  return { type: 'command', command: `node ${quote(path.join(root, FORMAT_SOURCE))}${marker}`, timeout: 30 };
}

export function validFormatState(relative, entry) {
  if (!Object.values(FORMAT_CONFIGS).some(item => item.path === relative)) return false;
  return entry?.kind === 'file' && object(entry.formatHook) && owned(entry.formatHook) && entry.formatHook.type === 'command' && entry.formatHook.timeout === 30;
}

// Shared host files are semantically patched. Their other settings and hooks
// remain user-owned even though normal backup/revision/rollback covers the file.
export async function formatHookActions(root, tools, enabled, previous, inspect) {
  const actions = [], nextFiles = {}, registrations = {};
  for (const [tool, spec] of Object.entries(FORMAT_CONFIGS)) {
    const active = enabled && tools.includes(tool), old = previous[spec.path];
    if (!active && !old?.formatHook) continue;
    const before = await inspect(spec.path), wanted = handler(root);
    try {
      if (before !== null && before.kind !== 'file') throw Error('宿主 Hook 配置必须是普通 JSON 文件；保留原路径');
      const document = before ? JSON.parse(before.text) : {};
      if (!object(document) || document.hooks !== undefined && !object(document.hooks)) throw Error('宿主 Hook 配置结构无效');
      if (spec.version && document.version !== undefined && document.version !== spec.version) throw Error('宿主 Hook 配置版本不受支持');
      const groups = Object.hasOwn(document.hooks || {}, spec.event) ? document.hooks[spec.event] : [];
      if (!Array.isArray(groups)) throw Error(`${spec.event} 必须为数组`);
      const existing = [];
      for (const group of groups) {
        if (!object(group) || spec.grouped && !Array.isArray(group.hooks)) throw Error(`${spec.event} Hook 条目结构无效`);
        if (spec.grouped && group.hooks.some(owned) && Object.keys(group).some(key => key !== 'hooks')) throw Error('格式化 Hook 的匹配条件已被用户修改，请核对后同步');
        for (const item of spec.grouped ? group.hooks : [group]) if (owned(item)) existing.push(item);
      }
      if (existing.some(item => !isDeepStrictEqual(item, old?.formatHook || wanted))) throw Error('格式化 Hook 已被用户修改，请核对后同步');
      const updated = structuredClone(document);
      const kept = [];
      for (const group of groups) {
        if (spec.grouped) {
          const hooks = group.hooks.filter(item => !owned(item));
          if (hooks.length || !group.hooks.some(owned)) kept.push({ ...group, hooks });
        } else if (!owned(group)) kept.push(group);
      }
      if (active) kept.push(spec.grouped ? { hooks: [wanted] } : wanted);
      if (kept.length) { updated.hooks ||= {}; updated.hooks[spec.event] = kept; }
      else if (updated.hooks) { delete updated.hooks[spec.event]; if (!Object.keys(updated.hooks).length) delete updated.hooks; }
      if (active && spec.version) updated.version = spec.version;
      // Keep even empty user files; removal only withdraws this registration.
      const after = before === null && !active ? null : { kind: 'file', text: isDeepStrictEqual(document, updated) && before ? before.text : json(updated) };
      const action = { path: spec.path, before, after, action: after?.text === before?.text ? 'noop' : before === null ? 'create' : 'update', note: active ? '合并项目格式化 Hook，保留其他宿主设置' : '撤回项目格式化 Hook，保留其他宿主设置' };
      if (active) {
        action.requires = FORMAT_SOURCE;
        registrations[tool] = spec.path;
        nextFiles[spec.path] = { kind: 'file', hash: hash(after.text), formatHook: wanted };
      }
      actions.push(action);
    } catch (error) {
      actions.push({ path: spec.path, action: 'conflict', before, after: before, unreadable: true, reason: `格式化 Hook 未注册：${error.message}` });
      if (active) registrations[tool] = spec.path;
    }
  }
  return { actions, nextFiles, registrations };
}
