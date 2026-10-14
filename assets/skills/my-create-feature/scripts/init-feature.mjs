#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadLayout, validateFeature } from './validate-feature.mjs';

const templateRoot = fileURLToPath(new URL('../template/', import.meta.url));
const exec = promisify(execFile);
const fields = new Set(['project', 'slug', 'title', 'summary', 'background', 'modules', 'priority', 'owner', 'target-date', 'context']);
const conflict = message => Object.assign(Error(message), { exitCode: 2 });
const table = value => value.replaceAll('\\', '\\\\').replaceAll('|', '\\|').replace(/\r?\n/g, '<br>');
async function defaultOwner(project) {
  try {
    const { stdout } = await exec('git', ['config', '--get', 'user.name'], { cwd: project, timeout: 5000 });
    return stdout.trim() || '待填';
  } catch { return '待填'; }
}
async function stat(io, filename) {
  try { return await io.lstat(filename); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function text(io, filename) {
  const info = await stat(io, filename);
  if (!info) return null;
  if (info.isSymbolicLink() || !info.isFile()) throw conflict(`Expected an ordinary file: ${filename}`);
  const bytes = await io.readFile(filename);
  const value = bytes.toString('utf8');
  if (!Buffer.from(value).equals(bytes)) throw Error(`Expected UTF-8 text: ${filename}`);
  return value;
}
async function templates(io, dir, prefix = '') {
  const result = [];
  for (const entry of await io.readdir(path.join(dir, prefix), { withFileTypes: true })) {
    const relative = path.join(prefix, entry.name);
    if (entry.isSymbolicLink()) throw Error(`Template symlink is unsupported: ${relative}`);
    if (entry.isDirectory()) result.push(...await templates(io, dir, relative));
    else if (entry.isFile() && entry.name !== '.gitkeep') result.push([relative, await text(io, path.join(dir, relative))]);
    else if (entry.isFile()) continue; // Older installed templates may retain empty-directory placeholders.
    else throw Error(`Unsupported template entry: ${relative}`);
  }
  return result;
}
function render(source, values) {
  return source.replace(/\{\{([A-Z_]+)\}\}/g, (_, key) => {
    if (!Object.hasOwn(values, key)) throw Error(`Unknown template placeholder: ${key}`);
    return values[key];
  });
}
function roadmapWithRow(source, row) {
  const cr = source.includes('\r\n') ? '\r' : '';
  const lines = source.split('\n');
  const headings = lines.flatMap((line, i) => /^##\s+规划中\s*$/.test(line) ? [i] : []);
  if (headings.length > 1) throw conflict('ROADMAP contains multiple 规划中 sections; choose the intended index layout first');
  if (!headings.length) {
    const separator = source.endsWith('\n') ? '' : cr + '\n';
    return source + separator + cr + '\n## 规划中' + cr + '\n' + cr + '\n| 需求 | 标题 | 优先级 | 说明 |' + cr + '\n|---|---|---|---|' + cr + '\n' + row + cr + '\n';
  }
  const start = headings[0] + 1;
  let end = lines.findIndex((line, i) => i >= start && /^##\s/.test(line));
  if (end < 0) end = lines.length;
  const header = lines.findIndex((line, i) => i >= start && i < end && /^\s*\|/.test(line));
  const columns = header < 0 ? [] : lines[header].trim().split('|').slice(1, -1).map(s => s.trim());
  if (columns.join(',') !== '需求,标题,优先级,说明' || !/^\s*\|(?:\s*:?-+:?\s*\|){4}\s*$/.test(lines[header + 1] || '')) {
    throw conflict('ROADMAP 规划中 table must have columns 需求、标题、优先级、说明; preserve the file and ask the user how to adapt it');
  }
  let insertion = header + 2;
  while (insertion < end && /^\s*\|/.test(lines[insertion])) insertion++;
  lines.splice(insertion, 0, row + cr);
  return lines.join('\n');
}

async function prepareContext(io, filename) {
  if (!filename) return { files: [], rows: '', findings: '', questions: '' };
  const body = await text(io, filename);
  if (body === null) throw Error(`Missing context manifest: ${filename}`);
  const context = JSON.parse(body);
  if (!context || Array.isArray(context) || typeof context !== 'object' || Object.keys(context).some(key => !['materials', 'findings', 'questions'].includes(key))) throw Error('Invalid context manifest');
  const materials = context.materials ?? [];
  if (!Array.isArray(materials)) throw Error('context.materials must be an array');
  const list = key => {
    const values = context[key] ?? [];
    if (!Array.isArray(values) || values.some(value => typeof value !== 'string' || !value.trim())) throw Error(`context.${key} must contain non-empty strings`);
    return values.map(value => `- ${value.replace(/\r?\n/g, '\n  ')}`).join('\n');
  };
  const findings = list('findings'), questions = list('questions');
  const names = new Set(['_index.md']), files = [], rows = [];
  for (const material of materials) {
    if (!material || Array.isArray(material) || typeof material !== 'object' || Object.keys(material).some(key => !['path', 'source', 'summary', 'derivedFrom'].includes(key))) throw Error('Invalid context material');
    if (typeof material.path !== 'string' || !path.isAbsolute(material.path)) throw Error('Material path must be absolute');
    for (const key of ['source', 'summary', 'derivedFrom']) if (material[key] !== undefined && (typeof material[key] !== 'string' || !material[key].trim())) throw Error(`Material ${key} must be a non-empty string`);
    const info = await stat(io, material.path);
    if (!info?.isFile() || info.isSymbolicLink()) throw Error(`Expected an ordinary material file: ${material.path}`);
    const name = path.basename(material.path);
    if (/[\r\n\\]/.test(name) || name === '.gitkeep' || names.has(name.toLowerCase())) throw conflict(`Conflicting material filename: ${name}; resolve the input list before initialization`);
    names.add(name.toLowerCase());
    files.push([path.join('context', name), await io.readFile(material.path)]);
    const label = table(name).replaceAll('[', '\\[').replaceAll(']', '\\]');
    rows.push(`| [${label}](./${encodeURIComponent(name)}) | ${table(path.extname(name).slice(1) || 'file')} | ${table(material.source || material.path)} | ${table(material.summary || '未解析')} | ${new Date().toISOString().slice(0, 10)} | ${table(material.derivedFrom || '—')} |`);
  }
  return { files, rows: rows.join('\n'), findings, questions };
}

export async function initializeFeature(input, { io = fs, checkOnly = false } = {}) {
  if (!input || Object.keys(input).some(key => !fields.has(key))) throw Error('Unknown initialization option');
  for (const [key, value] of Object.entries(input)) if (typeof value !== 'string' || !value.trim()) throw Error(`Expected a non-empty string: ${key}`);
  const { slug, title } = input;
  if (!slug || slug.length > 64 || !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(slug)) throw Error('Invalid slug: use 1–64 lowercase letters, digits and hyphens');
  if (!title || /[\r\n]/.test(title)) throw Error('A one-line title is required');
  const priority = input.priority || 'P1';
  if (!/^P[0-3]$/.test(priority)) throw Error('Priority must be P0, P1, P2 or P3');
  const project = await io.realpath(path.resolve(input.project || process.cwd()));
  if (!(await io.stat(project)).isDirectory()) throw Error('Project must be an existing directory');
  const owner = input.owner || await defaultOwner(project);
  const specsRoot = path.join(project, 'mai-specs');
  const featureTemplate = path.join(templateRoot, 'feature');
  const entries = await templates(io, featureTemplate);
  for (const required of ['BRIEF.md', path.join('context', '_INDEX.md')]) {
    if (!entries.some(([relative]) => relative === required)) throw Error(`Missing required template: ${required}`);
  }
  const projectLayout = path.join(specsRoot, 'FEATURE_LAYOUT.json');
  const hasProjectLayout = Boolean(await stat(io, projectLayout));
  const layout = await loadLayout(hasProjectLayout ? projectLayout : undefined);
  const actualFiles = entries.map(([relative]) => relative.split(path.sep).join('/')).sort();
  if (JSON.stringify(actualFiles) !== JSON.stringify([...layout.initialFiles].sort())) {
    const message = 'Feature template must match initialFiles in FEATURE_LAYOUT.json; create later artifacts only in their own step';
    throw hasProjectLayout ? conflict(`Project layout conflicts with the installed template: ${message}`) : Error(message);
  }
  const defaultRoadmap = await text(io, path.join(templateRoot, 'ROADMAP.md'));
  if (defaultRoadmap === null) throw Error('Missing ROADMAP template');
  const context = await prepareContext(io, input.context);
  for (const [relative] of context.files) {
    if (layout.initialFiles.some(name => path.posix.basename(name).toLowerCase() === path.basename(relative).toLowerCase())) throw conflict(`Material filename conflicts with an initial file: ${relative}; resolve the input list first`);
  }

  let specsCreated = false, lockHeld = false, target = null;
  const written = [], directories = [];
  const lock = path.join(specsRoot, '.feature-init.lock');
  const roadmapTemp = path.join(lock, 'ROADMAP.md');
  const roadmapPath = path.join(specsRoot, 'ROADMAP.md');
  try {
    if (checkOnly) {
      const info = await stat(io, specsRoot);
      if (info && (!info.isDirectory() || info.isSymbolicLink())) throw conflict('mai-specs must be an ordinary directory');
      if (await stat(io, lock)) throw conflict(`Another initializer holds ${lock}; resolve the active or interrupted run first`);
      await io.access(info ? specsRoot : project, fs.constants.W_OK);
    } else {
      try { await io.mkdir(specsRoot); specsCreated = true; }
      catch (error) { if (error.code !== 'EEXIST') throw error; }
      const info = await stat(io, specsRoot);
      if (!info?.isDirectory() || info.isSymbolicLink()) throw conflict('mai-specs must be an ordinary directory');
      try { await io.mkdir(lock); lockHeld = true; }
      catch (error) { if (error.code === 'EEXIST') throw conflict(`Another initializer holds ${lock}; wait, or check for an interrupted run before removing its lock`); throw error; }
    }

    const oldRoadmap = await text(io, roadmapPath);
    const names = await stat(io, specsRoot) ? await io.readdir(specsRoot) : [];
    const seen = new Set(), slugs = new Map(), usedNumbers = new Set();
    let lowest = 1000;
    function reserve(digits, slug) {
      if (!/^\d{3}$/.test(digits)) throw conflict(`Invalid Feature number: ${digits}; expected 000–999`);
      const number = Number(digits);
      usedNumbers.add(number);
      lowest = Math.min(lowest, number);
      if (slug !== undefined) {
        if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(slug) || slug.length > 64) throw conflict(`Invalid existing Feature slug: ${slug}`);
        if (slugs.has(digits) && slugs.get(digits) !== slug) throw conflict(`Multiple Features use ${digits}; resolve the numbering first`);
        slugs.set(digits, slug);
        if (slug === input.slug) throw conflict(`Feature slug already exists: ${digits}-${slug}; choose a different slug or work in the existing Feature`);
      }
    }
    if (names.some(name => /^Feature-\d+(?:-|$)/.test(name)) || /\bFeature-\d+\b/.test(oldRoadmap || '')) {
      throw conflict('Legacy Feature- numbering exists in mai-specs or ROADMAP; ask the user how to migrate or continue the old convention before creating a descending-number Feature');
    }
    for (const name of names) {
      const match = name.match(/^(\d+)(?:-(.+))?$/);
      if (!match) continue;
      if (!match[2]) throw conflict(`Invalid Feature directory: ${name}; expected NNN-slug`);
      reserve(match[1], match[2]);
      if (seen.has(match[1])) throw conflict(`Multiple entries use ${match[1]}; resolve the numbering first`);
      seen.add(match[1]);
    }
    // Read numeric IDs only from index cells and Feature links, not dates or prose.
    for (const match of (oldRoadmap || '').matchAll(/^\s*\|\s*(\d+)\s*\|/gm)) reserve(match[1]);
    for (const match of (oldRoadmap || '').matchAll(/(?:^|[(/])(\d+)-([^/\s()]+)\/BRIEF\.md\b/gm)) {
      reserve(match[1], match[2]);
    }
    if (usedNumbers.size === 1000) throw conflict('All Feature numbers 999–000 are in use; preserve existing Features and ask the user how to free or extend the numbering space');
    let next = (lowest + 999) % 1000;
    while (usedNumbers.has(next)) next = (next + 999) % 1000;
    const id = String(next).padStart(3, '0');
    const name = `${id}-${slug}`;
    target = path.join(specsRoot, name);
    if (await stat(io, target)) throw conflict(`Target already exists: ${target}`);
    const values = {
      FEATURE_ID: id, TITLE: title, PRIORITY: priority,
      OWNER: table(owner), TARGET_DATE: table(input['target-date'] || '待填'),
      MODULES: table(input.modules || '待补充'), SUMMARY: input.summary || '待补充。', BACKGROUND: input.background || '待补充。',
      MATERIAL_ROWS: context.rows, FINDINGS: context.findings, QUESTIONS: context.questions,
    };
    // Replacement is one pass: user values containing {{...}} remain literal.
    const output = [...entries.map(([relative, source]) => [relative, render(source, values)]), ...context.files];
    if (context.files.length || context.findings || context.questions) {
      const index = entries.find(([relative]) => relative === path.join('context', '_INDEX.md'))[1];
      if (!['MATERIAL_ROWS', 'FINDINGS', 'QUESTIONS'].every(key => index.includes(`{{${key}}}`))) throw Error('Context template lacks material placeholders; update the installed Skill template before importing materials');
    }
    const row = `| ${id} | [${table(title).replaceAll('[', '\\[').replaceAll(']', '\\]')}](${name}/BRIEF.md) | ${priority} | ${table(input.summary || '待补充')} |`;
    const newRoadmap = roadmapWithRow(oldRoadmap ?? defaultRoadmap, row);
    if (checkOnly) return { ready: true, created: false, project, slug, files: output.map(([relative]) => relative) };
    const oldMode = (await stat(io, roadmapPath))?.mode;
    await io.writeFile(roadmapTemp, newRoadmap, { flag: 'wx', mode: oldMode === undefined ? 0o644 : oldMode & 0o777 });
    try { await io.mkdir(target); directories.push(target); }
    catch (error) { if (error.code === 'EEXIST') throw conflict(`Target was created concurrently: ${target}`); throw error; }
    for (const [relative, body] of output) {
      let current = target;
      for (const part of path.dirname(relative).split(path.sep).filter(p => p !== '.')) {
        current = path.join(current, part);
        if (!directories.includes(current)) { await io.mkdir(current); directories.push(current); }
      }
      const file = path.join(target, relative);
      await io.writeFile(file, body, { flag: 'wx' });
      written.push([file, body]);
    }
    // Complete deterministic checks before publishing the index or reporting success.
    for (const [file, body] of written) {
      const info = await stat(io, file);
      if (!info?.isFile() || info.isSymbolicLink() || !(await io.readFile(file)).equals(Buffer.from(body))) throw conflict(`Generated file changed or was not written correctly: ${file}`);
    }
    const validation = await validateFeature(target);
    if (!validation.valid) throw conflict(`Feature path validation failed: ${JSON.stringify(validation.issues)}`);
    if (await text(io, roadmapPath) !== oldRoadmap) throw conflict('ROADMAP changed during initialization; preserve the external edit and retry after reviewing it');
    // Publish a whole index; a new index must never replace a concurrent file.
    if (oldRoadmap === null) {
      try { await io.link(roadmapTemp, roadmapPath); }
      catch (error) { if (error.code === 'EEXIST') throw conflict('ROADMAP was created concurrently; preserve it and review before retrying'); throw error; }
    } else await io.rename(roadmapTemp, roadmapPath);
    return { created: true, id, slug, name, path: target, brief: path.join(target, 'BRIEF.md'), roadmap: roadmapPath, phase: 'draft', priority, files: output.map(([relative]) => relative), createdAt: new Date().toISOString() };
  } catch (error) {
    // Roll back only content still matching this operation; preserve outside edits.
    for (const [file, body] of written.reverse()) {
      try {
        const info = await stat(io, file);
        if (info?.isFile() && !info.isSymbolicLink() && (await io.readFile(file)).equals(Buffer.from(body))) await io.unlink(file);
      } catch { /* preserve changed files */ }
    }
    for (const dir of directories.reverse()) {
      try { await io.rmdir(dir); } catch { /* preserve directories containing outside content */ }
    }
    throw error;
  } finally {
    if (lockHeld) { await io.rm(roadmapTemp, { force: true }); await io.rmdir(lock); }
    if (specsCreated) { try { await io.rmdir(specsRoot); } catch { /* retain created Feature or external content */ } }
  }
}

export async function main(args = process.argv.slice(2)) {
  if (args.includes('--help')) {
    console.log('node init-feature.mjs --project PATH --slug record-search --title "资料检索" [--priority P1] [--summary TEXT] [--background TEXT] [--modules TEXT] [--owner TEXT] [--target-date TEXT] [--context JSON_FILE] [--check]\n--owner: defaults to git config user.name in the target project, or 待填 when unavailable.\n--check: read-only preflight, reserves no number. Exit 2: conflict; ask the user to choose. Git configuration is read only; no dependency installation.');
    return;
  }
  const options = {};
  let checkOnly = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--check') {
      if (checkOnly) throw Error('Duplicate option: --check');
      checkOnly = true;
      continue;
    }
    const key = args[i].startsWith('--') ? args[i].slice(2) : '';
    if (!fields.has(key)) throw Error(`Unknown option: ${args[i]}`);
    if (Object.hasOwn(options, key)) throw Error(`Duplicate option: --${key}`);
    const value = args[++i];
    if (!value || value.startsWith('--')) throw Error(`Missing value for --${key}`);
    options[key] = value;
  }
  console.log(JSON.stringify(await initializeFeature(options, { checkOnly }), null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(await fs.realpath(process.argv[1])).href) {
  main().catch(error => {
    console.error(JSON.stringify({ error: error.message, conflict: error.exitCode === 2 }));
    process.exitCode = error.exitCode || 1;
  });
}
