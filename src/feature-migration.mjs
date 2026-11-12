import fs from 'node:fs/promises';
import path from 'node:path';
import { safe } from './fs.mjs';
import { scanOpenSpec } from './migrations/openspec-scan.mjs';
import { SOURCE_ID, SOURCE_VERSION } from './migrations/openspec.mjs';
import { moveRoadmapRow, readWorkspace, renderFeature, reserveFeature, table } from './migrations/workspace.mjs';
import { conflict as blocked, digest, publicPlan, revisionOf, submitTransaction } from './feature-transaction.mjs';
import { alignChange, defaultTargets, targetFor } from './openspec-align.mjs';
import { inspectMetadata } from './migrations/openspec-metadata.mjs';

const statePath = 'mai-specs/.mai-migration/state.json';
const ignorePath = 'mai-specs/.mai-migration/.gitignore';
const doneTask = '该 change 在 OpenSpec 已归档。BRIEF Phase 记为 done，ROADMAP 记在已完成。材料已对齐；迁移不重新评审。';
const emptyState = () => ({ version: 1, authority: { owner: 'external', sourceId: null }, cutover: null, imports: {}, archives: {} });

async function readBytes(root, relative) {
  const file = await safe(root, relative);
  const info = await fs.lstat(file);
  if (!info.isFile() || info.isSymbolicLink()) throw blocked(`不是普通文件：${relative}`);
  return { bytes: await fs.readFile(file), mode: info.mode & 0o777 };
}
async function maybeBytes(root, relative) {
  try { return await readBytes(root, relative); }
  catch (error) {
    if (error.code === 'ENOENT' || error.message?.includes('ENOENT')) return null;
    const info = await fs.lstat(path.join(root, relative)).catch(failure => failure.code === 'ENOENT' ? null : Promise.reject(failure));
    if (!info) return null;
    throw error;
  }
}

export async function loadMigrationState(root) {
  const current = await maybeBytes(root, statePath);
  if (!current) return { state: emptyState(), bytes: null };
  let state;
  try { state = JSON.parse(current.bytes.toString('utf8')); }
  catch { throw blocked(`迁移状态无法解析：${statePath}`); }
  if (state?.version !== 1 || !state.authority || !state.imports || !state.archives) throw blocked(`迁移状态与 Feature 记录不一致：${statePath}`);
  return { state, bytes: current.bytes, mode: current.mode };
}

function slugFor(id) {
  const slug = id.normalize('NFC').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(slug) ? slug : null;
}
function titleFrom(source, fallback) {
  const heading = source?.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return heading && !heading.includes('\n') ? heading.slice(0, 80) : fallback;
}
function modeName(mode) {
  return mode === 'all' ? '整仓切换' : mode === 'change' ? '单变更导入' : '批量变更导入';
}
function quote(value) {
  return /^[A-Za-z0-9_./:-]+$/.test(value) ? value : `'${value.replaceAll("'", "'\\''")}'`;
}
function commandFor(options, revision) {
  const select = options.change ? `--change ${options.change}` : options.changes ? `--changes ${options.changes}` : options.active ? '--active' : '--all';
  const project = options.project ? ` --project ${quote(options.project)}` : '';
  return `mai migrate openspec ${select} --revision ${revision}${project}`;
}
function fileAction(file, role, before, after, mode = 0o644) {
  return { path: file, role, before: before && { sha256: digest(before.bytes), mode: before.mode }, beforeBytes: before?.bytes || null, after, mode };
}
function addText(actions, file, before, text, role) {
  actions.push(fileAction(file, role, before, Buffer.from(text), before?.mode || 0o644));
}

export async function planMigration(project, options) {
  const workspace = await readWorkspace(project);
  const root = workspace.root;
  const scan = await scanOpenSpec(root, options);
  let loaded;
  try { loaded = await loadMigrationState(root); }
  catch (error) { loaded = { error, state: emptyState(), bytes: null }; }
  const findings = [];
  if (loaded.error) findings.push({ severity: 'block', path: statePath, message: loaded.error.message, hint: '核对状态、Feature 目录和 ROADMAP 后重新预览' });
  const state = loaded.state;
  const mode = scan.selection.mode;
  const active = scan.members.filter(entry => entry.kind === 'directory' && entry.name !== 'archive').map(entry => entry.name);
  if ((mode === 'active' || mode === 'changes') && !scan.selection.ids.length) {
    return finish(root, options, { operation: 'batch', mode, selection: [], created: 0, reused: 0, authority: 'openspec', members: scan.members, items: [], actions: [], findings: [{ severity: 'info', message: '无可迁移项' }] });
  }
  if (state.authority.owner === 'mai' && mode !== 'all') findings.push({ severity: 'block', path: statePath, message: 'MAI 已接管现行规格，不能再从 OpenSpec 增量导入', hint: '后续变更直接在 MAI 工作区维护' });
  if (mode === 'all' && state.authority.owner === 'mai' && state.authority.sourceId === SOURCE_ID) {
    const digestNow = digest(Buffer.from(scan.files.map(file => `${file.path}:${file.sha256}`).sort().join('\n')));
    const drift = state.cutover?.sourceDigest !== digestNow;
    return finish(root, options, {
      operation: 'cutover', mode, selection: scan.selection.ids, created: 0, reused: new Set(Object.values(state.imports[SOURCE_ID] || {}).map(entry => entry.featurePath)).size, authority: 'mai', members: scan.members, items: [], actions: [],
      findings: drift ? [{ severity: 'warning', message: 'OpenSpec 源快照已漂移，本次不改写已迁入的 Feature' }] : [],
    });
  }
  if (state.authority.sourceId && state.authority.sourceId !== SOURCE_ID) findings.push({ severity: 'block', path: statePath, message: `现行规格维护权属于 ${state.authority.sourceId}`, hint: '先解决维护权冲突' });
  for (const id of scan.selection.ids) noteMetadata(scan, id, mode, findings);
  const names = workspace.names.filter(name => !name.startsWith('.'));
  const snapshot = { names, roadmap: workspace.roadmap, reserved: [] };
  const actions = [];
  const imports = structuredClone(state.imports);
  imports[SOURCE_ID] ||= {};
  const items = [];
  for (const id of scan.selection.ids) items.push(await planChange({ root, workspace, state, imports, snapshot, scan, id, findings, actions, names }));
  if (mode === 'all') {
    const seenArchive = new Set();
    for (const archive of archiveEntries(scan)) {
      if (seenArchive.has(archive.id)) {
        findings.push({ severity: 'block', id: archive.id, path: archive.folder, message: '多个归档目录对应同一个 change ID', hint: '保留一个归档目录，或改成可区分的 ID' });
        items.push({ id: archive.id, sourcePath: archive.folder, decision: 'conflict', feature: null, missing: [], nextTask: '沿用已导入任务，继续前核对当前代码。' });
        continue;
      }
      seenArchive.add(archive.id);
      items.push(await planChange({ root, workspace, state, imports, snapshot, scan, id: archive.id, sourcePath: archive.folder, fromArchive: true, findings, actions, names }));
    }
    planCutover({ scan, findings, imports, active });
  }
  const hasBlock = findings.some(item => item.severity === 'block');
  if (hasBlock) actions.length = 0;
  if (!hasBlock) {
    const next = structuredClone(state);
    next.imports = imports;
    if (mode === 'all') {
      next.authority = { owner: 'mai', sourceId: SOURCE_ID };
      next.cutover = { sourceId: SOURCE_ID, sourceDigest: digest(Buffer.from(scan.files.map(file => `${file.path}:${file.sha256}`).sort().join('\n'))), planRevision: null };
    }
    const serialized = `${JSON.stringify(next, null, 2)}\n`;
    if (!loaded.bytes || loaded.bytes.toString('utf8') !== serialized) addText(actions, statePath, loaded.bytes ? { bytes: loaded.bytes, mode: loaded.mode || 0o644 } : null, serialized, 'state');
    if (!(await maybeBytes(root, ignorePath))) addText(actions, ignorePath, null, 'pending/\n', 'index');
    if (snapshot.roadmap !== workspace.roadmap) addText(actions, 'mai-specs/ROADMAP.md', workspace.roadmapExists ? await readBytes(root, 'mai-specs/ROADMAP.md') : null, snapshot.roadmap, 'index');
  }
  const created = items.filter(item => item.decision === 'create').length;
  const reused = items.filter(item => ['keep-target', 'update', 'adopt-equal'].includes(item.decision)).length;
  return finish(root, options, { operation: mode === 'all' ? 'cutover' : mode === 'change' ? 'import' : 'batch', mode, selection: scan.selection.ids, created, reused, authority: mode === 'all' && !hasBlock ? 'mai' : state.authority.owner === 'mai' ? 'mai' : 'openspec', members: scan.members, items, actions, findings });
}

function noteMetadata(scan, id, mode, findings, metadata = scan.metadata[id], fromArchive = false, base = `openspec/changes/${id}`) {
  if (!metadata.supported) {
    findings.push(fromArchive
      ? { severity: 'warning', id, path: base, message: `该 change 的元数据未按 spec-driven 核对（${metadata.reason}）。仍按可读文档对齐。` }
      : { severity: mode === 'all' ? 'block' : 'warning', id, path: `${base}/.openspec.yaml`, message: metadata.reason, hint: '改为受支持的 spec-driven 元数据，或移出本次范围' });
    return;
  }
  for (const key of metadata.unknown) findings.push({ severity: 'warning', id, message: `未解释的元数据字段：${key}` });
  if (metadata.skipSpecs && scan.files.some(file => file.path.startsWith(`${base}/specs/`))) {
    findings.push(fromArchive
      ? { severity: 'warning', id, path: base, message: '该 change 标记 skip_specs，差量要求仍写入 Feature 的 PRD' }
      : { severity: 'block', id, path: base, message: 'skip_specs 为 true，但存在差量文件', hint: '删除差量或关闭 skip_specs' });
  }
  if (metadata.retireCapabilities) findings.push({ severity: 'warning', id, message: '迁移保留能力文件，不因 retire_capabilities 删除规格' });
}

async function planChange({ root, workspace, state, imports, snapshot, scan, id, findings, actions, names, sourcePath = `openspec/changes/${id}`, fromArchive = false }) {
  if (fromArchive) noteMetadata(scan, id, 'all', findings, await archiveMetadata(root, scan, sourcePath), true, sourcePath);
  const aliased = fromArchive ? importForChange(imports, id) : null;
  const previous = aliased?.mapped || state.imports[SOURCE_ID]?.[sourcePath];
  const sourceFiles = scan.files.filter(file => file.path.startsWith(`${sourcePath}/`));
  const item = { id, sourcePath, decision: 'conflict', feature: previous?.featurePath || null, missing: [], nextTask: '沿用已导入任务，继续前核对当前代码。' };
  const slug = slugFor(id);
  if (!slug) {
    findings.push({ severity: 'block', id, path: sourcePath, message: 'change ID 不能转换成 Feature slug', hint: '使用只含小写字母、数字和连字符的目录名' });
    return item;
  }
  if (previous) {
    const reused = await reuseChange({ root, workspace, previous, sourceFiles, sourcePath, recordPath: aliased?.sourcePath || sourcePath, item, findings, actions, imports, names });
    if (fromArchive && reused.decision !== 'conflict' && reused.feature) await settleDone(root, snapshot, reused.feature, actions);
    return reused;
  }
  let reserved;
  try { reserved = reserveFeature(snapshot, slug, { title: id, priority: 'P1', profile: workspace.profile, summary: `导入 OpenSpec 变更 ${id}` }); }
  catch (error) { findings.push({ severity: 'block', id, path: sourcePath, message: error.message, hint: '处理编号或 slug 冲突后重新预览' }); return item; }
  item.feature = reserved.featurePath;
  const featureName = item.feature.split('/').at(-1);
  const inputs = await loadInputs(root, sourceFiles, sourcePath);
  const targets = targetsOf(workspace.layout);
  const aligned = alignChange({ id, featureName, profile: workspace.profile, sourcePath, files: inputs, targets });
  for (const message of aligned.warnings) findings.push({ severity: 'warning', code: 'capability', id, message });
  const occupied = [];
  for (const output of aligned.outputs) occupied.push(await maybeBytes(root, `${item.feature}/${output.targetRel}`));
  if (occupied.some(Boolean) || names.includes(featureName)) {
    findings.push({ severity: 'block', id, path: item.feature, message: '目标已有其他来源的同名内容', hint: '更换目录或先移开无关内容' });
    return item;
  }
  item.decision = 'create';
  const linkNotes = [];
  for (const file of inputs) {
    if (file.relative.endsWith('.md') && !file.bytes.includes(0)) linkNotes.push(...await inspectLinks(root, `${sourcePath}/${file.relative}`, file.bytes.toString('utf8'), sourcePath));
  }
  for (const note of linkNotes) findings.push({ severity: 'warning', code: 'link', id, path: `${sourcePath}/${note.from}`, message: `${note.from} 的相对引用 \`${note.href}\`：${note.hint}`, snippet: note.snippet });
  for (const output of aligned.outputs) actions.push(fileAction(`${item.feature}/${output.targetRel}`, 'content', null, output.bytes));
  item.missing = aligned.missing;
  item.nextTask = aligned.nextTask;
  const proposalText = inputs.find(file => file.relative === 'proposal.md')?.bytes.toString('utf8') || null;
  const rendered = await renderFeature({
    FEATURE_ID: reserved.id, TITLE: table(titleFrom(proposalText, id)), PRIORITY: 'P1', PROFILE: workspace.profile,
    OWNER: '待填', TARGET_DATE: '待填', MODULES: table(sourcePath),
    SUMMARY: `从 OpenSpec 变更 ${id} 导入。`,
    BACKGROUND: `原路径 \`${sourcePath}\`。提案、设计和任务已对齐到 MAI 产物；差量保持待生效。`,
    MATERIAL_ROWS: materialRows(aligned.entries, sourcePath),
    FINDINGS: item.missing.map(name => `- 缺少 ${name}`).join('\n'), QUESTIONS: '- 旧证据和勾选状态需要对照当前代码核对',
  });
  let brief = rendered.find(([name]) => name === 'BRIEF.md')[1] + briefLinks(sourcePath, item, targets);
  if (fromArchive) {
    brief = markDone(brief);
    snapshot.roadmap = moveRoadmapRow(snapshot.roadmap, reserved.id, '已完成');
  }
  actions.push(fileAction(`${item.feature}/BRIEF.md`, 'index', null, Buffer.from(brief)));
  actions.push(fileAction(`${item.feature}/context/_INDEX.md`, 'index', null, Buffer.from(rendered.find(([name]) => name === 'context/_INDEX.md')[1] + linkSection(linkNotes))));
  imports[SOURCE_ID][sourcePath] = mappedFrom(item.feature, inputs, aligned);
  return item;
}

async function reuseChange({ root, workspace, previous, sourceFiles, sourcePath, recordPath = sourcePath, item, findings, actions, imports, names }) {
  item.feature = previous.featurePath;
  const featureName = item.feature.split('/').at(-1);
  if (!names.includes(featureName) || !workspace.roadmap.includes(`${featureName}/BRIEF.md`)) {
    findings.push({ severity: 'block', id: item.id, path: item.feature, message: '导入映射与 Feature 目录或 ROADMAP 不一致', hint: '恢复目录和索引，或在备份后修正状态文件' });
    return item;
  }
  const targets = targetsOf(workspace.layout);
  const decision = await decideImport(root, previous, sourceFiles, sourcePath, targets);
  item.decision = decision;
  if (decision === 'conflict') {
    const changed = sourceFiles.filter(file => previous.files[file.path.slice(sourcePath.length + 1)]?.sourceDigest !== file.sha256).map(file => file.path.slice(sourcePath.length + 1));
    const missing = Object.keys(previous.files).filter(relative => !sourceFiles.some(file => file.path === `${sourcePath}/${relative}`));
    const detail = [changed.length && `源已修改或新增：${changed.join('、')}`, missing.length && `源已删除：${missing.join('、')}`].filter(Boolean).join('；');
    findings.push({ severity: 'block', id: item.id, path: sourcePath, message: `源和目标都有独立修改，或已导入文件从源消失${detail ? `（${detail}）` : ''}`, hint: '若源的改动只是重复勾选或编辑，用 git 把这些源文件恢复到导入时的内容（进度保留在 MAI Feature 中），再重新预览；其他情况备份后把受管副本调成一致' });
    return item;
  }
  const inputs = await loadInputs(root, sourceFiles, sourcePath);
  const aligned = alignChange({ id: item.id, featureName, profile: workspace.profile, sourcePath, files: inputs, targets });
  for (const message of aligned.warnings) findings.push({ severity: 'warning', code: 'capability', id: item.id, message });
  if (decision === 'update') {
    for (const output of aligned.outputs) {
      const target = `${previous.featurePath}/${output.targetRel}`;
      const before = await maybeBytes(root, target);
      if (before?.bytes.equals(output.bytes)) continue;
      actions.push(fileAction(target, 'content', before, output.bytes, before?.mode || 0o644));
    }
    const briefPath = `${previous.featurePath}/BRIEF.md`;
    const brief = await maybeBytes(root, briefPath);
    if (brief) {
      const refreshed = refreshCurrentTask(brief.bytes.toString('utf8'), aligned.nextTask);
      if (refreshed !== brief.bytes.toString('utf8')) actions.push(fileAction(briefPath, 'index', brief, Buffer.from(refreshed), brief.mode));
    }
  }
  imports[SOURCE_ID][recordPath] = mappingFor(decision, previous, inputs, aligned);
  return item;
}

async function loadInputs(root, sourceFiles, sourcePath) {
  const inputs = [];
  for (const file of sourceFiles) inputs.push({ relative: file.path.slice(sourcePath.length + 1), bytes: (await readBytes(root, file.path)).bytes });
  return inputs;
}
function materialRows(entries, sourcePath) {
  const seen = new Set();
  return entries.filter(entry => entry.targetRel && !seen.has(entry.targetRel) && seen.add(entry.targetRel)).map(entry => {
    const href = `../${entry.targetRel.split('/').map(encodeURIComponent).join('/')}`;
    return `| [${table(entry.targetRel)}](${href}) | ${table(path.posix.extname(entry.targetRel).slice(1) || 'file')} | ${table(`${sourcePath}/${entry.sourceRel}`)} | 已对齐到 MAI 路径 | — | OpenSpec |`;
  }).join('\n');
}
function refreshCurrentTask(brief, nextTask) {
  if (!brief.includes('## 当前任务')) return brief;
  return brief.replace(/## 当前任务\n\n[\s\S]*?(?=\n## |$)/, `## 当前任务\n\n${currentTaskText(nextTask)}`);
}
// 产物位置取自项目 Feature 布局契约（mai-specs/FEATURE_LAYOUT.json 或随包默认）。
function targetsOf(layout) {
  const path = id => layout?.artifacts?.find(item => item.id === id)?.path;
  return { proposal: path('prd') || defaultTargets.proposal, design: path('design') || defaultTargets.design };
}
const snapshotMark = '迁移时快照';
function currentTaskText(nextTask) {
  return `${nextTask}（${snapshotMark}；之后以技术方案任务分解中的勾选为准，从第一项未勾选且前置条件已满足的任务接续）\n\n旧评审、旧测试和已勾选任务均保留原样，适用性待核对。迁移没有把本变更标为完成。\n`;
}
const migratedTaskSection = section => section.includes(snapshotMark) || section.includes('迁移没有把本变更标为完成');
function markDone(brief) {
  const phase = brief.replace(/^(\|\s*Phase\s*\|\s*)[A-Za-z][\w-]*(\s*\|)/m, '$1done$2');
  const section = `## 当前任务\n\n${doneTask}\n`;
  const existing = phase.match(/## 当前任务\n\n[\s\S]*?(?=\n## |$)/);
  if (!existing) return `${phase.trimEnd()}\n\n${section}`;
  return migratedTaskSection(existing[0]) ? phase.replace(existing[0], section) : phase;
}
function roadmapSectionOf(source, id) {
  let section = '';
  for (const line of source.split('\n')) {
    const heading = line.replace(/\r$/, '').match(/^##\s+(.+?)\s*$/);
    if (heading) section = heading[1];
    if (/^\s*\|/.test(line)) {
      const cells = line.replace(/\r$/, '').trim().replace(/^\|/, '').split('|').map(cell => cell.trim());
      if (cells[0] === id) return section;
    }
  }
  return '';
}
async function settleDone(root, snapshot, featurePath, actions) {
  const number = featurePath.split('/').at(-1).match(/^(\d+)-/)?.[1];
  if (number && roadmapSectionOf(snapshot.roadmap, number) !== '已完成') snapshot.roadmap = moveRoadmapRow(snapshot.roadmap, number, '已完成');
  const briefPath = `${featurePath}/BRIEF.md`;
  const pending = actions.find(action => action.path === briefPath);
  const before = pending?.beforeBytes ? { bytes: pending.beforeBytes, mode: pending.mode } : await maybeBytes(root, briefPath);
  const current = pending ? pending.after.toString('utf8') : before?.bytes.toString('utf8');
  if (!current) return;
  const next = markDone(current);
  if (next === current) return;
  if (pending) pending.after = Buffer.from(next);
  else actions.push(fileAction(briefPath, 'index', before, Buffer.from(next), before.mode));
}
function briefLinks(sourcePath, item, targets) {
  return `\n## 有效来源\n\n- 需求：[PRD](${encodeURI(targets.proposal)})\n- 任务：[技术方案中的任务分解](${encodeURI(targets.design)})\n- 设计：[技术方案](${encodeURI(targets.design)})\n- 来源：\`${sourcePath}\`（迁入后只读；任务勾选和设计变更只改 MAI Feature，不要同时修改该目录下的原文件）\n\n## 当前任务\n\n${currentTaskText(item.nextTask)}`;
}
function importForChange(imports, id) {
  const group = imports[SOURCE_ID] || {};
  const activePath = `openspec/changes/${id}`;
  if (group[activePath]) return { sourcePath: activePath, mapped: group[activePath] };
  for (const [sourcePath, mapped] of Object.entries(group)) {
    if (!sourcePath.startsWith('openspec/changes/archive/')) continue;
    const folder = sourcePath.split('/').at(-1);
    if (folder === id || folder.replace(/^\d{4}-\d{2}-\d{2}-/, '') === id) return { sourcePath, mapped };
  }
  return null;
}
function archiveEntries(scan) {
  const folders = [...new Set(scan.files.filter(file => file.path.startsWith('openspec/changes/archive/')).map(file => file.path.split('/').slice(0, 4).join('/')))].sort();
  return folders.map(folder => {
    const name = folder.split('/').at(-1);
    return { folder, id: name.match(/^\d{4}-\d{2}-\d{2}-(.+)$/)?.[1] || name };
  });
}
async function archiveMetadata(root, scan, folder) {
  const metadataPath = `${folder}/.openspec.yaml`;
  if (!scan.files.some(file => file.path === metadataPath)) return inspectMetadata(null);
  return inspectMetadata((await readBytes(root, metadataPath)).bytes);
}
function mappedFrom(feature, inputs, aligned) {
  const bySource = new Map(aligned.entries.map(entry => [entry.sourceRel, entry]));
  const mappedFiles = {};
  for (const input of inputs) {
    const entry = bySource.get(input.relative);
    mappedFiles[input.relative] = { targetRel: entry?.targetRel || null, sourceDigest: digest(input.bytes), targetDigest: entry?.bytes ? digest(entry.bytes) : null };
  }
  return { featurePath: feature, files: mappedFiles };
}
function mappingFor(decision, previous, inputs, aligned) {
  const mapped = mappedFrom(previous.featurePath, inputs, aligned);
  if (decision !== 'keep-target') return mapped;
  for (const [relative, value] of Object.entries(mapped.files)) {
    const recorded = previous.files[relative];
    if (!recorded) continue;
    value.targetRel = recorded.targetRel;
    if (recorded.targetDigest) value.targetDigest = recorded.targetDigest;
  }
  return mapped;
}
function markdownLinks(text) {
  const lines = text.split(/\r?\n/);
  let fence = null;
  const found = [];
  for (const line of lines) {
    if (fence) {
      if (new RegExp(`^ {0,3}${fence[0]}{${fence.length},}\\s*$`).test(line)) fence = null;
      continue;
    }
    const opened = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (opened) { fence = opened[1]; continue; }
    for (const match of line.matchAll(/!?\[[^\]]*]\(([^)]+)\)/g)) {
      let target = match[1].trim();
      if (target.startsWith('<') && target.endsWith('>')) target = target.slice(1, -1).trim();
      target = target.replace(/\s+["'][^"']*["']$/, '');
      const href = target.split(/[?#]/)[0].trim();
      if (!href || /^[a-z][a-z0-9+.-]*:/i.test(href)) continue;
      found.push({ href, snippet: line.trim().slice(0, 160) });
    }
  }
  return found;
}
function locateLink(fromFile, href) {
  let decoded = href;
  try { decoded = decodeURI(href); } catch { return { broken: true, reason: '链接编码无效' }; }
  if (decoded.startsWith('/')) return { broken: true, reason: '绝对路径不能映射到项目内文件' };
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), decoded));
  if (resolved.startsWith('../') || resolved === '..' || resolved.startsWith('/')) return { broken: true, resolved, reason: '链接超出项目根' };
  return { resolved };
}
async function inspectLinks(root, filePath, text, sourcePath) {
  const notes = [];
  for (const link of markdownLinks(text)) {
    const located = locateLink(filePath, link.href);
    if (located.resolved?.startsWith(`${sourcePath}/`) || located.resolved === sourcePath) continue;
    let hint;
    if (!located.resolved) hint = `${located.reason}。原文：${link.snippet}`;
    else {
      let exists = null;
      try { exists = await maybeBytes(root, located.resolved); }
      catch (error) { hint = `指向 \`${located.resolved}\`，但无法按普通文件读取（${error.message}）。原文：${link.snippet}`; }
      if (hint) { notes.push({ from: filePath.slice(sourcePath.length + 1), href: link.href, snippet: link.snippet, hint }); continue; }
      if (!exists) hint = `失效。原文指向 \`${located.resolved}\`，项目内没有这个文件。原文：${link.snippet}`;
      else if (located.resolved.startsWith('openspec/specs/')) hint = `指向现行规格 \`${located.resolved}\`。迁移保留该 OpenSpec 文件，不复制到 mai-specs`;
      else if (located.resolved.startsWith('openspec/changes/archive/')) hint = `指向 OpenSpec 归档 \`${located.resolved}\`。迁移按 Feature 对齐该 change，不复制归档目录`;
      else hint = `指向项目内 \`${located.resolved}\`。复制到 Feature 后，原文的相对位置不再指向该文件`;
    }
    notes.push({ from: filePath.slice(sourcePath.length + 1), href: link.href, snippet: link.snippet, hint });
  }
  return notes;
}
function linkSection(notes) {
  if (!notes.length) return '';
  return `\n## 相对引用\n\n${notes.map(note => `- \`${note.from}\` 中的 \`${note.href}\`：${note.hint}`).join('\n')}\n`;
}
async function decideImport(root, previous, sourceFiles, sourcePath, targets) {
  const bySource = new Map(sourceFiles.map(file => [file.path.slice(sourcePath.length + 1), file]));
  for (const relative of Object.keys(previous.files)) if (!bySource.has(relative)) return 'conflict';
  let sourceSame = true, targetSameAsBase = true, targetSameAsSource = true;
  for (const [relative, current] of bySource) {
    const recorded = previous.files[relative];
    if (recorded && !recorded.targetRel) {
      if (current.sha256 !== recorded.sourceDigest) sourceSame = false;
      continue;
    }
    if (!recorded) {
      // 导入后新增的源文件：合并进 PRD/技术方案的类别随其他文件一并核对，独立文件只在目标处没有同名文件时作为新增。
      const added = targetFor(relative, targets);
      sourceSame = false; targetSameAsSource = false;
      if (added && added !== targets.proposal && added !== targets.design && await maybeBytes(root, `${previous.featurePath}/${added}`)) return 'conflict';
      continue;
    }
    const target = await maybeBytes(root, `${previous.featurePath}/${recorded.targetRel}`);
    if (current.sha256 !== recorded.sourceDigest) sourceSame = false;
    if (!target || digest(target.bytes) !== recorded.targetDigest) targetSameAsBase = false;
    if (!target || digest(target.bytes) !== current.sha256) targetSameAsSource = false;
  }
  if (sourceSame) return 'keep-target';
  if (targetSameAsSource) return 'adopt-equal';
  if (targetSameAsBase) return 'update';
  return 'conflict';
}

function planCutover({ scan, findings, imports, active }) {
  for (const sourcePath of Object.keys(imports[SOURCE_ID] || {})) {
    const id = changeIdFromSource(sourcePath);
    if (active.includes(id) || archivedChange(scan, id)) continue;
    findings.push({ severity: 'block', path: sourcePath, message: '活动映射对应的 change 已不在活动目录或归档历史中', hint: '确认本地改动后处置旧活动记录，再重新预览' });
  }
}
function changeIdFromSource(sourcePath) {
  const parts = sourcePath.split('/');
  const name = parts.at(-1);
  if (parts[2] === 'archive') return name.match(/^\d{4}-\d{2}-\d{2}-(.+)$/)?.[1] || name;
  return parts[2];
}
function archivedChange(scan, id) {
  return scan.directories.some(dir => {
    const parts = dir.split('/');
    if (parts.length !== 4 || parts.slice(0, 3).join('/') !== 'openspec/changes/archive') return false;
    const folder = parts[3];
    return folder === id || folder.replace(/^\d{4}-\d{2}-\d{2}-/, '') === id;
  });
}
function finish(root, options, plan) {
  const blocking = plan.findings.filter(item => item.severity === 'block');
  const empty = plan.findings.some(item => item.message === '无可迁移项');
  const canApply = !blocking.length && !empty;
  const revision = revisionOf({
    root: path.resolve(root), members: plan.members || [],
    source: SOURCE_ID, sourceVersion: SOURCE_VERSION, operation: plan.operation, selection: plan.selection, authority: plan.authority,
    findings: plan.findings.map(item => `${item.severity}:${item.message}`),
    actions: plan.actions.map(item => ({ path: item.path, role: item.role, before: item.before?.sha256 || null, after: item.after ? digest(item.after) : null })),
  });
  const messages = [];
  if (empty) messages.push('无可迁移项');
  else if (canApply && !plan.actions.length) {
    messages.push(`已预览迁移：${modeName(plan.mode)}。没有需要写入的变更，已迁入的 ${plan.reused} 个 Feature 保持不变。`);
  } else if (canApply) {
    messages.push(`已预览迁移：${modeName(plan.mode)}。将新增 ${plan.created} 个 Feature，复用 ${plan.reused} 个 Feature。核对清单后，使用本次 revision 提交。`);
    if (plan.actions.length) messages.push('执行期间请暂停编辑预览列出的受影响文件，完成后即可继续编辑。');
    const links = plan.findings.filter(item => item.code === 'link');
    if (links.length) messages.push(`有 ${links.length} 条指向变更目录之外的相对引用，已写入预览 findings 和 Feature 索引。`);
    if (plan.mode !== 'change') messages.push('请人工核对所选变更与其他 change 之间的依赖关系及开发顺序。');
  } else messages.push(...blocking.map(item => `无法继续迁移：${item.path || item.id || '项目'}（${item.message}）。请${item.hint || '处理阻塞项'}后重新预览。`));
  const submit = canApply && plan.actions.length ? commandFor(options, revision) : null;
  if (submit) messages.push(submit);
  return {
    ...plan, root, source: SOURCE_ID, sourceVersion: SOURCE_VERSION, revision, canApply, messages,
    submit, affected: plan.actions.map(item => item.path),
  };
}

export async function submitMigration(project, options, revision, hooks = {}) {
  const plan = await planMigration(project, options);
  const result = await submitTransaction(plan.root, plan, revision, { ...hooks, replan: () => planMigration(project, options) });
  result.messages = plan.messages;
  result.items = plan.items;
  result.submit = plan.submit;
  result.completion = plan.operation === 'cutover'
    ? '已切换到 my-ai-infra。活动 change 与已归档 change 已按 Feature 布局对齐。已归档 change 的 Phase 为 done，列在 ROADMAP 已完成。原 OpenSpec 文件已保留。'
    : plan.operation === 'import'
      ? `已将 ${plan.selection[0]} 导入 Feature ${plan.items[0]?.feature?.split('/').at(-1) || ''}。OpenSpec 继续维护现行规格和归档。`
      : `已导入 ${plan.selection.length} 个 OpenSpec 变更。OpenSpec 继续维护现行规格和归档。`;
  return result;
}

export function presentMigration(plan) {
  if (plan.applied !== undefined) return plan;
  return { ...publicPlan(plan), messages: plan.messages, submit: plan.submit, items: plan.items };
}

