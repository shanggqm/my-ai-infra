import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { files, hash, json, read, readJSON, safe, stat, write, locked } from './fs.mjs';
import { BUILTINS, NAMING_VERSION, ALIASES, REMOVED_SKILLS, canonicalName, definition, normalizeText } from './names.mjs';
import { ASSET_ROOT, SKILL_SOURCE, BUNDLE, sourceRoots, derivedAgent, addFile, addLink, addExtensions, extensionCatalog, parseExtension, parsePrompt, assetRelative, namePart, legacyAssetPath, pruneLegacyAssetDirectories, legacyPromptTargets } from './assets.mjs';
import { snapshot, equalEntry, putEntry } from './entries.mjs';
import { randomUUID } from 'node:crypto';
import { parseAgent, agentCatalog, GLOBAL_AGENT_TOOLS, agentFilename, renderAgent } from './agents.mjs';

export const PACKAGE = fileURLToPath(new URL('../', import.meta.url));
export const CORE = BUILTINS.filter(s => s.default).map(s => s.name);
export const TOOLS = { codex: '.agents/skills', claudecode: '.claude/skills', cursor: '.cursor/skills', copilot: '.github/skills' };
export const GLOBAL_TOOLS = { ...TOOLS, copilot: '.copilot/skills' };
export const personalHome = () => path.resolve(process.env.MY_AI_INFRA_HOME || path.join(os.homedir(), '.my-ai-infra'));
export const defaultConfig = () => ({ version: 1, tools: ['codex'], skills: BUILTINS.map(skill => skill.name) });
export function skillName(name) {
  if (typeof name !== 'string' || name.length > 64 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) throw Error('Invalid Skill name');
  return name;
}
export function metadata(text, name) {
  skillName(name);
  const front = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
  const value = key => {
    const match = front?.match(new RegExp('^' + key + ':[ \\t]*(.*)$', 'm'));
    if (!match) return '';
    const raw = match[1].trim();
    if (raw.startsWith('"')) { try { const parsed = JSON.parse(raw); return typeof parsed === 'string' ? parsed : ''; } catch { return ''; } }
    if (raw.startsWith("'")) return /^'(?:[^']|'')*'$/.test(raw) ? raw.slice(1, -1).replaceAll("''", "'") : '';
    if (/^[>|][-+]?$/.test(raw)) {
      const lines = front.slice(match.index + match[0].length).split(/\r?\n/).slice(1);
      const block = [];
      for (const line of lines) { if (line && !/^[ \t]/.test(line)) break; block.push(line.trim()); }
      return block.join(raw.startsWith('>') ? ' ' : '\n').trim();
    }
    return raw;
  };
  const description = value('description');
  if (!front || value('name') !== name || !description.trim()) throw Error(`Invalid Skill metadata: ${name}`);
  return description;
}
export async function assets(home) {
  return path.join(home, 'assets/skills');
}
export async function defaults(home) {
  const saved = await readJSON(home, 'defaults.json', null);
  if (saved !== null && (!saved || Array.isArray(saved) || typeof saved !== 'object')) throw Error('Invalid default preferences');
  const { allSkills, ...input } = saved || defaultConfig();
  if (allSkills !== undefined && allSkills !== true) throw Error('Invalid default allSkills policy');
  if (!saved || allSkills) input.skills = (await catalog(home)).map(a => a.name);
  return config(input, home, { allowEmpty: true, allowProjectId: false });
}
// Tool-only preferences retain automatic discovery; an explicit Skill selection pins the list.
export async function writeDefaults(home, chosen, { selectSkills = true } = {}) {
  const previous = await readJSON(home, 'defaults.json', null);
  const allSkills = !selectSkills && (!previous || previous.allSkills === true);
  await write(home, 'defaults.json', json({ ...chosen, ...(allSkills ? { allSkills: true } : {}) }));
}
async function bundleState(home) {
  const state = await readJSON(home, 'bundle-state.json', { version: 1, files: {} });
  if (state.version !== 1 || !state.files || Array.isArray(state.files) || typeof state.files !== 'object' || Object.values(state.files).some(value => typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value))) throw Error('Invalid builtin asset tracking');
  return state;
}
// Only a recorded old bundle copy may be migrated. Unknown namesakes are personal conflicts.
async function legacySkillCopies(home) {
  const state = await bundleState(home), copies = [];
  for (const root of await sourceRoots(home, 'skills')) {
    if (root === path.join(BUNDLE, 'skills')) continue;
    for (const item of await fs.readdir(root, { withFileTypes: true })) {
      if (item.isSymbolicLink()) throw Error(`Asset symlink is unsupported: ${item.name}`);
      if (!item.isDirectory() || !definition(item.name)) continue;
      const tracked = state.files[`assets/skills/${item.name}/SKILL.md`] || state.files[`${item.name}/SKILL.md`];
      if (!tracked) throw Error(`Personal Skill conflicts with builtin: ${item.name}; rename the personal directory and frontmatter name before retrying`);
      const relative = path.relative(home, path.join(root, item.name));
      await safe(home, relative);
      // Validate the whole tree before any migration writes.
      const contents = {};
      for (const file of await files(path.join(root, item.name))) contents[file] = await read(root, `${item.name}/${file}`);
      copies.push({ name: canonicalName(item.name), sourceName: item.name, relative, revision: hash(json(contents)) });
    }
  }
  return copies;
}

export async function catalog(home) {
  const result = [], legacy = await legacySkillCopies(home);
  for (const root of await sourceRoots(home, 'skills')) {
    const seen = new Set();
    for (const item of await fs.readdir(root, { withFileTypes: true })) {
      if (item.isSymbolicLink()) throw Error(`Asset symlink is unsupported: ${item.name}`);
      if (!item.isDirectory()) continue;
      const name = canonicalName(item.name);
      // Retained personal/runtime copies of removed builtins stay on disk, but are inactive.
      if (REMOVED_SKILLS.has(name)) continue;
      if (seen.has(name)) throw Error(`Both legacy and canonical Skill exist: ${name}; resolve the duplicate before syncing`);
      seen.add(name);
      const builtin = root === path.join(BUNDLE, 'skills');
      if (!builtin && definition(name)) continue;
      if (result.some(s => s.name === name)) throw Error(`Duplicate personal Skill: ${name}`);
      const text = await read(root, `${item.name}/SKILL.md`);
      metadata(text || '', item.name);
      const normalized = name === item.name ? text : normalizeText(text);
      const info = definition(name);
      result.push({ name, origin: builtin ? 'builtin' : 'personal', readOnly: builtin, legacyCopies: legacy.filter(copy => copy.name === name), sourceName: item.name, sourceRoot: root, label: info?.label || name, category: info?.category || 'custom', default: info?.default || false, aliases: info?.aliases || [], description: metadata(normalized, name), core: CORE.includes(name), revision: hash(normalized), content: normalized });
    }
  }
  return result.sort((a, b) => {
    const rank = name => CORE.includes(name) ? CORE.indexOf(name) : CORE.length;
    return rank(a.name) - rank(b.name) || a.name.localeCompare(b.name);
  });
}
export async function config(input, home, { allowEmpty = false, allowProjectId = true } = {}) {
  if (!input || input.version !== 1 || !Array.isArray(input.tools) || !input.tools.length || !Array.isArray(input.skills)) throw Error('Configuration needs version: 1 and non-empty tools/skills arrays');
  if (Object.keys(input).some(k => !['version', 'tools', 'skills', 'projectId'].includes(k))) throw Error('Unknown configuration field');
  if (!allowProjectId && input.projectId !== undefined) throw Error('projectId 只能用于项目配置');
  if (input.projectId !== undefined && (typeof input.projectId !== 'string' || !/^[a-z0-9][a-z0-9-]{2,79}$/.test(input.projectId))) throw Error('Invalid projectId');
  if (input.tools.some(t => !Object.hasOwn(TOOLS, t))) throw Error('Unsupported tool');
  const available = new Set((await catalog(home)).map(a => a.name));
  const skills = [...new Set(input.skills.map(canonicalName))].filter(name => !REMOVED_SKILLS.has(name));
  if (skills.some(name => !available.has(name))) throw Error('Unknown Skill');
  if (!skills.length && !allowEmpty) throw Error('No available Skill selected; 已移除的 Skill 不再安装，请通过 --skills 或 Web 选择至少一个可用 Skill。');
  return { version: 1, tools: [...new Set(input.tools)], skills, ...(input.projectId ? { projectId: input.projectId } : {}) };
}
export async function seed(home, { updateBuiltins = false } = {}) {
  // Move legacy personal roots intact; reject divergent duplicates before mutation.
  const moves = [];
  for (const type of ['skills','agents']) {
    const legacy = await safe(home,type);
    const info = await stat(legacy);
    if (!info) continue;
    if (!info.isDirectory()) throw Error(`Invalid asset source directory: ${legacy}`);
    for (const relative of await files(legacy)) {
      const text = await read(legacy,relative), current = await read(home,`assets/${type}/${relative}`);
      if (current !== null && current !== text) throw Error(`Asset migration conflict: ${type}/${relative}`);
    }
    moves.push(type);
  }
  // Read-only catalog rejects ambiguous duplicates before migration changes any files.
  await catalog(home);
  const baseline = await bundleState(home);
  await agentCatalog(home);
  await extensionCatalog(home);
  for (const type of moves) {
    const legacy = path.join(home,type);
    for (const relative of await files(legacy)) await write(home,`assets/${type}/${relative}`,await read(legacy,relative));
    const backup = await safe(home,`backups/assets-migration-${Date.now()}-${randomUUID()}/${type}`);
    await fs.mkdir(path.dirname(backup),{recursive:true}); await fs.rename(legacy,backup);
  }
  const report = { added: [], updated: [], preserved: [], skillMigrations: [] };
  const nextBaseline = { version: 1, files: { ...baseline.files } };
  for (const copy of await legacySkillCopies(home)) {
    const backup = `backups/builtin-skills-${Date.now()}-${randomUUID()}/${copy.sourceName}`;
    const destination = await safe(home, backup);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.rename(await safe(home, copy.relative), destination);
    report.skillMigrations.push({ ...copy, backup: destination, next: '旧副本已备份；个人定制请改名后使用 asset import 导入。' });
    for (const key of Object.keys(nextBaseline.files)) {
      if (key.startsWith(`assets/skills/${copy.sourceName}/`) || key.startsWith(`${copy.sourceName}/`)) delete nextBaseline.files[key];
    }
  }
  for (const relative of await files(BUNDLE)) {
    if (relative.startsWith('skills/')) continue;
    // Keep an existing manifest-based personal Prompt as its sole source.
    const promptName = relative.match(/^prompts\/([a-z0-9-]+)\.md$/)?.[1];
    if (promptName && await stat(await safe(home, `assets/prompts/${promptName}`))) {
      report.preserved.push(`prompts/${promptName}`); continue;
    }
    const key = `assets/${relative}`, before = await read(home,key), bundled = await read(BUNDLE,relative), digest = hash(bundled);
    const legacyKey = relative.startsWith('skills/') ? relative.slice(7) : relative;
    const tracked = baseline.files[key] || baseline.files[legacyKey];
    if (tracked) nextBaseline.files[key] = tracked;
    if (before === null) {
      await write(home,key,bundled); report.added.push(relative); nextBaseline.files[key] = digest;
    } else if (hash(before) === digest) nextBaseline.files[key] = digest;
    else if (updateBuiltins && tracked === hash(before)) {
      await write(home,`backups/bundle-update-${Date.now()}/${relative}`,before);
      await write(home,key,bundled); report.updated.push(relative); nextBaseline.files[key] = digest;
    } else report.preserved.push(relative);
    delete nextBaseline.files[legacyKey];
  }
  const previousDefaults = await readJSON(home, 'defaults.json', null);
  if (previousDefaults) {
    const normalizedDefaults = { ...await defaults(home), ...(previousDefaults.allSkills ? { allSkills: true } : {}) };
    if (JSON.stringify(previousDefaults) !== JSON.stringify(normalizedDefaults)) {
      await write(home, `backups/naming-v${NAMING_VERSION}-${Date.now()}/defaults.json`, json(previousDefaults));
      await write(home, 'defaults.json', json(normalizedDefaults));
    }
  }
  // Install a stable local runtime so the global Skill survives npx cache eviction.
  for (const dir of ['src', 'bin', 'web', 'templates', 'catalog', 'assets']) {
    for (const relative of await files(path.join(PACKAGE, dir))) {
      if (dir === 'assets' && relative.startsWith('skills/')) continue;
      if (dir === 'web' && relative === 'assets/logo.png') continue;
      const text = await read(PACKAGE, `${dir}/${relative}`);
      await write(home, `runtime/${dir}/${relative}`, text);
    }
  }
  await refreshRuntimeSkills(home);
  // Archive obsolete bundled Prompt folders so the stable runtime has one source per name.
  for (const relative of await files(path.join(BUNDLE, 'prompts'))) {
    if (!/^[a-z0-9-]+\.md$/.test(relative)) continue;
    const name = relative.slice(0, -3), legacy = await safe(home, `runtime/assets/prompts/${name}`);
    if (!await stat(legacy)) continue;
    const backup = await safe(home, `backups/runtime-prompts-${Date.now()}-${randomUUID()}/${name}`);
    await fs.mkdir(path.dirname(backup), { recursive: true });
    await fs.rename(legacy, backup);
  }
  // Design assets are trusted bundled binaries; custom Skill imports remain text-only.
  for (const relative of ['web/assets/logo.png', 'design-system/bxy-design-tokens.css', 'design-system/assets/icons/material-symbols-rounded.css', 'design-system/assets/icons/material-symbols-rounded.woff2']) {
    await write(home, `runtime/${relative}`, await fs.readFile(path.join(PACKAGE, relative)));
  }
  await write(home, 'runtime/package.json', await read(PACKAGE, 'package.json'));
  // A previous bundle may retain old folder names; keep recovery copies outside the active runtime.
  for (const alias of Object.keys(ALIASES)) {
    const legacy = await safe(home, `runtime/assets/skills/${alias}`);
    if (!(await stat(legacy))) continue;
    const backup = await safe(home, `backups/runtime-naming-v${NAMING_VERSION}-${Date.now()}/${alias}`);
    await fs.mkdir(path.dirname(backup), { recursive: true });
    await fs.rename(legacy, backup);
  }
  await write(home, 'bundle-state.json', json(nextBaseline));
  return report;
}
async function refreshRuntimeSkills(home) {
  const source = path.join(BUNDLE, 'skills'), target = await safe(home, 'runtime/assets/skills');
  if (path.resolve(source) === target) return;
  const sourceFiles = await files(source);
  if (await stat(target)) {
    const currentFiles = await files(target);
    if (json(currentFiles) === json(sourceFiles)) {
      let equal = true;
      for (const relative of sourceFiles) if (await read(source, relative) !== await read(target, relative)) { equal = false; break; }
      if (equal) return;
    }
  }
  const staging = `runtime/assets/.skills-${randomUUID()}`;
  const backup = `backups/runtime-skills-${Date.now()}-${randomUUID()}`;
  let moved = false;
  try {
    for (const relative of await files(source)) await write(home, `${staging}/${relative}`, await read(source, relative));
    if (await stat(target)) {
      await fs.mkdir(path.dirname(await safe(home, backup)), { recursive: true });
      await fs.rename(target, await safe(home, backup)); moved = true;
    }
    try { await fs.rename(await safe(home, staging), target); }
    catch (error) { if (moved) await fs.rename(await safe(home, backup), target); throw error; }
  } finally { await fs.rm(await safe(home, staging), { recursive: true, force: true }); }
}
export async function setup(home, tools = ['codex'], toolHome = os.homedir(), skills = defaultConfig().skills) {
  if (!tools.length || tools.some(t => !Object.hasOwn(TOOLS, t))) throw Error('Unsupported tool');
  ({ tools, skills } = await config({ version: 1, tools, skills }, home));
  return locked(home, async () => {
    const seeded = await seed(home, { updateBuiltins: true });
    const previous = await readJSON(home, 'global-state.json', {}), next = { ...previous };
    const outputs = [], desired = new Map();
    const agents = (await agentCatalog(home)).filter(agent => agent.skills.every(skill => skills.includes(skill)));
    const globalSkills = [...new Set(['my-ai-infra', ...(skills.includes('my-create-memory') ? ['my-create-memory'] : []), ...agents.flatMap(agent => agent.skills)])];
    const available = await catalog(home);
    for (const skill of globalSkills) {
      const {sourceRoot:root,sourceName} = available.find(a=>a.name===skill);
      for (const relative of await files(path.join(root,sourceName))) {
        const target = `${SKILL_SOURCE}/${skill}/${relative}`;
        let text = await read(root,`${sourceName}/${relative}`);
        if (['my-ai-infra', 'my-create-memory'].includes(skill) && relative === 'scripts/my-ai-infra.mjs') text = `#!/usr/bin/env node\nimport { pathToFileURL } from 'node:url';\nconst { main } = await import(pathToFileURL(${JSON.stringify(path.join(home, 'runtime/src/cli.mjs'))}));\nmain(['--home', ${JSON.stringify(home)}, ...process.argv.slice(2)]).catch(e => { console.error(e.message); process.exitCode = e.exitCode || 1; });\n`;
        addFile(desired,target,text);
        for (const tool of tools.filter(tool => tool !== 'codex')) addLink(desired,`${GLOBAL_TOOLS[tool]}/${skill}/${relative}`,target);
      }
    }
    for (const agent of agents) {
      const source = `${ASSET_ROOT}/agents/${agent.name}.md`;
      // Global role sources are also managed centrally; native files are derived.
      addFile(desired,source,agent.content);
      for (const tool of tools) {
        const target = `${GLOBAL_AGENT_TOOLS[tool]}/${agentFilename(tool,agent.name)}`;
        const generated = derivedAgent(tool,agent.name,agentFilename(tool,agent.name));
        const text = renderAgent(agent,tool,skill=>path.posix.relative(path.posix.dirname(target),`${TOOLS.codex}/${skill}/SKILL.md`));
        addFile(desired,generated,text); addLink(desired,target,generated);
      }
    }
    const extensions = await extensionCatalog(home);
    addExtensions(desired,extensions,tools,true);
    const migrated = [];
    for (const [target, output] of desired) {
      const before = await snapshot(toolHome,target), after = output.kind === 'file' ? {kind:'file',text:output.text} : {kind:'symlink',target:output.target};
      const digest = entry => entry?.kind === 'file' ? hash(entry.text) : entry?.kind === 'symlink' ? hash(entry.target) : null;
      const sameFile = before?.kind === 'file' && output.kind === 'symlink' && before.text === desired.get(output.source)?.text;
      if (before && !equalEntry(before,after) && !sameFile && digest(before) !== previous[target]) throw Error(`Global ${target.includes('/agents/') ? 'Agent' : 'asset'} conflict: ${target}`);
      outputs.push({target,before,after}); next[target] = digest(after);
      if (output.kind === 'file') {
        const legacy = legacyAssetPath(target);
        if (previous[legacy]) {
          const old = await snapshot(toolHome,legacy);
          if (old && digest(old) !== previous[legacy]) throw Error(`Global asset conflict: ${legacy}`);
          if (old) migrated.push({target:legacy,before:old,after:null});
          delete next[legacy];
        }
      }
    }
    // Retire only recorded Prompt aliases for tools being updated in this setup.
    for (const asset of extensions.filter(asset => asset.type === 'prompts')) for (const tool of tools) {
      for (const target of new Set([asset.globalTargets?.[tool],legacyPromptTargets(asset.name)[tool]].filter(Boolean))) {
        if (desired.has(target) || !previous[target] || outputs.some(item => item.target === target)) continue;
        const before = await snapshot(toolHome,target);
        if (before && (before.kind !== 'symlink' || hash(before.target) !== previous[target])) throw Error(`Global asset conflict: ${target}`);
        if (before) outputs.push({target,before,after:null});
        delete next[target];
      }
    }
    // Keep unselected tools installed while flattening their remaining sources.
    for (const [legacy, digest] of Object.entries(previous)) {
      if (!legacy.startsWith('.agents/assets/')) continue;
      const target = legacy.replace('.agents/assets/','.agents/');
      if (desired.has(target)) continue;
      const old = await snapshot(toolHome,legacy);
      if (!old) continue;
      if (old.kind !== 'file' || hash(old.text) !== digest) throw Error(`Global asset conflict: ${legacy}`);
      const before = await snapshot(toolHome,target);
      const knownAlias = before?.kind === 'symlink' && hash(before.target) === previous[target] && before.target === path.posix.relative(path.posix.dirname(target),legacy);
      if (before && !equalEntry(before,old) && !knownAlias) throw Error(`Global asset conflict: ${target}`);
      outputs.push({target,before,after:old}); next[target] = digest;
      migrated.push({target:legacy,before:old,after:null}); delete next[legacy];
    }
    // setup retains previously installed tools, so move their recorded aliases too.
    const relocated = new Set(migrated.map(item => item.target));
    const installed = new Set(outputs.map(item => item.target));
    for (const [target, digest] of Object.entries(previous)) {
      if (installed.has(target) || relocated.has(target)) continue;
      const before = await snapshot(toolHome,target);
      if (before?.kind !== 'symlink') continue;
      const source = path.posix.normalize(path.posix.join(path.posix.dirname(target),before.target));
      if (!relocated.has(source)) continue;
      if (hash(before.target) !== digest) throw Error(`Global asset conflict: ${target}`);
      const after = {kind:'symlink',target:path.posix.relative(path.posix.dirname(target),source.replace('.agents/assets/','.agents/'))};
      outputs.push({target,before,after}); next[target] = hash(after.target);
    }
    outputs.push(...migrated);
    const changed = outputs.filter(item => !equalEntry(item.before, item.after));
    const backup = `backups/global-${Date.now()}-${randomUUID()}`;
    if (changed.length) await write(home, `${backup}/journal.json`, json(changed));
    const touched = [];
    try {
      for (const item of changed) {
        if (!equalEntry(await snapshot(toolHome, item.target), item.before)) throw Error(`Global Skill changed: ${item.target}`);
        touched.push(item); await putEntry(toolHome, item.target, item.after);
      }
      await write(home, 'global-state.json', json(next));
    } catch (error) {
      for (const item of touched.reverse()) await putEntry(toolHome, item.target, item.before);
      throw error;
    }
    await pruneLegacyAssetDirectories(toolHome, migrated.map(item => item.target));
    return { home, skillMigrations: seeded.skillMigrations, installed: tools, skills: (await catalog(home)).length, agents: agents.map(agent => agent.name) };
  });
}
export async function saveAsset(home, name, text, revision, type = 'skills') {
  if (type !== 'skills') return saveTypedAsset(home,name,text,revision,type);
  name = canonicalName(name);
  if (REMOVED_SKILLS.has(name)) throw Error(`Removed Skill: ${name}; use a different name for a personal Skill`);
  if (definition(name)) throw Error(`Builtin Skill is read-only: ${name}; use a new personal Skill name`);
  metadata(text, name);
  return locked(home, async () => {
    const seeded = await seed(home);
    const relative = `assets/skills/${name}/SKILL.md`, old = await read(home, relative);
    if (revision !== (old === null ? null : hash(old))) throw Error('Skill changed since it was loaded; reload first');
    if (old === null && await stat(await safe(home, `assets/skills/${name}`))) throw Error(`Skill already exists: ${name}`);
    if (old !== null) await write(home, `backups/${Date.now()}-${hash(old).slice(0, 8)}/${name}/SKILL.md`, old);
    await write(home, relative, text);
    return { revision: hash(text), origin: 'personal', skillMigrations: seeded.skillMigrations };
  });
}
export async function importAsset(home, source, type = 'skills') {
  if (type !== 'skills') return importTypedAsset(home,source,type);
  source = await fs.realpath(source);
  const name = skillName(path.basename(source));
  if (REMOVED_SKILLS.has(name)) throw Error(`Removed Skill: ${name}; use a different name for a personal Skill`);
  if (definition(name)) throw Error(`Builtin Skill is read-only: ${name}; use a new personal Skill name`);
  if (canonicalName(name) !== name) throw Error(`Reserved legacy name: use ${canonicalName(name)}`);
  const entries = await files(source);
  if (!entries.includes('SKILL.md')) throw Error('Missing SKILL.md');
  metadata(await read(source, 'SKILL.md'), name);
  const contents = new Map();
  for (const relative of entries) contents.set(relative, await read(source, relative));
  return locked(home, async () => {
    const seeded = await seed(home);
    if (await stat(await safe(home, `assets/skills/${name}`))) throw Error(`Skill already exists: ${name}`);
    const staging = `imports/${randomUUID()}`;
    try {
      for (const [relative, text] of contents) await write(home, `${staging}/${relative}`, text);
      const destination = await safe(home, `assets/skills/${name}`);
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.rename(await safe(home, staging), destination);
    } finally { await fs.rm(await safe(home, staging), { recursive: true, force: true }); }
    return { imported: name, origin: 'personal', files: entries.length, skillMigrations: seeded.skillMigrations };
  });
}

export async function allAssets(home) {
  return [
    ...(await catalog(home)).map(a=>({...a,type:'skills'})),
    ...(await agentCatalog(home)).map(a=>({...a,type:'agents',revision:hash(a.content)})),
    ...await extensionCatalog(home),
  ];
}
async function saveTypedAsset(home,name,text,revision,type) {
  if (!namePart(name) || !namePart(type)) throw Error('Invalid asset name/type');
  return locked(home,async()=>{
    await seed(home);
    const asset = (await allAssets(home)).find(a=>a.type===type && a.name===name);
    if (!asset || asset.revision !== revision) throw Error('Asset changed since it was loaded; reload first');
    if (type==='agents') parseAgent(text,name);
    if (type==='prompts' && asset.flat) parsePrompt(text,name);
    const relative = type==='agents' ? `assets/agents/${name}.md` : `assets/${assetRelative(asset)}`;
    await write(home,`backups/edit-${Date.now()}-${randomUUID()}/${relative}`,await read(home,relative));
    await write(home,relative,text);
    return {revision:(await allAssets(home)).find(a=>a.type===type && a.name===name).revision};
  });
}
async function importTypedAsset(home,source,type) {
  if (!namePart(type) || type==='rules') throw Error('Invalid asset type');
  source = await fs.realpath(source);
  const isAgent = type==='agents', isPrompt = type==='prompts' && (await fs.stat(source)).isFile();
  if ((isAgent || isPrompt) && !source.endsWith('.md')) throw Error('Asset file must use .md extension');
  const name = path.basename(source,isAgent || isPrompt ? '.md' : undefined);
  if (!namePart(name)) throw Error('Invalid asset name');
  const contents = new Map();
  if (isAgent) { const text=await read(path.dirname(source),path.basename(source)); parseAgent(text,name); contents.set(`${name}.md`,text); }
  else if (isPrompt) { const text=await read(path.dirname(source),path.basename(source)); parsePrompt(text,name); contents.set(`${name}.md`,text); }
  else {
    const manifest = parseExtension(await read(source,'asset.json'),type,name);
    for (const file of await files(source)) contents.set(`${name}/${file}`,await read(source,file));
    if (!contents.has(`${name}/${manifest.entry}`)) throw Error('Missing asset entry');
  }
  return locked(home,async()=>{
    await seed(home);
    if ((await allAssets(home)).some(asset=>asset.type===type && asset.name===name)) throw Error(`Asset already exists: ${type}/${name}`);
    for (const [file,text] of contents) await write(home,`assets/${type}/${file}`,text);
    return {imported:name,type,files:contents.size};
  });
}
