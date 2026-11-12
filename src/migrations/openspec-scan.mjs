import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { safe, stat } from '../fs.mjs';
import { selectChanges } from './openspec-selection.mjs';
import { inspectMetadata } from './openspec-metadata.mjs';
import { conflict } from '../feature-transaction.mjs';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');

async function directory(root, relative) {
  const file = await safe(root, relative);
  const info = await stat(file);
  if (!info) return null;
  if (!info.isDirectory()) throw conflict(`不是普通目录：${relative}`);
  return fs.readdir(file, { withFileTypes: true });
}

async function collect(root, relative, result) {
  const entries = await directory(root, relative);
  if (entries === null) return false;
  result.directories.push(relative);
  for (const entry of entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
    const child = path.posix.join(relative, entry.name);
    if (entry.isSymbolicLink()) throw conflict(`不支持软链接：${child}`);
    if (entry.isDirectory()) await collect(root, child, result);
    else if (entry.isFile()) {
      const filename = await safe(root, child);
      const info = await fs.lstat(filename);
      if (!info.isFile() || info.isSymbolicLink()) throw conflict(`文件发生变化：${child}`);
      const bytes = await fs.readFile(filename);
      result.files.push({ path: child, size: bytes.length, sha256: digest(bytes) });
    } else throw conflict(`不支持的文件类型：${child}`);
  }
  return true;
}

export async function scanOpenSpec(project, options) {
  const root = await fs.realpath(project);
  const entries = await directory(root, 'openspec/changes');
  if (entries === null) throw conflict('找不到 openspec/changes 目录');
  const members = entries.map(entry => ({ name: entry.name, kind: entry.isSymbolicLink() ? 'symlink' : entry.isDirectory() ? 'directory' : entry.isFile() ? 'file' : 'other' }))
    .sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  const activeIds = members.filter(entry => entry.kind === 'directory' && entry.name !== 'archive').map(entry => entry.name);
  const selection = selectChanges(options, activeIds);
  const result = { source: 'openspec', selection, members, directories: [], files: [], metadata: {} };
  for (const id of selection.ids) {
    const base = `openspec/changes/${id}`;
    await collect(root, base, result);
    const metadataPath = `${base}/.openspec.yaml`;
    const metadataFile = result.files.find(item => item.path === metadataPath);
    if (!metadataFile) {
      result.metadata[id] = inspectMetadata(null);
      continue;
    }
    const bytes = await fs.readFile(await safe(root, metadataPath));
    if (digest(bytes) !== metadataFile.sha256) throw conflict(`元数据在扫描时发生变化：${metadataPath}`);
    result.metadata[id] = inspectMetadata(bytes);
  }
  if (selection.mode === 'all') {
    await collect(root, 'openspec/specs', result);
    await collect(root, 'openspec/changes/archive', result);
  }
  return result;
}
