import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { hash, json, locked, read, readJSON, safe, write } from './fs.mjs';
import { config } from './store.mjs';

const exec = promisify(execFile);
const CONFIG = '.my-ai-infra.json';
export const MEMORY_HEADER = '# 个人偏好记忆\n';
export const MEMORY_LIMITS = { entries: 40, approved: 30, inbox: 5, characters: 20000, body: 800 };
export const MEMORY_SCENES = ['all', 'feature', 'prd', 'design', 'design-review', 'test-plan', 'implement', 'code-review', 'delivery'];
export const validProjectId = id => typeof id === 'string' && /^[a-z0-9][a-z0-9-]{2,79}$/.test(id);
const slug = value => typeof value === 'string' && /^[a-z0-9][a-z0-9.-]{0,79}$/.test(value);
const fields = ['ID', 'Key', 'Scenes', 'Status', 'Basis', 'Source', 'Evidence', 'Updated'];
const line = (value, max = 300) => typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/[\r\n\u0000-\u001f]/.test(value);

export function validateEntry(entry) {
  if (!line(entry.title, 80) || !slug(entry.id) || !slug(entry.key)) throw Error('记忆标题、ID 或 Key 无效');
  if (!Array.isArray(entry.scenes) || !entry.scenes.length || entry.scenes.some(s => !MEMORY_SCENES.includes(s)) || new Set(entry.scenes).size !== entry.scenes.length) throw Error('记忆 Scenes 无效');
  if (!['inbox', 'approved', 'deprecated'].includes(entry.status)) throw Error('记忆 Status 无效');
  if (!['explicit', 'inferred', 'confirmed'].includes(entry.basis)) throw Error('记忆 Basis 无效');
  if (entry.status === 'approved' && entry.basis === 'inferred') throw Error('推断偏好只能作为候选，确认后改为 confirmed');
  if (!line(entry.source) || !line(entry.evidence) || !/^\d{4}-\d{2}-\d{2}$/.test(entry.updated) || Number.isNaN(Date.parse(entry.updated))) throw Error('记忆来源、用户原话或日期无效');
  if (typeof entry.body !== 'string' || !entry.body.trim() || entry.body.length > MEMORY_LIMITS.body || /^#{1,2}\s/m.test(entry.body) || /\u0000/.test(entry.body)) throw Error('记忆正文应简洁完整，最多 800 字符，不含一级或二级标题');
  return entry;
}

export function renderMemory(entries) {
  return MEMORY_HEADER + entries.map(e => {
    validateEntry(e);
    const values = [e.id, e.key, e.scenes.join(', '), e.status, e.basis, e.source, e.evidence, e.updated];
    return `\n## ${e.title}\n\n${fields.map((f, i) => `- ${f}: ${values[i]}`).join('\n')}\n\n${e.body.trim()}\n`;
  }).join('');
}

export function parseMemory(content) {
  if (typeof content !== 'string' || content.length > MEMORY_LIMITS.characters) throw Error('memory.md 超过 20000 字符；请先合并整理');
  const text = content.replaceAll('\r\n', '\n');
  if (!text.startsWith(MEMORY_HEADER)) throw Error('memory.md 必须以 # 个人偏好记忆 开头');
  const pieces = text.slice(MEMORY_HEADER.length).split(/^## /m);
  if (pieces.shift().trim()) throw Error('记忆条目必须使用二级标题；请保留约定格式');
  const entries = pieces.map(piece => {
    const [title, ...lines] = piece.split('\n');
    if (lines.shift() !== '') throw Error('记忆标题后需要空行');
    const values = fields.map(field => {
      const value = lines.shift();
      if (!value?.startsWith(`- ${field}: `)) throw Error(`记忆缺少字段 ${field}`);
      return value.slice(field.length + 4);
    });
    if (lines.shift() !== '') throw Error('记忆字段后需要空行');
    const [id, key, scenes, status, basis, source, evidence, updated] = values;
    return validateEntry({ title, id, key, scenes: scenes.split(',').map(s => s.trim()), status, basis, source, evidence, updated, body: lines.join('\n').trim() });
  });
  if (entries.length > MEMORY_LIMITS.entries || entries.filter(e => e.status === 'approved').length > MEMORY_LIMITS.approved || entries.filter(e => e.status === 'inbox').length > MEMORY_LIMITS.inbox) throw Error('记忆数量达到上限（总计 40、生效 30、候选 5）；请先合并、删除或停用');
  for (const key of ['id', 'key']) if (new Set(entries.map(e => e[key])).size !== entries.length) throw Error(`重复记忆 ${key}；请更新原条目`);
  const bodies = entries.map(e => e.body.replace(/\s/g, '').toLowerCase());
  if (new Set(bodies).size !== bodies.length) throw Error('重复记忆正文；请更新原条目');
  return entries;
}

// Resolve nested directories within the current Git worktree; never scan sibling projects.
export async function memoryProject(project) {
  const requested = await fs.realpath(path.resolve(project || process.cwd()));
  if (!(await fs.stat(requested)).isDirectory()) throw Error('项目路径必须是目录');
  let gitRoot, commonRoot;
  try {
    gitRoot = (await exec('git', ['-C', requested, 'rev-parse', '--show-toplevel'])).stdout.trim();
    const common = (await exec('git', ['-C', requested, 'rev-parse', '--path-format=absolute', '--git-common-dir'])).stdout.trim();
    if (path.basename(common) === '.git') commonRoot = path.dirname(common);
  } catch { /* Non-Git directories can also be initialized projects. */ }
  let root = requested;
  while (true) {
    const data = await readJSON(root, CONFIG, null);
    if (data) {
      // A new worktree may contain an old tracked config without the local identity.
      if (!data.projectId && commonRoot && commonRoot !== gitRoot) {
        const relative = path.relative(gitRoot, root);
        const main = path.join(commonRoot, relative);
        const shared = await readJSON(main, CONFIG, null);
        if (shared) return { requested, root, identityRoot: main, config: data, projectId: shared.projectId ? checkedId(shared.projectId) : null };
      }
      return { requested, root, identityRoot: root, config: data, projectId: data.projectId ? checkedId(data.projectId) : null };
    }
    if (root === gitRoot || path.dirname(root) === root) break;
    root = path.dirname(root);
  }
  if (commonRoot && commonRoot !== gitRoot) {
    const data = await readJSON(commonRoot, CONFIG, null);
    if (data) return { requested, root: gitRoot, identityRoot: commonRoot, config: data, projectId: data.projectId ? checkedId(data.projectId) : null };
  }
  return { requested, root: gitRoot || requested, identityRoot: gitRoot || requested, config: null, projectId: null };
}
function checkedId(id) { if (!validProjectId(id)) throw Error('Invalid projectId'); return id; }

export async function bindMemoryProject(home, project, projectId) {
  if (projectId !== undefined && projectId !== 'new') checkedId(projectId);
  return locked(home, async () => {
    const p = await memoryProject(project);
    if (!p.config) throw Error('请先 init 项目，再绑定个人记忆');
    await config(p.config, home, { allowEmpty: true });
    if (p.root === path.resolve(home) || p.root.startsWith(path.resolve(home) + path.sep) || path.resolve(home).startsWith(p.root + path.sep)) throw Error('个人库与项目目录必须分开');
    const existing = p.projectId;
    const id = projectId === 'new' || !existing && !projectId
      ? `${path.basename(p.root).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'project'}-${randomUUID()}`
      : projectId || existing;
    const identityRoot = projectId ? p.root : p.identityRoot;
    const before = await read(identityRoot, CONFIG);
    const data = JSON.parse(before);
    const relative = `projects/${id}/PROJECT.md`;
    const metadataBefore = await read(home, relative);
    if (projectId && projectId !== 'new' && !metadataBefore) throw Error('目标项目标识不存在；独立 fork 使用 --project-id new');
    const metadata = `# 项目绑定\n\n- ID: ${id}\n- Name: ${path.basename(p.root).replace(/[\r\n]/g, ' ')}\n- Path: ${p.root.replace(/[\r\n]/g, ' ')}\n`;
    await write(home, relative, metadata);
    try { await write(identityRoot, CONFIG, json({ ...data, projectId: id })); }
    catch (error) {
      if (metadataBefore === null) await fs.rm(await safe(home, relative));
      else await write(home, relative, metadataBefore);
      throw error;
    }
    return { projectId: id, root: p.root, path: path.join(home, `projects/${id}/memory.md`) };
  });
}

async function location(home, { project, scope = 'project' } = {}) {
  if (!['global', 'project'].includes(scope)) throw Error('scope 必须为 global 或 project');
  if (scope === 'global') return { relative: 'memory.md', scope };
  const p = await memoryProject(project);
  return { relative: p.projectId ? `projects/${p.projectId}/memory.md` : null, scope, projectId: p.projectId, root: p.root, requestedProject: p.requested };
}
export async function readMemory(home, options = {}) {
  const loc = await location(home, options);
  const content = loc.relative ? await read(home, loc.relative) : null;
  return { ...loc, path: loc.relative ? path.join(home, loc.relative) : null, content: content ?? MEMORY_HEADER, revision: content === null ? 'missing' : hash(content), entries: parseMemory(content ?? MEMORY_HEADER), limits: MEMORY_LIMITS };
}
export async function saveMemory(home, options, content, revision) {
  parseMemory(content);
  if (typeof revision !== 'string') throw Error('需要读取时的 revision，避免覆盖并发修改');
  return locked(home, async () => {
    const current = await readMemory(home, options);
    if (!current.relative) throw Error('项目尚未绑定记忆；先执行 memory bind');
    if (current.revision !== revision) throw Error('记忆已变化；请重新读取并合并，不能覆盖并发修改');
    if (content === current.content) return { ...current, changed: false };
    await write(home, current.relative, content);
    return { ...await readMemory(home, options), changed: true };
  });
}
export async function putMemory(home, options, entryText, revision) {
  const incoming = parseMemory(entryText);
  if (incoming.length !== 1) throw Error('memory put 每次只接收一条记忆');
  const current = await readMemory(home, options);
  if (current.revision !== revision) throw Error('记忆已变化；请重新读取并合并');
  const entry = incoming[0];
  const previous = current.entries.find(e => e.key === entry.key || e.id === entry.id);
  if (previous && (previous.key !== entry.key || previous.id !== entry.id)) throw Error('修订必须保留原 ID 和 Key');
  const unchanged = previous && ['title','id','key','status','basis','body'].every(k => previous[k] === entry[k]) && previous.scenes.join() === entry.scenes.join();
  const entries = unchanged ? current.entries : previous ? current.entries.map(e => e.id === entry.id ? entry : e) : [...current.entries, entry];
  return saveMemory(home, options, unchanged ? current.content : renderMemory(entries), revision);
}
export async function deleteMemory(home, options, id, revision) {
  const current = await readMemory(home, options);
  if (!current.entries.some(e => e.id === id)) throw Error('未知记忆 ID');
  return saveMemory(home, options, renderMemory(current.entries.filter(e => e.id !== id)), revision);
}

export async function recallMemory(home, { project, scene, query = '', budget = 2400 } = {}) {
  if (!MEMORY_SCENES.includes(scene)) throw Error(`需要有效场景：${MEMORY_SCENES.join(', ')}`);
  if (!Number.isInteger(budget) || budget < 200 || budget > 10000) throw Error('budget 必须为 200–10000 字符');
  const sources = [await readMemory(home, { scope: 'global' }), await readMemory(home, { project })];
  const selected = new Map(), excluded = [];
  for (const source of sources) for (const e of source.entries) {
    const item = { ...e, scope: source.scope, path: source.path, revision: source.revision };
    const reason = e.status !== 'approved' ? '未生效' : !e.scenes.includes('all') && !e.scenes.includes(scene) ? '场景不匹配' : null;
    if (reason) { excluded.push({ id: e.id, scope: source.scope, reason }); continue; }
    if (selected.has(e.key)) excluded.push({ id: selected.get(e.key).id, scope: 'global', reason: '同决策点的项目偏好优先' });
    selected.set(e.key, item);
  }
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const ranked = [...selected.values()].sort((a, b) => {
    const score = e => terms.reduce((n, term) => n + Number(`${e.title} ${e.body}`.toLowerCase().includes(term)), 0);
    return score(b) - score(a) || Number(b.scope === 'project') - Number(a.scope === 'project') || a.id.localeCompare(b.id);
  });
  const entries = [], blocks = []; let used = 0;
  for (const e of ranked) {
    const block = `### ${e.title} [${e.scope}/${e.id}]\n${e.body}\n`;
    const cost = block.length + (blocks.length ? 1 : 0);
    if (used + cost > budget) { excluded.push({ id: e.id, scope: e.scope, reason: '超过本次字符预算，未截断条件与例外' }); continue; }
    used += cost; blocks.push(block); entries.push({ ...e, reason: e.scenes.includes(scene) ? `场景 ${scene}` : '通用协作偏好' });
  }
  return { projectId: sources[1].projectId, scene, budget, used, entries, excluded, context: blocks.join('\n'), bound: Boolean(sources[1].projectId) };
}
