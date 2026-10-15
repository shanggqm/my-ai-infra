import path from 'node:path';
import { ASSET_ROOT, assetRelative, promptTargets } from './assets.mjs';
import { AGENT_TOOLS, agentFilename } from './agents.mjs';
import { RULES } from './rules.mjs';

const skillRoots = {codex:'.agents/skills',claudecode:'.claude/skills',cursor:'.cursor/skills',copilot:'.github/skills'};
const invocation = (tool,name) => tool === 'codex' ? `ChatGPT: @${name}；Codex CLI/IDE: $${name} 或 /skills` : `/${name}`;

// This is a filesystem plan/diagnostic, never a claim that a host loaded the asset.
export function discoveryEntries(p, phase = 'plan') {
  const actions = new Map(p.actions.map(action => [action.path,action]));
  const entries = [];
  function state(target, seen = new Set()) {
    if (seen.has(target)) return 'needs-sync';
    seen.add(target);
    const a = actions.get(target);
    if (!a || a.resolution === 'skip' || a.action === 'conflict' || !a.after) return 'needs-sync';
    if (a.expectedText !== undefined && a.after.text !== a.expectedText) return 'needs-sync';
    if (phase !== 'applied' && !['noop','preserve'].includes(a.action)) return phase === 'plan' ? 'planned' : 'needs-sync';
    const dependency = a.requires || (a.after.kind === 'symlink' ? path.posix.normalize(path.posix.join(path.posix.dirname(target),a.after.target)) : null);
    return dependency ? state(dependency,seen) : 'ready';
  }
  const add = (tool,type,name,target,call,limitation) => {
    const status = target ? state(target) : 'unsupported';
    entries.push({tool,type,name,path:target || null,invocation:call,status:status === 'ready' && limitation ? 'configuration-required' : status,hostVerified:false,...(limitation ? {limitation} : {})});
  };
  for (const tool of p.config.tools) {
    for (const name of p.config.skills) add(tool,'skills',name,`${skillRoots[tool]}/${name}/SKILL.md`,invocation(tool,name));
    for (const name of p.agents) add(tool,'agents',name,`${AGENT_TOOLS[tool]}/${agentFilename(tool,name)}`,tool === 'claudecode' ? `/agents 查看；请求委派给 ${name}` : tool === 'copilot' ? `在 Agent 选择器选择 ${name}` : `请求主 Agent 委派给 ${name}`);
    for (const rule of RULES.filter(rule => rule.tools.includes(tool))) {
      add(tool,'rules',rule.entry,rule.entry,'会话中自动加载项目规则');
      const source = actions.get(rule.entry)?.after;
      const body = source?.kind === 'symlink' ? actions.get(path.posix.normalize(path.posix.join(path.posix.dirname(rule.entry),source.target)))?.after?.text : source?.text;
      const entry = entries.at(-1);
      if (entry.status === 'ready' && !body?.trim()) { entry.status = 'configuration-required'; entry.limitation = '规则正文为空，请依据当前仓库补全。'; }
    }
    for (const asset of p.extensions) {
      const supported = Boolean(asset.targets[tool]);
      const target = supported ? asset.type === 'prompts' ? promptTargets(asset.name)[tool] : asset.targets[tool] : null;
      const source = `${ASSET_ROOT}/${assetRelative(asset)}`;
      add(tool,asset.type,asset.name,target,asset.type === 'prompts' ? invocation(tool,asset.name) : asset.type === 'hooks' ? '由宿主事件触发' : asset.type === 'mcp' ? '配置并授权服务器后，由宿主工具调用' : '显式引用资产文件',asset.type !== 'prompts' && supported ? '当前仅装配资产文件；请在宿主完成注册或配置并验证生效。' : undefined);
      entries.at(-1).source = source;
      if (!supported) entries.at(-1).limitation = '此资产未声明该工具的适配入口。';
    }
  }
  return entries;
}
