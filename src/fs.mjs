import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

export const hash = data => createHash('sha256').update(data).digest('hex');
export const json = value => JSON.stringify(value, null, 2) + '\n';
export async function stat(file) {
  try { return await fs.lstat(file); } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
}
export async function safe(root, relative, { leafLink = false } = {}) {
  const base = path.resolve(root), file = path.resolve(base, relative);
  if (file === base || !file.startsWith(base + path.sep)) throw Error('Path escapes its root');
  if ((await stat(base))?.isSymbolicLink()) throw Error(`Symlink root: ${base}`);
  let current = base;
  for (const part of path.relative(base, file).split(path.sep)) {
    current = path.join(current, part);
    if ((await stat(current))?.isSymbolicLink() && !(leafLink && current === file)) throw Error(`Symlink path: ${current}`);
  }
  return file;
}
export async function read(root, relative) {
  let file = await safe(root, relative, { leafLink: true }), s = await stat(file);
  // Read internal file aliases only; writes and parent-directory traversal stay strict.
  if (s?.isSymbolicLink()) {
    const target = path.resolve(path.dirname(file), await fs.readlink(file));
    file = await safe(root, path.relative(path.resolve(root), target)); s = await stat(file);
  }
  if (!s) return null;
  if (!s.isFile()) throw Error(`Expected a file: ${file}`);
  const bytes = await fs.readFile(file);
  const text = bytes.toString('utf8');
  if (!Buffer.from(text).equals(bytes)) throw Error(`Binary assets are not yet supported: ${file}`);
  return text;
}
export async function readJSON(root, relative, fallback) {
  await safe(root, relative);
  const text = await read(root, relative);
  return text === null ? fallback : JSON.parse(text);
}
export async function write(root, relative, text) {
  const file = await safe(root, relative);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = file + '.' + randomUUID() + '.tmp';
  try {
    await fs.writeFile(temp, text, { mode: 0o600, flag: 'wx' });
    await fs.rename(temp, file);
  } finally { await fs.rm(temp, { force: true }); }
}
export async function files(root, prefix = '') {
  const result = [];
  for (const entry of await fs.readdir(path.join(root, prefix), { withFileTypes: true })) {
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isSymbolicLink()) throw Error(`Asset symlink is unsupported: ${relative}`);
    if (entry.isDirectory()) result.push(...await files(root, relative));
    else if (entry.isFile()) result.push(relative);
  }
  return result.sort();
}
export async function locked(home, callback) {
  await fs.mkdir(home, { recursive: true, mode: 0o700 });
  const lock = await safe(home, '.lock');
  try { await fs.mkdir(lock); } catch (e) {
    if (e.code === 'EEXIST') throw Error(`Another operation is running. If it crashed, remove ${lock} after checking.`);
    throw e;
  }
  try { return await callback(); } finally { await fs.rmdir(lock); }
}
