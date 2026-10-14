import path from 'node:path';
import { hash } from './fs.mjs';
import { snapshot, equalEntry } from './entries.mjs';
import { legacyRuleActions } from './legacy-instructions.mjs';

// Runtime principles belong to the project. Only their locations and links are managed.
export const RULES = [
  { entry: 'AGENTS.md', source: '.agents/assets/rules/AGENTS.md', tools: ['codex', 'cursor'] },
  { entry: 'CLAUDE.md', source: '.agents/assets/rules/CLAUDE.md', tools: ['claudecode'] },
  { entry: '.github/copilot-instructions.md', source: '.agents/assets/rules/copilot-instructions.md', tools: ['copilot'] },
];
export const ruleTarget = (rule, source = rule.source) => path.posix.relative(path.posix.dirname(rule.entry), source);
export const SHARED_RULE_SOURCE = '.agents/assets/rules/AGENTS.md';
const initialization = {
  codex: '在项目目录启动 codex，在会话中执行 /init；若提示文件已存在，请让它根据真实代码补全 AGENTS.md。',
  claudecode: '在项目目录启动 claude，在会话中执行 /init；若提示文件已存在，请让它根据真实代码补全 CLAUDE.md。',
  cursor: '在 Cursor Agent 中发送：请读取仓库，补全根目录 AGENTS.md 中的项目运行原则、命令和约束。',
  copilot: '在项目目录执行 copilot init，或在 Copilot CLI 会话中执行 /init，补全 .github/copilot-instructions.md。',
};
export const ruleInitialization = (tool, shared) => initialization[tool] + (shared ? ' AGENTS.md 与 CLAUDE.md 共用 AGENTS.md 唯一内容源，补全一次即可。' : '') + ' 请通过现有软链接写入，保留链接；完成后通过本工具再次同步并检查入口，沿用本次个人库和项目配置。';

export async function ruleActions(root, tools, oldFiles, inspect = relative => snapshot(root, relative)) {
  const legacy = await legacyRuleActions(root, oldFiles, inspect);
  const actions = new Map(legacy.map(action => [action.path, action]));
  const nextFiles = {}, nextSteps = [];
  const oldSource = actions.get('.agents/AGENTS.md');
  const claude = RULES.find(rule => rule.entry === 'CLAUDE.md');
  const claudeEntry = await inspect(claude.entry), claudeSource = await inspect(claude.source);
  const sharedTarget = ruleTarget(claude, SHARED_RULE_SOURCE);
  const sharedClaude = claudeEntry?.kind === 'symlink' && claudeEntry.target === '.agents/rules/AGENTS.md'
    || claudeEntry?.kind === 'symlink' && claudeEntry.target === sharedTarget
    || oldFiles[claude.entry]?.kind === 'symlink' && oldFiles[claude.entry].target === sharedTarget
    || claudeEntry === null && claudeSource === null;
  const needsSharedAgents = sharedClaude && (claudeEntry !== null || tools.includes('claudecode'));
  let migratedOldSource = false;
  for (const rule of RULES) {
    const source = rule.entry === 'CLAUDE.md' && sharedClaude ? SHARED_RULE_SOURCE : rule.source;
    const legacySource = source.replace('.agents/assets/rules/','.agents/rules/');
    const legacyBefore = await inspect(legacySource);
    let before, sourceBefore;
    try {
      before = await inspect(rule.entry);
      sourceBefore = await inspect(source);
    } catch (error) {
      actions.set(rule.entry, { path: rule.entry, action: 'conflict', before: null, after: null, reason: `规则路径无法安全读取：${error.message}` });
      continue;
    }
    const plannedSource = actions.get(source);
    if (plannedSource && !equalEntry(plannedSource.before, sourceBefore)) throw Error(`Rule changed during preview: ${source}; preview again`);
    const cleaned = actions.get(rule.entry);
    if (cleaned && !equalEntry(cleaned.before, before)) throw Error(`Rule changed during preview: ${rule.entry}; preview again`);
    let current = cleaned ? cleaned.after : before;
    const needed = rule.tools.some(tool => tools.includes(tool)) || rule.entry === 'AGENTS.md' && needsSharedAgents;
    const existingOwnSource = rule.entry === 'CLAUDE.md' && sharedClaude ? claudeSource : sourceBefore;
    if (!needed && before === null && existingOwnSource === null && legacyBefore === null) continue;
    const target = ruleTarget(rule, source);
    const conflict = reason => {
      if (!actions.has(source)) actions.set(source, { path: source, action: sourceBefore === null ? 'create' : 'preserve', before: sourceBefore, after: { kind: 'file', text: sourceBefore?.text || '' } });
      actions.set(rule.entry, { path: rule.entry, action: 'conflict', before, after: { kind: 'symlink', target }, ruleSource: source, reason });
    };
    if (sourceBefore && sourceBefore.kind !== 'file') {
      actions.set(source, { path: source, action: 'conflict', before: sourceBefore, after: { kind: 'file', text: before?.kind === 'file' ? before.text : actions.get(source)?.after?.text || '' }, reason: '中心运行规则必须是普通文本文件' });
      actions.set(rule.entry, { path: rule.entry, action: equalEntry(before,{kind:'symlink',target}) ? 'noop' : before === null ? 'create' : 'update', before, after: { kind: 'symlink', target } });
      nextFiles[rule.entry] = { kind: 'symlink', target, hash: hash(target) }; continue;
    }
    if (before && !['file','symlink'].includes(before.kind)) { conflict('规则入口必须是文本文件或有效的相对软链接'); continue; }
    if (before?.kind === 'symlink') {
      if (before.target === target) current = sourceBefore;
      else if (before.target === ruleTarget(rule,legacySource) && legacyBefore?.kind === 'file') current = legacyBefore;
      else if (before.target === path.posix.relative(path.posix.dirname(rule.entry), '.agents/AGENTS.md')) {
        if (oldSource?.before?.kind === 'symlink') { conflict('旧版中心规则是未知链接，请先核对；不会跟随该链接'); continue; }
        current = oldSource?.after || null;
        migratedOldSource = true;
      } else { conflict(`已有规则链接指向 ${before.target}，请先将需要的内容归入 ${source}；不会读取或覆盖未知目标`); continue; }
    }
    const incoming = current?.kind === 'file' ? current.text : legacyBefore?.kind === 'file' ? legacyBefore.text : '';
    if (legacyBefore && !actions.has(legacySource)) {
      const conflict = legacyBefore.kind !== 'file' || sourceBefore?.text?.trim() && legacyBefore.text.trim() && sourceBefore.text !== legacyBefore.text;
      actions.set(legacySource,{path:legacySource,before:legacyBefore,after:null,action:conflict?'conflict':'remove',...(conflict?{reason:'旧规则源与新源不同，保留并核对后迁移'}:{})});
    }
    const existing = (actions.get(source)?.after || sourceBefore)?.text;
    if (existing?.trim() && incoming.trim() && existing !== incoming) {
      actions.set(source, { path: source, action: 'preserve', before: sourceBefore, after: { kind: 'file', text: existing } });
      conflict(`入口与中心规则 ${source} 都有不同的非空内容，请先合并到中心文件，再移除入口副本并重试；两份内容均已保留`); continue;
    }
    const text = existing?.trim() ? existing : incoming || existing || '';
    const sourceAfter = { kind: 'file', text };
    actions.set(source, { path: source, action: sourceBefore === null ? 'create' : equalEntry(sourceBefore, sourceAfter) ? 'preserve' : 'update', before: sourceBefore, after: sourceAfter, note: '项目自行维护运行原则；安装器不注入 SDD 内容' });
    const after = { kind: 'symlink', target };
    actions.set(rule.entry, { path: rule.entry, action: equalEntry(before, after) ? 'noop' : before === null ? 'create' : 'update', before, after, note: cleaned?.note || `集中管理项目规则，入口软链接到 ${source}` });
    nextFiles[rule.entry] = { kind: 'symlink', target, hash: hash(target) };
    if (!text.trim()) for (const tool of rule.tools.filter(tool => tools.includes(tool))) {
      nextSteps.push({ tool, file: rule.entry, source, message: ruleInitialization(tool, needsSharedAgents && source === SHARED_RULE_SOURCE) });
    }
  }
  if (migratedOldSource && oldSource?.before?.kind === 'file') {
    // Known aliases have been moved. Conflicts abort the entire transaction before any writes.
    actions.set(oldSource.path, { ...oldSource, action: 'remove', after: null, note: '旧版共享源已分别迁移到 .agents/assets/rules/，保留备份并移除旧源' });
  }
  const order = action => RULES.some(rule => rule.source === action.path) ? 0 : action.path === '.agents/AGENTS.md' ? 2 : 1;
  return { actions: [...actions.values()].sort((a, b) => order(a) - order(b)), nextFiles, nextSteps: nextSteps.filter(step => !actions.get(step.source)?.after?.text?.trim()) };
}
