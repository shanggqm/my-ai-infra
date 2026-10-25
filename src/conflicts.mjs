import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { safe, stat, hash, json, write } from './fs.mjs';
import { equalEntry, putEntry } from './entries.mjs';
import { ASSET_ROOT, SKILL_SOURCE } from './assets.mjs';
import { isManagedAgentPath } from './agents.mjs';

export function conflictPolicy(value = 'abort') {
  if (!['merge', 'replace', 'abort'].includes(value)) throw Error('Invalid conflict policy; use merge, replace or abort');
  return value;
}
async function digest(file) {
  const info = await fs.lstat(file);
  if (info.isSymbolicLink()) return hash('link:' + await fs.readlink(file));
  if (info.isDirectory()) {
    const names = (await fs.readdir(file)).sort();
    return hash(json(await Promise.all(names.map(async name => [name, await digest(path.join(file, name))]))));
  }
  if (!info.isFile()) throw Error('不支持设备或管道等特殊文件');
  const hasher = createHash('sha256');
  const handle = await fs.open(file, 'r');
  try { for await (const chunk of handle.createReadStream()) hasher.update(chunk); }
  finally { await handle.close(); }
  return hasher.digest('hex');
}
export async function inspectEntry(root, relative) {
  const file = await safe(root, relative, { leafLink: true }), info = await stat(file);
  if (!info) return null;
  if (info.isSymbolicLink()) return { kind: 'symlink', target: await fs.readlink(file) };
  if (info.isDirectory()) return { kind: 'directory', hash: await digest(file) };
  if (!info.isFile()) throw Error(`不支持的文件类型：${relative}`);
  const bytes = await fs.readFile(file), text = bytes.toString('utf8');
  return Buffer.from(text).equals(bytes) ? { kind: 'file', text } : { kind: 'binary', hash: hash(bytes) };
}
export function pathInspector(root) {
  const blockers = new Map(), dependencies = new Map(), reused = new Map();
  const inspect = async relative => {
    const parts = relative.split('/');
    for (let length = 1; length < parts.length; length++) {
      const parent = parts.slice(0, length).join('/');
      if (blockers.has(parent)) return null;
      let info;
      try { info = await stat(path.join(root, parent)); }
      catch (error) { blockers.set(parent,{path:parent,action:'conflict',before:null,after:null,blocker:true,unreadable:true,reason:`无法检查父目录：${error.message}`}); return null; }
      if (info && (!info.isDirectory() || info.isSymbolicLink())) {
        let before;
        try { before = await inspectEntry(root, parent); }
        catch (error) { blockers.set(parent,{path:parent,action:'conflict',before:null,after:null,blocker:true,unreadable:true,reason:`无法完整备份父路径：${error.message}`}); return null; }
        const adapter = ['.agents/skills','.claude/skills','.cursor/skills','.github/skills'].find(prefix => parent === prefix || parent.startsWith(prefix + '/'));
        const canonical = adapter && parent.replace(adapter,SKILL_SOURCE);
        const legacy = adapter && adapter !== '.agents/skills' ? parent.replace(adapter,'.agents/skills') : null;
        if (before.kind === 'symlink' && canonical && [canonical,legacy].filter(Boolean).some(target=>path.resolve(root,path.dirname(parent),before.target) === path.resolve(root,target))) {
          try {
            await safe(root,canonical);
            if (legacy && path.resolve(root,path.dirname(parent),before.target) === path.resolve(root,legacy)) await safe(root,legacy);
            reused.set(parent,{path:parent,action:'preserve',before,after:before,reused:true,note:'复用已有指向 .agents 的目录软链接'});
            const source = path.posix.join(canonical,relative.slice(parent.length+1));
            return {kind:'symlink',target:path.posix.relative(path.posix.dirname(relative),source),inherited:true};
          } catch { /* An unsafe canonical parent remains a normal blocker. */ }
        }
        blockers.set(parent, { path: parent, action: 'conflict', before, after: null, blocker: true, reason: `${before.kind === 'symlink' ? 'Symlink path: ' + parent + '；' : ''}父路径应为目录，当前为 ${before.kind}${before.target ? ' → ' + before.target : ''}` });
        return null;
      }
      if (!info) break;
    }
    try { return await inspectEntry(root, relative); }
    catch (error) {
      dependencies.set(relative, { path: relative, action: 'conflict', before: null, after: null, unreadable: true, reason: `无法完整检查该路径：${error.message}` });
      return null;
    }
  };
  return { inspect, blockers, dependencies, reused };
}
const under = (relative, parent) => relative === parent || relative.startsWith(parent + '/');

// Directory merge keeps local same-name files and installs missing resources.
// Divergent executable/structured documents are saved for review, never concatenated.
export function resolveConflicts(actions, nextFiles, policy, desired) {
  const conflicts = actions.filter(action => action.action === 'conflict').map(({ path, reason, before }) => ({ path, reason, kind: before?.kind || 'unreadable' }));
  if (policy === 'abort') return { actions, conflicts, review: [], skipped: [] };
  const review = [], skipped = [], byPath = new Map(actions.map(action => [action.path, action]));
  const blocked = actions.filter(action => action.unreadable || action.blocker && policy === 'merge' && action.before?.kind === 'symlink');
  const blockedSkills = blocked.some(action => under(SKILL_SOURCE,action.path) || action.path.startsWith(SKILL_SOURCE+'/') || under(ASSET_ROOT+'/agents',action.path) || action.path.startsWith(ASSET_ROOT+'/agents/'));
  for (const action of actions) {
    const linkSource = action.requires || action.migrationTo || (action.after?.kind === 'symlink' ? path.posix.normalize(path.posix.join(path.posix.dirname(action.path),action.after.target)) : null);
    if (linkSource && byPath.get(linkSource)?.resolution === 'skip' || blockedSkills && (isManagedAgentPath(action.path) || action.path.startsWith(ASSET_ROOT+'/agents/') || action.path.startsWith(ASSET_ROOT+'/.generated/') || action.migrationTo?.startsWith(ASSET_ROOT+'/agents/') || action.migrationTo?.startsWith(ASSET_ROOT+'/.generated/')) || blocked.some(parent => under(action.path, parent.path) || linkSource && under(linkSource,parent.path))) {
      action.action = 'preserve'; action.after = action.before; action.resolution = 'skip';
      skipped.push({ path: action.path, reason: action.reason || '父目录链接保持原状，未写入其目标' });
      delete nextFiles[action.path]; continue;
    }
    if (action.action !== 'conflict') continue;
    if (action.unreadable) { action.action = 'preserve'; action.resolution = 'skip'; action.after = action.before; skipped.push({ path: action.path, reason: action.reason }); delete nextFiles[action.path]; continue; }
    action.resolution = policy;
    if (policy === 'merge' && action.path.startsWith(ASSET_ROOT+'/.generated/') && action.before?.kind === 'file' && action.after?.kind === 'file') {
      action.candidates = [{path:`local/${action.path}`,text:action.before.text}];
      action.action = 'update';
      review.push({path:action.path,reason:'派生格式从唯一 Agent 源重建，原修改已保存为候选',resolution:policy});
      continue;
    }
    if (policy === 'replace' || action.blocker || action.before?.kind !== 'file' || action.internalState || action.configFile || action.path === '.gitignore') {
      action.action = action.after === null ? 'remove' : action.before === null ? 'create' : 'update';
      review.push({ path: action.path, reason: action.reason, resolution: policy }); continue;
    }
    if (action.after?.kind === 'symlink') {
      const source = action.ruleSource || path.posix.normalize(path.posix.join(path.posix.dirname(action.path), action.after.target));
      const canonical = byPath.get(source), output = desired.get(source);
      if (canonical && !source.startsWith(ASSET_ROOT+'/.generated/') && !action.ruleSource && !canonical.localPreferred && (canonical.before === null || canonical.before.kind === 'file' && canonical.before.text === output?.text)) {
        if (canonical.after?.kind === 'file' && canonical.after.text !== action.before.text) canonical.candidates = [...(canonical.candidates || []), { path: `incoming/${source}`, text: canonical.after.text }];
        canonical.after = { kind: 'file', text: action.before.text };
        canonical.action = canonical.before === null ? 'create' : equalEntry(canonical.before, canonical.after) ? 'preserve' : 'update';
        canonical.localPreferred = true;
        if (nextFiles[source]) nextFiles[source].preserve = true;
      } else if (canonical?.after?.text !== action.before.text) {
        action.candidates = [{ path: `local/${action.path}`, text: action.before.text }];
      }
      action.action = 'update';
      nextFiles[action.path] = { kind: 'symlink', target: action.after.target, hash: hash(action.after.target) };
    } else if (action.after?.kind === 'file') {
      action.candidates = [{ path: `incoming/${action.path}`, text: action.after.text }];
      action.after = action.before; action.action = 'preserve'; action.localPreferred = true;
      if (nextFiles[action.path]) nextFiles[action.path].preserve = true;
    } else {
      action.action = 'preserve'; action.after = action.before; delete nextFiles[action.path];
    }
    review.push({ path: action.path, reason: action.reason, resolution: policy });
  }
  // Resolve canonical conflicts before converting adapters, regardless of tool order.
  return { actions, conflicts, review, skipped };
}

export async function recoveryDirectory(home, root, stamp) {
  return safe(home, `projects/${hash(root)}/backups/${stamp}`);
}

// Only completed, recognized operations are eligible for automatic retention.
export async function pruneBackups(home, root, now = Date.now()) {
  const directory = await safe(home, `projects/${hash(root)}/backups`);
  const entries = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^\d+-[a-f0-9-]{36}$/.test(entry.name)) continue;
    const location = await safe(home, `projects/${hash(root)}/backups/${entry.name}/completed.json`);
    const info = await stat(location);
    if (!info?.isFile()) continue;
    let record;
    try { record = JSON.parse(await fs.readFile(location, 'utf8')); } catch { continue; }
    if (record.project !== root || !Number.isFinite(record.completedAt)) continue;
    entries.push({ name: entry.name, time: record.completedAt });
  }
  entries.sort((a, b) => b.time - a.time || b.name.localeCompare(a.name));
  for (const entry of entries.slice(3)) {
    if (entry.time < now - 7 * 24 * 60 * 60 * 1000) {
      await fs.rm(await safe(home, `projects/${hash(root)}/backups/${entry.name}`), { recursive: true });
    }
  }
}

async function moveEntry(source, target) {
  try { await fs.rename(source, target); }
  catch (error) {
    if (error.code !== 'EXDEV') throw error;
    await fs.cp(source, target, { recursive: true, dereference: false, verbatimSymlinks: true, errorOnExist: true, force: false });
    await fs.rm(source, { recursive: true, force: true });
  }
}
export async function backupEntry(root, relative, entry, recovery) {
  if (!entry || entry.kind === 'directory') return;
  const source = await safe(root, relative, { leafLink: true });
  const target = await safe(recovery, `before/${relative}`);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.cp(source, target, { dereference: false, verbatimSymlinks: true, errorOnExist: true, force: false });
}
export async function installEntry(root, action, recovery) {
  if (action.before?.kind === 'directory') {
    const original = await safe(root, action.path), archived = await safe(recovery, `before/${action.path}`);
    await fs.mkdir(path.dirname(archived), { recursive: true });
    await moveEntry(original, archived); action.movedDirectory = true;
  }
  await putEntry(root, action.path, action.after);
}
export async function restoreEntry(root, action, recovery) {
  const file = await safe(root, action.path, { leafLink: true });
  if (action.before?.kind === 'directory' && action.movedDirectory) {
    if (await stat(file)) {
      const residue = await safe(recovery, `rollback-residue/${action.path}`);
      await fs.mkdir(path.dirname(residue), { recursive: true }); await moveEntry(file, residue);
    }
    await moveEntry(await safe(recovery, `before/${action.path}`), file); return;
  }
  if (action.before?.kind === 'directory') return;
  if ((await stat(file))?.isDirectory()) {
    const residue = await safe(recovery, `rollback-residue/${action.path}`);
    await fs.mkdir(path.dirname(residue), { recursive: true }); await moveEntry(file, residue);
  }
  if (action.before?.kind === 'binary') {
    if ((await stat(file))?.isSymbolicLink()) await fs.unlink(file);
    await fs.copyFile(await safe(recovery, `before/${action.path}`), file); return;
  }
  await putEntry(root, action.path, action.before, { restore: true });
}
export async function saveCandidates(root, actions, recovery) {
  for (const action of actions) for (const candidate of action.candidates || []) await write(recovery, candidate.path, candidate.text);
}
