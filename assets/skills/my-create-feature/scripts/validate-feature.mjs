#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const defaultLayout = fileURLToPath(new URL('../template/FEATURE_LAYOUT.json', import.meta.url));
async function info(filename) {
  try { return await fs.lstat(filename); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
export async function loadLayout(filename = defaultLayout) {
  const stat = await info(filename);
  if (!stat?.isFile() || stat.isSymbolicLink()) throw Error(`Expected an ordinary layout file: ${filename}`);
  const layout = JSON.parse(await fs.readFile(filename, 'utf8'));
  const safe = value => typeof value === 'string' && value.length > 0 && !value.includes('\\') && !path.posix.isAbsolute(value) && value.split('/').every(part => part && part !== '.' && part !== '..');
  if (layout.version !== 1 || !Array.isArray(layout.initialFiles) || !layout.initialFiles.length || !layout.initialFiles.every(safe) || !Array.isArray(layout.artifacts)) throw Error('Invalid Feature layout');
  const paths = [...layout.initialFiles];
  const ids = new Set();
  for (const artifact of layout.artifacts) {
    if (!artifact || !safe(artifact.path) || typeof artifact.id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(artifact.id) || ids.has(artifact.id) || typeof artifact.skill !== 'string' || !artifact.skill) throw Error('Invalid or duplicate artifact registration');
    paths.push(artifact.path); ids.add(artifact.id);
  }
  const folded = paths.map(p => p.toLowerCase());
  if (new Set(folded).size !== folded.length || folded.some(p => folded.some(other => other !== p && other.startsWith(p + '/')))) throw Error('Overlapping Feature paths');
  // Canonical basenames identify misplaced output outside the raw context area.
  if (new Set(folded.map(p => path.posix.basename(p))).size !== folded.length) throw Error('Ambiguous artifact basenames');
  return layout;
}

export async function validateFeature(feature, { layout: layoutOption, artifact } = {}) {
  if (typeof feature !== 'string' || !feature.trim()) throw Error('An existing --feature directory is required');
  const target = path.resolve(feature);
  const stat = await info(target);
  if (!stat?.isDirectory() || stat.isSymbolicLink()) throw Error(`Expected an ordinary Feature directory: ${target}`);
  const root = await fs.realpath(target);
  const projectLayout = path.join(path.dirname(root), 'FEATURE_LAYOUT.json');
  const layoutPath = layoutOption ? path.resolve(layoutOption) : await info(projectLayout) ? projectLayout : defaultLayout;
  const layout = await loadLayout(layoutPath);
  if (artifact && !layout.artifacts.some(a => a.id === artifact)) throw Error(`Unknown artifact: ${artifact}`);
  const issues = [], warnings = [], files = new Set();
  async function walk(relative = '') {
    const entries = await fs.readdir(path.join(root, relative), { withFileTypes: true });
    if (!entries.length && relative) warnings.push({ code: 'empty-directory', path: relative });
    for (const entry of entries) {
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) issues.push({ code: 'symlink', path: name });
      else if (entry.isDirectory()) await walk(name);
      else if (entry.isFile()) {
        files.add(name);
        if (entry.name === '.gitkeep') warnings.push({ code: 'legacy-placeholder', path: name });
      } else issues.push({ code: 'unsupported-entry', path: name });
    }
  }
  await walk();
  for (const name of layout.initialFiles) if (!files.has(name)) issues.push({ code: 'missing-initial-file', path: name });
  const registered = [...layout.initialFiles, ...layout.artifacts.map(a => a.path)];
  for (const expected of registered) {
    const basename = path.posix.basename(expected).toLowerCase();
    const matches = [...files].filter(name => {
      // Original materials may legitimately share an output filename.
      if (name.startsWith('context/') && !layout.initialFiles.includes(expected) && !expected.startsWith('context/')) return false;
      return path.posix.basename(name).toLowerCase() === basename;
    });
    for (const found of matches) if (found !== expected) issues.push({ code: 'misplaced-artifact', path: found, expected });
    if (matches.length > 1) issues.push({ code: 'duplicate-artifact', expected, paths: matches });
  }
  if (artifact) {
    const expected = layout.artifacts.find(a => a.id === artifact).path;
    if (!files.has(expected)) issues.push({ code: 'missing-requested-artifact', path: expected });
  }
  return { valid: issues.length === 0, feature: root, layout: layoutPath, issues, warnings, presentArtifacts: layout.artifacts.filter(a => files.has(a.path)).map(a => a.id) };
}

export async function main(args = process.argv.slice(2)) {
  if (args.length === 1 && args[0] === '--help') {
    console.log('node validate-feature.mjs --feature PATH [--artifact ID] [--layout PATH]\nRead-only path validation; absent future stages are allowed. No status or acceptance judgment.');
    return;
  }
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const key = args[i].slice(2), value = args[++i];
    if (!['--feature', '--layout', '--artifact'].includes(args[i - 1]) || Object.hasOwn(options, key) || !value || value.startsWith('--')) throw Error('Invalid or duplicate validation option');
    options[key] = value;
  }
  const result = await validateFeature(options.feature, options);
  console.log(JSON.stringify(result, null, 2));
  if (!result.valid) process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(await fs.realpath(process.argv[1])).href) {
  main().catch(error => { console.error(JSON.stringify({ error: error.message })); process.exitCode = 1; });
}
