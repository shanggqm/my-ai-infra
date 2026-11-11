import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadLayout } from './validate-feature.mjs';

export const templateRoot = fileURLToPath(new URL('../template/', import.meta.url));
const profilesFile = fileURLToPath(new URL('../references/FEATURE_PROFILES.json', import.meta.url));
export const conflict = message => Object.assign(Error(message), { exitCode: 2 });
export const table = value => value.replaceAll('\\', '\\\\').replaceAll('|', '\\|').replace(/\r?\n/g, '<br>');

export async function stat(io, filename) {
  try { return await io.lstat(filename); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
export async function text(io, filename) {
  const info = await stat(io, filename);
  if (!info) return null;
  if (info.isSymbolicLink() || !info.isFile()) throw conflict(`Expected an ordinary file: ${filename}`);
  const bytes = await io.readFile(filename);
  const value = bytes.toString('utf8');
  if (!Buffer.from(value).equals(bytes)) throw Error(`Expected UTF-8 text: ${filename}`);
  return value;
}
export async function templates(io, dir, prefix = '') {
  const result = [];
  for (const entry of await io.readdir(path.join(dir, prefix), { withFileTypes: true })) {
    const relative = path.join(prefix, entry.name);
    if (entry.isSymbolicLink()) throw Error(`Template symlink is unsupported: ${relative}`);
    if (entry.isDirectory()) result.push(...await templates(io, dir, relative));
    else if (entry.isFile() && entry.name !== '.gitkeep') result.push([relative, await text(io, path.join(dir, relative))]);
    else if (entry.isFile()) continue;
    else throw Error(`Unsupported template entry: ${relative}`);
  }
  return result;
}
export function render(source, values) {
  return source.replace(/\{\{([A-Z_]+)\}\}/g, (_, key) => {
    if (!Object.hasOwn(values, key)) throw Error(`Unknown template placeholder: ${key}`);
    return values[key];
  });
}
export async function featureProfile(io, requested) {
  const source = await text(io, profilesFile);
  if (source === null) throw Error(`Missing Profile registry: ${profilesFile}`);
  let registry;
  try { registry = JSON.parse(source); } catch { throw Error(`Invalid Profile registry JSON: ${profilesFile}`); }
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  if (!object(registry) || Object.keys(registry).sort().join(',') !== 'default,profiles'
    || !object(registry.profiles) || !Object.keys(registry.profiles).length
    || Object.entries(registry.profiles).some(([key, value]) => !/^[a-z][a-z0-9-]*$/.test(key)
      || !object(value) || Object.keys(value).join(',') !== 'label'
      || typeof value.label !== 'string' || !value.label.trim())
    || typeof registry.default !== 'string' || !Object.hasOwn(registry.profiles, registry.default)) {
    throw Error(`Invalid Profile registry structure: ${profilesFile}`);
  }
  const profile = requested ?? registry.default;
  if (!Object.hasOwn(registry.profiles, profile)) throw Error(`Unknown profile: ${profile}; expected ${Object.keys(registry.profiles).join(', ')}`);
  return { profile, defaultProfile: registry.default };
}
export function metadataText(source) {
  let comment = false, fence = null;
  return source.split(/\r?\n/).map(line => {
    if (fence) {
      const closing = line.match(/^ {0,3}(`+|~+)[ \t]*$/);
      if (closing && closing[1][0] === fence[0] && closing[1].length >= fence.length) fence = null;
      return '';
    }
    if (!comment && (/^(?: {4}|\t)/.test(line) || /^ {0,3}(`{3,}|~{3,})/.test(line))) {
      fence = line.match(/^ {0,3}(`{3,}|~{3,})/)?.[1] ?? null;
      return '';
    }
    let visible = '', rest = line;
    while (rest) {
      const marker = rest.indexOf(comment ? '-->' : '<!--');
      const code = !comment && rest.match(/(`+)(?!`)(.*?)\1(?!`)/);
      if (code && (marker < 0 || code.index < marker)) {
        visible += rest.slice(0, code.index + code[0].length);
        rest = rest.slice(code.index + code[0].length);
        continue;
      }
      if (marker < 0) { if (!comment) visible += rest; break; }
      if (!comment) visible += rest.slice(0, marker);
      rest = rest.slice(marker + (comment ? 3 : 4));
      comment = !comment;
    }
    fence = visible.match(/^ {0,3}(`{3,}|~{3,})/)?.[1] ?? null;
    return fence ? '' : visible;
  }).join('\n');
}
export function checkProfileTemplate(source, profile, defaultProfile, allowLegacy = true) {
  const visible = metadataText(source);
  const rows = [...visible.matchAll(/^ {0,3}\|[ \t]*Profile[ \t]*\|([^\r\n]*)$/gm)];
  if (allowLegacy && !rows.length && profile === 'standard' && profile === defaultProfile && !visible.includes('{{PROFILE}}')) return false;
  const tables = [...visible.matchAll(/(?:^ {0,3}\|[^\n]*(?:\n|$))+/gm)].map(match => match[0].replace(/\n$/, '').split('\n'));
  const metadata = tables.filter(lines => /^ {0,3}\|(?:[ \t]*:?-+:?[ \t]*\|){2}[ \t]*$/.test(lines[1] || '')
    && lines.slice(2).some(line => /^ {0,3}\|[ \t]*Phase[ \t]*\|/.test(line)));
  if (rows.length !== 1 || !/^\s*(?:\{\{PROFILE\}\}|[a-z][a-z0-9-]*)\s*\|\s*$/.test(rows[0][1])
    || metadata.length !== 1 || !metadata[0].slice(2).includes(rows[0][0])
    || rows[0][1].trim().replace(/\s*\|$/, '').replace('{{PROFILE}}', profile) !== profile) {
    throw Error('BRIEF template must record the selected Profile; update the installed Skill template');
  }
  return true;
}
export function roadmapWithRow(source, fields) {
  const row = count => `| ${fields.id} | [${table(fields.title).replaceAll('[', '\\[').replaceAll(']', '\\]')}](${fields.name}/BRIEF.md) | ${count === 5 ? fields.profile + ' | ' : ''}${fields.priority} | ${count === 4 ? '规格：' + fields.profile + '；' : ''}${table(fields.summary)} |`;
  const cr = source.includes('\r\n') ? '\r' : '';
  const lines = source.split('\n');
  const headings = lines.flatMap((line, i) => /^##\s+规划中\s*$/.test(line) ? [i] : []);
  if (headings.length > 1) throw conflict('ROADMAP contains multiple 规划中 sections; choose the intended index layout first');
  if (!headings.length) {
    const separator = source.endsWith('\n') ? '' : cr + '\n';
    return source + separator + cr + '\n## 规划中' + cr + '\n' + cr + '\n| 需求 | 标题 | 规格 | 优先级 | 说明 |' + cr + '\n|---|---|---|---|---|' + cr + '\n' + row(5) + cr + '\n';
  }
  const start = headings[0] + 1;
  let end = lines.findIndex((line, i) => i >= start && /^##\s/.test(line));
  if (end < 0) end = lines.length;
  const header = lines.findIndex((line, i) => i >= start && i < end && /^\s*\|/.test(line));
  const columns = header < 0 ? [] : lines[header].trim().split('|').slice(1, -1).map(s => s.trim());
  if (!['需求,标题,优先级,说明', '需求,标题,规格,优先级,说明'].includes(columns.join(','))
    || !new RegExp(`^\\s*\\|(?:\\s*:?-+:?\\s*\\|){${columns.length}}\\s*$`).test(lines[header + 1] || '')) {
    throw conflict('ROADMAP 规划中 table must have columns 需求、标题、[规格、]优先级、说明; preserve the file and ask the user how to adapt it');
  }
  let insertion = header + 2;
  while (insertion < end && /^\s*\|/.test(lines[insertion])) insertion++;
  if (lines.slice(insertion, end).some(line => /^\s*\|/.test(line))) throw conflict('ROADMAP 规划中 contains ambiguous tables; preserve the file before adapting it');
  lines.splice(insertion, 0, row(columns.length) + cr);
  return lines.join('\n');
}
export function allocateFeatureId(names, oldRoadmap, requestedSlug) {
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
      if (slug === requestedSlug) throw conflict(`Feature slug already exists: ${digits}-${slug}; choose a different slug or work in the existing Feature`);
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
  for (const match of (oldRoadmap || '').matchAll(/^\s*\|\s*(\d+)\s*\|/gm)) reserve(match[1]);
  for (const match of (oldRoadmap || '').matchAll(/(?:^|[(/])(\d+)-([^/\s()]+)\/BRIEF\.md\b/gm)) reserve(match[1], match[2]);
  if (usedNumbers.size === 1000) throw conflict('All Feature numbers 999–000 are in use; preserve existing Features and ask the user how to free or extend the numbering space');
  let next = (lowest + 999) % 1000;
  while (usedNumbers.has(next)) next = (next + 999) % 1000;
  return String(next).padStart(3, '0');
}

export function updateRoadmap(source, fields) {
  return roadmapWithRow(source, fields);
}

function sectionBounds(lines, heading) {
  const headings = lines.flatMap((line, index) => new RegExp(`^##\\s+${heading}\\s*$`).test(line.replace(/\r$/, '')) ? [index] : []);
  if (headings.length > 1) throw conflict(`ROADMAP contains multiple ${heading} sections; choose the intended index layout first`);
  if (!headings.length) return null;
  const start = headings[0] + 1;
  let end = lines.findIndex((line, index) => index >= start && /^##\s/.test(line.replace(/\r$/, '')));
  if (end < 0) end = lines.length;
  return { headingAt: headings[0], start, end };
}

function rowCells(line) {
  const body = line.replace(/\r$/, '').trim().replace(/^\|/, '').replace(/\|$/, '');
  const cells = [];
  let current = '';
  for (let index = 0; index < body.length; index++) {
    if (body[index] === '\\' && body[index + 1] === '|') { current += '\\|'; index++; continue; }
    if (body[index] === '|') { cells.push(current.trim()); current = ''; continue; }
    current += body[index];
  }
  cells.push(current.trim());
  return cells;
}

export function moveRoadmapRow(source, id, destination) {
  const cr = source.includes('\r\n') ? '\r' : '';
  const lines = source.split('\n');
  const matches = lines.flatMap((line, index) => /^\s*\|/.test(line) && rowCells(line)[0] === id ? [index] : []);
  if (matches.length !== 1) throw conflict(matches.length ? `ROADMAP contains multiple rows for ${id}; resolve the index before archiving` : `ROADMAP has no row for ${id}`);
  const cells = rowCells(lines[matches[0]]);
  const raw = lines[matches[0]].replace(/\r$/, '');
  lines.splice(matches[0], 1);
  let bounds = sectionBounds(lines, destination);
  if (!bounds) {
    if (lines.length && lines.at(-1) === '') lines.pop();
    lines.push('', `## ${destination}`, '', '| 需求 | 标题 | 规格 | 优先级 | 说明 |', '|---|---|---|---|---|');
    bounds = sectionBounds(lines, destination);
  }
  const header = lines.findIndex((line, index) => index >= bounds.start && index < bounds.end && /^\s*\|/.test(line));
  if (header < 0) throw conflict(`ROADMAP ${destination} section has no table`);
  const columns = rowCells(lines[header]);
  if (!['需求,标题,优先级,说明', '需求,标题,规格,优先级,说明'].includes(columns.join(','))) {
    throw conflict('ROADMAP destination table must have columns 需求、标题、[规格、]优先级、说明');
  }
  let row = raw;
  if (cells.length !== columns.length) {
    let title = cells[1] || id, profile = 'standard', priority = 'P1', summary = '';
    if (cells.length === 5) [, title, profile, priority, summary] = cells;
    else if (cells.length === 4) {
      [, title, priority, summary] = cells;
      const marked = summary.match(/^规格：([a-z][a-z0-9-]*)；([\s\S]*)$/);
      if (marked) { profile = marked[1]; summary = marked[2]; }
    } else throw conflict(`ROADMAP row for ${id} does not match the index columns`);
    row = `| ${id} | ${title} | ${columns.length === 5 ? profile + ' | ' : ''}${priority} | ${columns.length === 4 ? '规格：' + profile + '；' : ''}${summary} |`;
  }
  let insertion = header + 2;
  while (insertion < bounds.end && /^\s*\|/.test(lines[insertion] || '')) insertion++;
  lines.splice(insertion, 0, row + (cr ? '\r' : ''));
  return lines.join('\n');
}

export function reserveFeature(snapshot, slug, fields) {
  const id = allocateFeatureId([...snapshot.names, ...snapshot.reserved], snapshot.roadmap, slug);
  const name = `${id}-${slug}`;
  snapshot.reserved.push(name);
  snapshot.roadmap = roadmapWithRow(snapshot.roadmap, { id, name, ...fields });
  return { id, name, featurePath: `mai-specs/${name}` };
}

export async function readWorkspace(project, { io = fs } = {}) {
  const root = await io.realpath(path.resolve(project));
  const specsRoot = path.join(root, 'mai-specs');
  const info = await stat(io, specsRoot);
  if (info && (info.isSymbolicLink() || !info.isDirectory())) throw conflict('mai-specs must be an ordinary directory');
  const names = info ? (await io.readdir(specsRoot)).sort() : [];
  const roadmapPath = path.join(specsRoot, 'ROADMAP.md');
  const existing = await text(io, roadmapPath);
  const defaultRoadmap = await text(io, path.join(templateRoot, 'ROADMAP.md'));
  if (defaultRoadmap === null) throw Error('Missing ROADMAP template');
  const { profile, defaultProfile } = await featureProfile(io);
  const projectLayout = path.join(specsRoot, 'FEATURE_LAYOUT.json');
  const hasProjectLayout = Boolean(await stat(io, projectLayout));
  const layout = await loadLayout(hasProjectLayout ? projectLayout : undefined);
  const entries = await templates(io, path.join(templateRoot, 'feature'));
  const actualFiles = entries.map(([relative]) => relative.split(path.sep).join('/')).sort();
  if (JSON.stringify(actualFiles) !== JSON.stringify([...layout.initialFiles].sort())) {
    const message = 'Feature template must match initialFiles in FEATURE_LAYOUT.json; create later artifacts only in their own step';
    throw hasProjectLayout ? conflict(`Project layout conflicts with the installed template: ${message}`) : Error(message);
  }
  return { root, specsRoot, exists: Boolean(info), names, roadmap: existing ?? defaultRoadmap, roadmapExists: existing !== null, profile, defaultProfile, layout, entries };
}

export async function renderFeature(values, { io = fs } = {}) {
  const entries = await templates(io, path.join(templateRoot, 'feature'));
  return entries.map(([relative, source]) => [relative.split(path.sep).join('/'), render(source, values)]);
}

export function lockPath(project) {
  return path.join(project, 'mai-specs', '.feature-init.lock');
}

export async function acquireWorkspaceLock(project, { io = fs } = {}) {
  const specsRoot = path.join(project, 'mai-specs');
  const info = await stat(io, specsRoot);
  let createdRoot = false;
  if (!info) {
    await io.mkdir(specsRoot);
    createdRoot = true;
  } else if (info.isSymbolicLink() || !info.isDirectory()) {
    throw conflict('mai-specs must be an ordinary directory');
  }
  const lock = path.join(specsRoot, '.feature-init.lock');
  const token = randomUUID();
  try {
    await io.mkdir(lock);
  } catch (error) {
    if (createdRoot) { try { await io.rmdir(specsRoot); } catch { /* keep external content */ } }
    if (error.code === 'EEXIST') throw conflict(`Another initializer holds ${lock}; wait, or check for an interrupted run before removing its lock`);
    throw error;
  }
  try {
    await io.writeFile(path.join(lock, 'owner.json'), JSON.stringify({ token, pid: process.pid }) + '\n', { flag: 'wx' });
  } catch (error) {
    await io.rm(path.join(lock, 'owner.json'), { force: true });
    await io.rmdir(lock);
    if (createdRoot) { try { await io.rmdir(specsRoot); } catch { /* keep external content */ } }
    throw error;
  }
  return {
    lock, token, createdRoot,
    async release() {
      await io.rm(path.join(lock, 'owner.json'), { force: true });
      try { await io.rmdir(lock); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (createdRoot) { try { await io.rmdir(specsRoot); } catch { /* retain workspace content */ } }
    },
  };
}
