import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { files, read, stat, safe, hash, json } from './fs.mjs';

export const BUNDLE = fileURLToPath(new URL('../assets/', import.meta.url));
export const ASSET_ROOT = '.agents/assets';
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
    result.push(root);
  }
  return result;
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
  const targets = { codex: `.codex/prompts/${name}.md`, claudecode: `.claude/commands/${name}.md`, cursor: `.cursor/commands/${name}.md`, copilot: `.github/prompts/${name}.prompt.md` };
  const { copilot, ...globalTargets } = targets;
  return { name, description, entry: `${name}.md`, targets, globalTargets, flat: true };
}
export const assetRelative = (asset, file = asset.entry) => `${asset.type}/${asset.flat ? '' : asset.name + '/'}${file}`;
export async function extensionCatalog(home) {
  const types = new Set();
  for (const root of [path.join(home,'assets'),BUNDLE]) {
    if (!(await stat(await safe(path.dirname(root),path.basename(root))))) continue;
    for (const entry of await fs.readdir(root,{withFileTypes:true})) if (entry.isDirectory() && !['skills','agents','rules'].includes(entry.name)) types.add(entry.name);
  }
  const result = [];
  for (const type of [...types].sort()) for (const root of await sourceRoots(home,type)) {
    const seen = new Set();
    for (const item of await fs.readdir(root,{withFileTypes:true})) {
      if (item.name === 'README.md') continue;
      const flat = type === 'prompts' && item.isFile() && item.name.endsWith('.md');
      const name = flat ? item.name.slice(0, -3) : item.name;
      if ((!flat && !item.isDirectory()) || !namePart(name)) throw Error(`Invalid asset: ${type}/${item.name}`);
      if (seen.has(name)) throw Error(`Duplicate asset: ${type}/${name}; keep one source`);
      seen.add(name);
      if (result.some(a=>a.type===type && a.name===name)) continue;
      const manifest = flat ? parsePrompt(await read(root,item.name),name) : parseExtension(await read(root,`${name}/asset.json`),type,name);
      const contents = {};
      if (flat) contents[item.name] = await read(root,item.name);
      else for (const file of await files(path.join(root,name))) contents[file] = await read(root,`${name}/${file}`);
      if (!Object.hasOwn(contents,manifest.entry)) throw Error(`Missing asset entry: ${type}/${item.name}`);
      result.push({...manifest,type,flat,sourceRoot:root,contents,content:contents[manifest.entry],revision:hash(json(contents))});
    }
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
    for (const tool of selected) addLink(desired,targets[tool],`${ASSET_ROOT}/${assetRelative(asset)}`);
  }
}
