import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
let checked = 0;
async function walk(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (['node_modules', 'dist', '.git', '__pycache__'].includes(entry.name)) continue;
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw Error(`Unexpected source symlink: ${file}`);
    if (entry.isDirectory()) { await walk(file); continue; }
    if (!/\.(?:mjs|js|json)$/.test(file)) continue;
    const text = await fs.readFile(file, 'utf8');
    if (/[\t ]+$/m.test(text)) throw Error(`Trailing whitespace: ${path.relative(root, file)}`);
    if (file.endsWith('.json')) JSON.parse(text);
    else await run(process.execPath, ['--check', file], { timeout: 15000 });
    checked++;
  }
}
await walk(root);
console.log(`Source checks passed: ${checked} JavaScript/JSON files (syntax and whitespace).`);
