import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { read, safe, stat, write, json } from './fs.mjs';

export async function snapshot(root, relative) {
  const file = await safe(root, relative, { leafLink: true }), info = await stat(file);
  if (!info) return null;
  if (info.isSymbolicLink()) return { kind: 'symlink', target: await fs.readlink(file) };
  if (!info.isFile()) throw Error(`Expected a file: ${file}`);
  return { kind: 'file', text: await read(root, relative) };
}
export const equalEntry = (a, b) => json(a) === json(b);

export async function putEntry(root, relative, entry, { restore = false } = {}) {
  const file = await safe(root, relative, { leafLink: true });
  if (entry === null) { if (await stat(file)) await fs.unlink(file); return; }
  if (entry.kind === 'file') {
    if ((await stat(file))?.isSymbolicLink()) await fs.unlink(file);
    await write(root, relative, entry.text); return;
  }
  const target = path.resolve(path.dirname(file), entry.target);
  if (!restore) await safe(root, path.relative(path.resolve(root), target));
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = file + '.' + randomUUID() + '.tmp';
  try {
    await fs.symlink(entry.target, temporary, 'file');
    await fs.rename(temporary, file);
  } catch (error) {
    if (['EPERM', 'EACCES'].includes(error.code)) throw Error(`无法创建软链接 ${relative}，请启用系统软链接权限（Windows 可启用开发者模式）。`);
    throw error;
  } finally { await fs.rm(temporary, { force: true }); }
}
