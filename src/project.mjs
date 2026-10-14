import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { catalog, config, defaultConfig, PACKAGE, seed, TOOLS, skillName } from './store.mjs';
import { normalizeText } from './names.mjs';
import { files, hash, json, locked, read, readJSON, write } from './fs.mjs';
import { snapshot, equalEntry, putEntry } from './entries.mjs';
import { LEGACY_RULE_FILES } from './legacy-instructions.mjs';
import { RULES, ruleTarget, ruleActions, ruleInitialization, SHARED_RULE_SOURCE } from './rules.mjs';
import { ASSET_ROOT, SKILL_SOURCE, sourceForEntry, assetSourcePath, validDestination, derivedAgent, addFile, addLink, addExtensions, extensionCatalog } from './assets.mjs';
import { parseAgent, agentCatalog, AGENT_TOOLS, agentFilename, renderAgent, isManagedAgentPath } from './agents.mjs';
import { conflictPolicy, pathInspector, inspectEntry, resolveConflicts, recoveryDirectory, backupEntry, installEntry, restoreEntry, saveCandidates } from './conflicts.mjs';

export const CONFIG = '.my-ai-infra.json';
const STATE = '.my-ai-infra/state.json';
const INSTRUCTIONS = '.agents/AGENTS.md';
const START = '<!-- my-ai-infra:start -->', END = '<!-- my-ai-infra:end -->';
const instructionAliases = ['AGENTS.md', 'CLAUDE.md', '.github/copilot-instructions.md'];
const aliasTarget = (relative, source) => path.posix.relative(path.posix.dirname(relative), source);

function segment(text, first = START, last = END) {
  let start = text.indexOf(first);
  const end = text.indexOf(last);
  if (start < 0 && end < 0) return null;
  if (start < 0 || end < start || text.indexOf(first, start + first.length) >= 0 || text.indexOf(last, end + last.length) >= 0) throw Error('Malformed managed instruction block');
  if (text.slice(Math.max(0, start - 2), start) === '# ') start -= 2;
  return text.slice(start, end + last.length);
}
function merge(text, block, first = START, last = END) {
  const old = segment(text, first, last);
  if (old !== null) return text.replace(old, block);
  return text + (text.endsWith('\n') || !text ? '' : '\n') + '\n' + block + '\n';
}
function ignoreUnion(current, required, wholeFile) {
  const eol = (current || wholeFile).includes('\r\n') ? '\r\n' : '\n';
  const present = new Set(wholeFile.split(/\r?\n/).map(row => row.trim()));
  const additions = required.split('\n').slice(1, -1).filter(row => !present.has(row) && !present.has('!' + row));
  if (current === null) return [required.split('\n')[0], ...additions, required.split('\n').at(-1)].join(eol);
  const rows = current.split(/\r?\n/); rows.splice(rows.length - 1, 0, ...additions);
  return rows.join(eol);
}
function blockAt(text, relative) {
  try { return segment(text); }
  catch { throw Object.assign(Error(`Conflicting files: ${relative}\n${relative}：受管标记不完整或重复，请先核对该文件的标记；文件保持原状。`), { exitCode: 2, code: 'PROJECT_CONFLICT' }); }
}
function conflictError(p) {
  const items = p.actions.filter(action => action.action === 'conflict');
  const message = 'Conflicting files: ' + items.map(item => item.path).join(', ') + '\n' + items.map(item => `${item.path}：${item.reason}`).join('\n') + '\n未覆盖冲突内容。请运行 plan --project ' + JSON.stringify(p.root) + ' 查看原因；保留或核对差异后重试，不需要删除整个配置目录。';
  return Object.assign(Error(message), { exitCode: 2, code: 'PROJECT_CONFLICT', conflicts: items.map(({ path, reason }) => ({ path, reason })) });
}
function validateManaged(relative, entry) {
  if (path.posix.normalize(relative) !== relative || relative.includes('\\')) throw Error(`Invalid managed path: ${relative}`);
  const prefix = Object.values(TOOLS).find(prefix => relative.startsWith(prefix + '/'));
  const agentPath = isManagedAgentPath(relative);
  const center = assetSourcePath(relative);
  const extension = Object.keys(TOOLS).some(tool=>validDestination(relative,tool));
  if (!prefix && !agentPath && !center && !extension && ![...instructionAliases, INSTRUCTIONS, '.gitignore'].includes(relative)) throw Error(`Invalid managed path: ${relative}`);
  if (prefix) skillName(relative.slice(prefix.length + 1).split('/')[0]);
  if (!entry || !['file', 'block', 'reference', 'symlink'].includes(entry.kind) || !/^[a-f0-9]{64}$/.test(entry.hash)) throw Error(`Invalid managed state: ${relative}`);
  if (entry.preserve !== undefined && (entry.kind !== 'file' || entry.preserve !== true)) throw Error(`Invalid preserved state: ${relative}`);
  if (prefix && !['file','symlink'].includes(entry.kind)) throw Error(`Invalid managed asset state: ${relative}`);
  if (entry.kind === 'reference' && !instructionAliases.includes(relative)) throw Error(`Invalid managed reference: ${relative}`);
  if ((agentPath || center || extension) && !['file','symlink'].includes(entry.kind)) throw Error(`Invalid managed Agent state: ${relative}`);
  if (entry.kind === 'symlink') {
    const rule = RULES.find(rule => rule.entry === relative);
    const source = instructionAliases.includes(relative) ? INSTRUCTIONS : prefix && prefix !== TOOLS.codex ? relative.replace(prefix + '/', TOOLS.codex + '/') : null;
    const allowedTargets = [...(source ? [aliasTarget(relative, source)] : []), ...(rule ? [ruleTarget(rule)] : [])];
    if (relative === 'CLAUDE.md') allowedTargets.push(ruleTarget(rule, SHARED_RULE_SOURCE));
    const canonical = sourceForEntry(relative) || (relative.startsWith('.agents/agents/') ? relative.replace('.agents/agents/',ASSET_ROOT+'/agents/') : null);
    if (canonical) allowedTargets.push(aliasTarget(relative,canonical));
    if (rule) allowedTargets.push(ruleTarget(rule,rule.source.replace('.agents/assets/rules/','.agents/rules/')));
    if (relative === 'CLAUDE.md') allowedTargets.push('.agents/rules/AGENTS.md');
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(relative),entry.target || ''));
    if (extension && assetSourcePath(resolved) && !resolved.startsWith(ASSET_ROOT+'/.generated/')) allowedTargets.push(aliasTarget(relative,resolved));
    if (!allowedTargets.includes(entry.target) || entry.hash !== hash(entry.target)) throw Error(`Invalid managed link: ${relative}`);
  }
}
export async function projectRoot(project) {
  const root = await fs.realpath(path.resolve(project));
  if (!(await fs.stat(root)).isDirectory()) throw Error('Project must be an existing directory');
  return root;
}
export async function projectConfig(home, root, { recover = false } = {}) {
  const defaults = await config(await readJSON(home, 'defaults.json', defaultConfig()), home, { allowEmpty: true, allowProjectId: false });
  try { return await config(await readJSON(root, CONFIG, defaults), home, { allowEmpty: true }); }
  catch (error) { if (!recover) throw error; return config(defaults, home, { allowEmpty: true }); }
}
export async function plan(home, project, override, options = {}) {
  const policy = conflictPolicy(options.conflict);
  const root = await projectRoot(project);
  if (root === path.resolve(home) || root.startsWith(path.resolve(home) + path.sep) || path.resolve(home).startsWith(root + path.sep)) throw Error('Personal asset store and project must be separate');
  const selected = await config(override || await projectConfig(home, root, { recover: true }), home);
  const inspection = pathInspector(root), inspect = inspection.inspect;
  const rawState = await inspect(STATE);
  let old = { version: 1, files: {} }, stateProblem;
  if (rawState !== null) try {
    if (rawState.kind !== 'file') throw Error('安装记录必须是普通 JSON 文件');
    old = JSON.parse(rawState.text);
    if (![1, 2, 3, 4].includes(old.version) || !old.files || typeof old.files !== 'object' || Array.isArray(old.files)) throw Error('Invalid managed state');
    for (const [relative, entry] of Object.entries(old.files)) validateManaged(relative, entry);
  } catch (error) { stateProblem = error.message; old = { version: 1, files: {} }; }
  const desired = new Map();
  const assetList = await catalog(home);
  const selectedAgents = (await agentCatalog(home)).filter(agent => agent.skills.every(skill => selected.skills.includes(skill)));
  for (const name of selected.skills) {
    const { sourceName, sourceRoot: source } = assetList.find(a => a.name === name);
    const bundled = path.join(PACKAGE, 'assets/skills', name);
    let bundledFiles = [];
    try { bundledFiles = await files(bundled); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    const resources = new Set([...await files(path.join(source, sourceName)), ...bundledFiles]);
    for (const relative of [...resources].sort()) {
      let text = await read(source, `${sourceName}/${relative}`);
      if (text !== null && sourceName !== name) text = normalizeText(text);
      if (text === null) text = await read(bundled, relative);
      desired.set(`${SKILL_SOURCE}/${name}/${relative}`, { text, kind: 'file' });
    }
  }
  for (const tool of new Set(['codex',...selected.tools])) {
    for (const [source, output] of [...desired]) {
      if (output.kind !== 'file' || !source.startsWith(SKILL_SOURCE + '/')) continue;
      const relative = source.replace(SKILL_SOURCE + '/', TOOLS[tool] + '/');
      desired.set(relative, { kind: 'symlink', source, target: aliasTarget(relative, source) });
    }
  }
  const agentPaths = [];
  for (const agent of selectedAgents) {
    const source = `${ASSET_ROOT}/agents/${agent.name}.md`;
    desired.set(source, { text: agent.content, kind: 'file' }); agentPaths.push(source);
    const local = await inspect(source) || await inspect(`.agents/agents/${agent.name}.md`);
    const previous = old.files[source] || old.files[`.agents/agents/${agent.name}.md`];
    const effective = policy !== 'replace' && local?.kind === 'file' && (previous?.preserve || hash(local.text) !== previous?.hash) ? parseAgent(local.text,agent.name) : agent;
    for (const tool of selected.tools) {
      const target = `${AGENT_TOOLS[tool]}/${agentFilename(tool, agent.name)}`;
      const generated = derivedAgent(tool,agent.name,agentFilename(tool,agent.name));
      const text = renderAgent(effective, tool, skill => aliasTarget(target, `${TOOLS.codex}/${skill}/SKILL.md`));
      addFile(desired,generated,text); addLink(desired,target,generated); agentPaths.push(generated,target);
    }
    const legacy = `.agents/agents/${agent.name}.md`;
    if (await inspect(legacy)) { addLink(desired,legacy,source); agentPaths.push(legacy); }
  }
  addExtensions(desired,await extensionCatalog(home),selected.tools);
  // Move trusted legacy source content before replacing the native file with a link.
  for (const [relative,output] of desired) {
    if (output.kind !== 'symlink' || !relative.startsWith('.agents/') || relative.startsWith(ASSET_ROOT+'/')) continue;
    const before = await inspect(relative), center = await inspect(output.source);
    const previous = old.files[relative];
    if (center === null && before?.kind === 'file' && previous?.kind === 'file' && hash(before.text) === previous.hash) {
      // A current bundle update still takes precedence over an unchanged old source.
      old.files[output.source] = {...previous};
    }
  }
  const ignored = ['/.agents/assets/', '/.my-ai-infra/', '/.my-ai-infra-recovery-*/', ...selected.skills.map(name => `/${TOOLS.codex}/${name}/`), ...selected.tools.filter(tool => tool !== 'codex').flatMap(tool => selected.skills.map(name => `/${TOOLS[tool]}/${name}/`))];
  ignored.push(...agentPaths.map(relative => '/' + relative), ...[...desired].filter(([,v])=>v.kind==='symlink').map(([p])=>'/'+p));
  desired.set('.gitignore', { text: `# ${START}\n${ignored.join('\n')}\n# ${END}`, kind: 'block' });
  const actions = [], nextFiles = {};
  for (const [relative, output] of desired) {
    const before = await inspect(relative), previous = old.files[relative];
    let action, after, detail;
    if (output.kind === 'symlink') {
      after = { kind: 'symlink', target: output.target };
      if (before === null) action = 'create';
      else if (before.kind === 'symlink') action = before.target === output.target ? 'noop' : 'conflict';
      else if (before.kind === 'file') {
        action = (previous?.kind === 'file' && hash(before.text) === previous.hash) || before.text === desired.get(output.source).text ? 'update' : 'conflict';
      } else action = 'conflict';
      nextFiles[relative] = { kind: 'symlink', target: output.target, hash: hash(output.target) };
    } else {
      const current = before?.kind === 'file' ? before.text : null;
      const isBlock = output.kind === 'block';
      let owned, malformed = false;
      try { owned = isBlock ? blockAt(current || '', relative) : current; } catch { malformed = true; owned = null; }
      if (malformed) detail = '受管标记不完整或重复；merge 会保留其他内容并重建标记';
      let body = output.text;
      if (relative === '.gitignore') body = ignoreUnion(owned, body, current || '');
      action = malformed || before && before.kind !== 'file' ? 'conflict' : owned === null ? before === null ? 'create' : 'update' : owned === body ? 'noop' : previous?.preserve && previous.hash === hash(body) && policy !== 'replace' ? 'preserve' : relative === '.gitignore' || previous?.hash === hash(owned) ? 'update' : 'conflict';
      after = { kind: 'file', text: isBlock ? malformed ? merge((current || '').replaceAll(START,'').replaceAll(END,''), body) : merge(current ?? '', body) : action === 'preserve' ? current : body };
      nextFiles[relative] = { kind: output.kind, hash: hash(body) };
      if (action === 'preserve') nextFiles[relative].preserve = true;
    }
    const reason = action === 'conflict' ? detail || (before?.kind === 'symlink' ? `链接目标与预期不符，当前为 ${before.target}；不会跟随或覆盖该链接` : previous ? '受管内容与上次安装记录不一致，保留本地修改并等待核对' : '已有同名内容与待安装资产不同，且没有可信安装记录；请保留或对比现有资产') : undefined;
    actions.push({ path: relative, action, before, after, ...(reason ? { reason } : {}), ...(output.note ? { note: output.note } : {}) });
  }
  const rules = await ruleActions(root, selected.tools, old.files, inspect);
  actions.push(...rules.actions); Object.assign(nextFiles, rules.nextFiles);
  for (const [relative, previous] of Object.entries(old.files)) {
    if (desired.has(relative) || LEGACY_RULE_FILES.includes(relative)) continue;
    const before = await inspect(relative);
    let action = 'noop', after = null;
    if (before !== null) {
      if (before.inherited) { action = 'preserve'; after = before; }
      else if (previous.kind === 'symlink') action = before.kind === 'symlink' && before.target === previous.target ? 'remove' : 'conflict';
      else if (before.kind !== 'file') action = 'conflict';
      else if (previous.preserve) { action = 'preserve'; after = before; }
      else {
        const owned = previous.kind === 'block' ? blockAt(before.text, relative) : before.text;
        action = owned === null ? 'noop' : hash(owned) === previous.hash ? 'remove' : 'conflict';
        if (previous.kind === 'block') after = { kind: 'file', text: before.text.replace(owned || '', '') };
      }
    }
    actions.push({ path: relative, action, before, after, ...(action === 'conflict' ? { reason: '待移除入口已修改，保留现场；请核对内容或链接目标后重试' } : {}) });
  }
  // Project specification documents are seeded once and retain subsequent edits.
  const templates = [...await files(path.join(PACKAGE, 'templates/mai-specs'))].map(relative => [`mai-specs/${relative}`, `templates/mai-specs/${relative}`]);
  for (const name of ['ROADMAP.md', 'FEATURE_LAYOUT.json']) templates.push([`mai-specs/${name}`, `assets/skills/my-create-feature/template/${name}`]);
  for (const [relative, source] of templates) {
    const before = await inspect(relative);
    actions.push({ path: relative, action: before === null ? 'create' : before.kind === 'file' ? 'preserve' : 'conflict', after: { kind: 'file', text: await read(PACKAGE, source) }, before, ...(before && before.kind !== 'file' ? { reason: '规格入口类型与预期文本文件不同' } : {}) });
  }
  const rawConfig = await inspect(CONFIG);
  let configProblem;
  if (rawConfig !== null) try {
    if (rawConfig.kind !== 'file') throw Error('项目配置必须是普通 JSON 文件');
    const previous = await config(JSON.parse(rawConfig.text),home,{allowEmpty:true});
    if (previous.projectId) selected.projectId = previous.projectId;
  } catch (error) { configProblem = error.message; }
  actions.push({ path: CONFIG, action: configProblem ? 'conflict' : rawConfig?.text === json(selected) ? 'noop' : rawConfig === null ? 'create' : 'update', after: { kind: 'file', text: json(selected) }, before: rawConfig, configFile: true, ...(configProblem ? { reason: configProblem } : {}) });
  actions.push({ path: STATE, action: stateProblem ? 'conflict' : 'noop', before: rawState, after: null, internalState: true, ...(stateProblem ? { reason: stateProblem } : {}) });
  actions.unshift(...inspection.blockers.values());
  actions.push(...inspection.reused.values());
  for (const issue of inspection.dependencies.values()) { const action = actions.find(action => action.path === issue.path); if (action) Object.assign(action,issue); else actions.push(issue); }
  const resolved = resolveConflicts(actions, nextFiles, policy, desired);
  const stateAction = actions.find(action => action.internalState);
  stateAction.after = { kind: 'file', text: json({ version: 4, files: Object.fromEntries(Object.entries(nextFiles).sort(([a],[b])=>a.localeCompare(b))) }) };
  if (stateAction.action !== 'conflict' && stateAction.resolution !== 'skip') stateAction.action = equalEntry(rawState,stateAction.after) ? 'noop' : rawState === null ? 'create' : 'update';
  const revision = hash(json({ actions: actions.map(({ path, before, after, resolution }) => ({ path, before, after, resolution })), selected, desired: [...desired], state: old, policy }));
  const nextSteps = [], shared = actions.some(action => action.path === 'CLAUDE.md' && action.after?.kind === 'symlink' && action.after.target === SHARED_RULE_SOURCE && action.resolution !== 'skip');
  for (const rule of RULES) {
    const entry = actions.find(action => action.path === rule.entry);
    if (entry?.after?.kind !== 'symlink' || entry.action === 'conflict' || entry.resolution === 'skip') continue;
    const source = path.posix.normalize(path.posix.join(path.posix.dirname(rule.entry),entry.after.target));
    const center = actions.find(action => action.path === source);
    if (center?.after?.kind !== 'file' || center.after.text.trim()) continue;
    for (const tool of rule.tools.filter(tool=>selected.tools.includes(tool))) nextSteps.push({tool,file:rule.entry,source,message:ruleInitialization(tool,shared && source===SHARED_RULE_SOURCE)});
  }
  const summary = {};
  for (const a of actions) summary[a.action] = (summary[a.action] || 0) + 1;
  return { root, config: selected, agents: selectedAgents.map(a => a.name), actions, summary, revision, nextFiles, nextSteps, policy, conflicts: resolved.conflicts, review: resolved.review, skipped: resolved.skipped, complete: resolved.skipped.length === 0 && !actions.some(action=>action.action==='conflict') };
}
export const publicPlan = p => ({ root: p.root, config: p.config, agents: p.agents, summary: p.summary, revision: p.revision, nextSteps: p.nextSteps, conflict: p.policy, conflicts: p.conflicts, review: p.review, skipped: p.skipped, complete: p.complete, actions: p.actions.map(({ path, action, after, reason, note, resolution }) => ({ path, action, ...(resolution ? { resolution } : {}), ...(reason ? { reason } : {}), ...(note ? { note } : {}), ...(after?.kind === 'symlink' ? { target: after.target } : {}) })) });

export async function apply(home, project, override, expectedRevision, options = {}) {
  return locked(home, async () => {
    const initial = await plan(home, project, override, options);
    if (initial.actions.some(a => a.action === 'conflict')) throw conflictError(initial);
    await seed(home);
    const p = await plan(home, project, override, options);
    if (expectedRevision !== undefined && p.revision !== expectedRevision) throw Error('Project or assets changed since preview; preview again');
    if (p.actions.some(a => a.action === 'conflict')) throw conflictError(p);
    const registryBefore = await snapshot(home, 'projects.json');
    const changed = p.actions.filter(a => ['create', 'update', 'remove'].includes(a.action));
    const stamp = Date.now() + '-' + randomUUID();
    const recovery = await recoveryDirectory(p.root, stamp);
    for (const a of changed) await backupEntry(p.root, a.path, a.before, recovery);
    for (const a of changed) if (a.before?.kind === 'file') await write(p.root, `${recovery}/${a.path}`, a.before.text);
    await saveCandidates(p.root, p.actions, recovery);
    await write(p.root, `${recovery}/journal.json`, json(changed.map(({ path, before, after }) => ({ path, before, after }))));
    const touched = [];
    try {
      for (const a of p.actions.filter(a=>a.reused)) if (!equalEntry(await inspectEntry(p.root,a.path),a.before)) throw Error(`Directory link changed during installation: ${a.path}`);
      for (const a of changed) {
        if (!equalEntry(await inspectEntry(p.root, a.path), a.before)) throw Error(`File changed during installation: ${a.path}`);
        touched.push(a); await installEntry(p.root, a, recovery);
      }
      const registry = await readJSON(home, 'projects.json', []);
      await write(home, 'projects.json', json([...registry.filter(item => item.path !== p.root), { path: p.root, updated: new Date().toISOString() }]));
    } catch (e) {
      for (const a of touched.reverse()) await restoreEntry(p.root, a, recovery);
      await putEntry(home, 'projects.json', registryBefore);
      throw e;
    }
    return { ...publicPlan(p), applied: true, recovery };
  });
}
export async function doctor(home, project) {
  const root = await projectRoot(project);
  const inspection = pathInspector(root);
  if ((await inspection.inspect(CONFIG) === null || await inspection.inspect(STATE) === null) && !inspection.blockers.size) return { healthy: false, issues: ['项目尚未初始化'] };
  const p = await plan(home, project);
  const issues = p.actions.filter(a => !['noop', 'preserve'].includes(a.action)).map(({ path, action, reason }) => ({ path, action, ...(reason ? { reason } : {}) }));
  return { healthy: issues.length === 0, issues };
}
