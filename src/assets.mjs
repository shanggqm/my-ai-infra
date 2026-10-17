import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { files, read, readJSON, stat, safe, hash, json } from './fs.mjs';

export const BUNDLE = fileURLToPath(new URL('../assets/', import.meta.url));
export const ASSET_ROOT = '.agents';
export const LEGACY_ASSET_ROOT = '.agents/assets';
export const legacyAssetPath = relative => relative.startsWith(ASSET_ROOT + '/') ? relative.replace(ASSET_ROOT + '/', LEGACY_ASSET_ROOT + '/') : null;
export async function pruneLegacyAssetDirectories(root, removed) {
  return pruneAssetDirectories(root, removed.filter(relative => relative.startsWith(LEGACY_ASSET_ROOT + '/')));
}
export async function pruneAssetDirectories(root, removed) {
  const directories = new Set();
  for (const relative of removed) {
    const boundary = relative.split('/')[0];
    if (!relativePath(relative) || !['.agents', '.codex', '.claude', '.cursor', '.github', '.copilot'].includes(boundary)) continue;
    // Only visit ancestors of removed managed files; keep host roots and user contents.
    for (let parent = path.posix.dirname(relative); parent.startsWith(boundary + '/'); parent = path.posix.dirname(parent)) directories.add(parent);
  }
  for (const relative of [...directories].sort((a,b) => b.split('/').length - a.split('/').length)) {
    const directory = await safe(root,relative,{leafLink:true}), info = await stat(directory);
    if (!info?.isDirectory() || info.isSymbolicLink()) continue;
    try { await fs.rmdir(directory); } catch (error) { if (!['ENOENT','ENOTEMPTY','EEXIST'].includes(error.code)) throw error; }
  }
}
export const SKILL_SOURCE = `${ASSET_ROOT}/skills`;
export const namePart = value => typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 64;
export const relativePath = value => typeof value === 'string' && value.length > 0 && !value.includes('\\') && !value.includes('\0') && !path.posix.isAbsolute(value) && path.posix.normalize(value) === value && value.split('/').every(part => part !== '..' && part !== '.');
export const linkTarget = (entry, source) => path.posix.relative(path.posix.dirname(entry), source);
export const derivedAgent = (tool, name, filename) => `${ASSET_ROOT}/.generated/${tool}/agents/${filename}`;
export function sourceForEntry(relative) {
  for (const prefix of ['.agents/skills', '.claude/skills', '.cursor/skills', '.github/skills', '.copilot/skills']) {
    if (relative.startsWith(prefix + '/')) return relative.replace(prefix, SKILL_SOURCE);
  }
  for (const [tool, prefix] of Object.entries({codex:'.codex/agents',claudecode:'.claude/agents',cursor:'.cursor/agents',copilot:'.github/agents'})) {
    if (relative.startsWith(prefix + '/')) return derivedAgent(tool, null, relative.slice(prefix.length + 1));
  }
  return null;
}
export function assetSourcePath(relative) {
  return relativePath(relative) && relative.startsWith(ASSET_ROOT + '/') && relative.slice(ASSET_ROOT.length + 1).split('/').length >= 2;
}
export function validDestination(relative, tool, global = false) {
  const prefix = {codex:'.codex/',claudecode:'.claude/',cursor:'.cursor/',copilot:global?'.copilot/':'.github/'}[tool];
  // Shared configuration files are owned by the user, never entire-file asset aliases.
  return prefix && relativePath(relative) && relative.startsWith(prefix) && relative.slice(prefix.length).includes('/') && !relative.startsWith(prefix+'skills/') && !relative.startsWith(prefix+'agents/');
}
export async function sourceRoots(home, type) {
  const current = path.join(home,'assets',type), legacy = path.join(home,type);
  const result = [];
  for (const root of [current, ...(['skills','agents'].includes(type)?[legacy]:[]), path.join(BUNDLE,type)]) {
    const info = await stat(await safe(path.dirname(root),path.basename(root)));
    if (!info) continue;
    if (!info.isDirectory() || info.isSymbolicLink()) throw Error(`Invalid asset source directory: ${root}`);
    if (!result.includes(root)) result.push(root);
  }
  return result;
}
// Every typed builtin is read from the package. Recorded personal-library copies
// are migration inputs, never overrides; unrecorded collisions require renaming.
export async function typedSources(home, type) {
  const roots = await sourceRoots(home,type), bundle = path.join(BUNDLE,type);
  const baseline = await readJSON(home,'bundle-state.json',{version:1,files:{}});
  if (baseline.version !== 1 || !baseline.files || typeof baseline.files !== 'object' || Array.isArray(baseline.files) || Object.values(baseline.files).some(value => typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value))) throw Error('Invalid builtin asset tracking');
  const result = new Map();
  for (const root of [...roots.filter(root => root === bundle), ...roots.filter(root => root !== bundle)]) {
    const seen = new Set();
    for (const item of await fs.readdir(root,{withFileTypes:true})) {
      if (item.name === 'README.md') continue;
      const flat = ['agents','prompts'].includes(type) && item.isFile() && item.name.endsWith('.md');
      const name = flat ? item.name.slice(0,-3) : item.name;
      if (!namePart(name) || (!flat && (type === 'agents' || !item.isDirectory()))) throw Error(`Invalid asset: ${type}/${item.name}`);
      if (seen.has(name)) throw Error(`Duplicate asset: ${type}/${name}; keep one source`);
      seen.add(name);
      const previous = result.get(name), builtin = root === bundle;
      if (previous?.origin === 'builtin') {
        const key = `${type}/${item.name}`;
        const keys = Object.keys(baseline.files).filter(candidate => [key,`assets/${key}`].some(prefix => candidate === prefix || !flat && candidate.startsWith(prefix+'/')));
        if (!keys.length) throw Error(`Personal asset conflicts with builtin: ${type}/${name}; rename the personal asset before retrying`);
        const contents = {};
        if (flat) contents[item.name] = await read(root,item.name);
        else for (const file of await files(path.join(root,item.name))) contents[file] = await read(root,`${item.name}/${file}`);
        previous.legacyCopies.push({type,name,sourceName:item.name,relative:path.relative(home,path.join(root,item.name)),revision:hash(json(contents)),keys});
        continue;
      }
      if (previous) throw Error(`Duplicate personal asset: ${type}/${name}`);
      result.set(name,{name,type,flat,sourceName:item.name,sourceRoot:root,origin:builtin?'builtin':'personal',readOnly:builtin,legacyCopies:[]});
    }
  }
  return [...result.values()];
}
export function parseExtension(text, type, name) {
  if (!namePart(type) || !namePart(name) || ['skills','agents','rules'].includes(type)) throw Error('Invalid extension asset type/name');
  const data = JSON.parse(text);
  if (data.name !== name || typeof data.description !== 'string' || !data.description.trim() || !relativePath(data.entry) || data.entry === 'asset.json') throw Error(`Invalid asset manifest: ${type}/${name}`);
  for (const [key, global] of [['targets',false],['globalTargets',true]]) {
    const targets = data[key];
    if (targets === undefined && global) continue;
    if (!targets || typeof targets !== 'object' || Array.isArray(targets)) throw Error(`Invalid asset targets: ${type}/${name}`);
    for (const [tool,target] of Object.entries(targets)) if (!validDestination(target,tool,global)) throw Error(`Invalid asset target: ${target}`);
  }
  return data;
}
export function parsePrompt(text, name) {
  if (!namePart(name)) throw Error('Invalid Prompt name');
  const front = text?.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
  const raw = front?.match(/^description:[ \t]*(.+)$/m)?.[1].trim();
  let description = raw;
  if (raw?.startsWith('"')) {
    try { description = JSON.parse(raw); } catch { throw Error(`Invalid Prompt description: ${name}`); }
  } else if (raw?.startsWith("'")) {
    if (!/^'(?:[^']|'')*'$/.test(raw)) throw Error(`Invalid Prompt description: ${name}`);
    description = raw.slice(1, -1).replaceAll("''", "'");
  }
  if (typeof description !== 'string' || !description.trim() || /^[>|][-+]?$/.test(description)) throw Error(`Missing single-line Prompt description: ${name}`);
  const targets = promptTargets(name);
  return { name, description, entry: `${name}.md`, targets, globalTargets: targets, flat: true };
}
export const promptTargets = name => ({ codex: `${SKILL_SOURCE}/${name}/SKILL.md`, claudecode: `.claude/skills/${name}/SKILL.md`, cursor: `${SKILL_SOURCE}/${name}/SKILL.md`, copilot: `${SKILL_SOURCE}/${name}/SKILL.md` });
export const legacyPromptTargets = name => ({ codex: `.codex/prompts/${name}.md`, claudecode: `.claude/commands/${name}.md`, cursor: `.cursor/commands/${name}.md`, copilot: `.github/prompts/${name}.prompt.md` });
export function renderPromptSkill(asset) {
  const target = promptTargets(asset.name).codex;
  const reference = linkTarget(target, `${ASSET_ROOT}/${assetRelative(asset)}`).split('/').map(part => encodeURIComponent(part).replace(/[()]/g,char => '%' + char.charCodeAt(0).toString(16))).join('/');
  return `---\nname: ${JSON.stringify(asset.name)}\ndescription: ${JSON.stringify(asset.description)}\ndisable-model-invocation: true\n---\n\n用户显式调用本入口时，读取并执行 [${asset.name}](${reference}) 的完整正文，并使用用户在当前消息及对话中提供的参数和上下文。\n\n相对路径以本 SKILL.md 的真实位置为基准；先解析软链接。正文中的相对资源路径以正文文件所在目录为基准。正文无法读取时报告具体路径并停止，不猜测内容或改用其他项目/全局的同名文件。\n`;
}
export const assetRelative = (asset, file = asset.entry) => `${asset.type}/${asset.flat ? '' : asset.name + '/'}${file}`;
export async function extensionCatalog(home) {
  const types = new Set();
  for (const root of [path.join(home,'assets'),BUNDLE]) {
    if (!(await stat(await safe(path.dirname(root),path.basename(root))))) continue;
    for (const entry of await fs.readdir(root,{withFileTypes:true})) if (entry.isDirectory() && !['skills','agents','rules'].includes(entry.name)) types.add(entry.name);
  }
  const result = [];
  for (const type of [...types].sort()) for (const source of await typedSources(home,type)) {
    const {name,flat,sourceName,sourceRoot:root} = source;
    const manifest = flat ? parsePrompt(await read(root,sourceName),name) : parseExtension(await read(root,`${name}/asset.json`),type,name);
    const contents = {};
    if (flat) contents[sourceName] = await read(root,sourceName);
    else for (const file of await files(path.join(root,name))) contents[file] = await read(root,`${name}/${file}`);
    if (!Object.hasOwn(contents,manifest.entry)) throw Error(`Missing asset entry: ${type}/${sourceName}`);
    result.push({...manifest,...source,contents,content:contents[manifest.entry],revision:hash(json(contents))});
  }
  return result;
}
export function addFile(desired, target, text, extra = {}) {
  if (desired.has(target)) throw Error(`Duplicate asset target: ${target}`);
  desired.set(target,{kind:'file',text,...extra});
}
export function addLink(desired, target, source) {
  if (desired.has(target)) throw Error(`Duplicate asset target: ${target}`);
  desired.set(target,{kind:'symlink',source,target:linkTarget(target,source)});
}
export function addExtensions(desired, extensions, tools, global = false) {
  for (const asset of extensions) {
    const targets = global ? asset.globalTargets || {} : asset.targets;
    const selected = tools.filter(tool=>targets[tool]);
    if (!selected.length) continue;
    for (const [file,text] of Object.entries(asset.contents)) addFile(desired,`${ASSET_ROOT}/${assetRelative(asset,file)}`,text);
    const source = `${ASSET_ROOT}/${assetRelative(asset)}`;
    if (asset.type === 'prompts') {
      const entries = promptTargets(asset.name);
      addFile(desired,entries.codex,renderPromptSkill(asset),{requires:source});
      addFile(desired,`${SKILL_SOURCE}/${asset.name}/agents/openai.yaml`,'policy:\n  allow_implicit_invocation: false\n',{requires:source});
      if (selected.includes('claudecode')) addLink(desired,entries.claudecode,entries.codex);
    } else for (const tool of selected) addLink(desired,targets[tool],source);
  }
}
