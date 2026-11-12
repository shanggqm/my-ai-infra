import path from 'node:path';
import { parseDelta } from './spec-delta.mjs';

// 缺少项目布局契约时沿用随包默认路径；调用方传入项目 FEATURE_LAYOUT.json 登记的 prd 与 design 路径。
export const defaultTargets = { proposal: 'spec/PRD.md', design: 'design/TECH_DESIGN.md' };
const link = (from, to) => {
  const relative = path.posix.relative(path.posix.dirname(from), to);
  return encodeURI(relative.startsWith('.') ? relative : `./${relative}`);
};

export function alignChange({ id, featureName, profile, sourcePath, files, targets = defaultTargets }) {
  const inputs = files.map(file => ({ ...file, relative: file.relative.split(path.sep).join('/') }));
  const byRelative = new Map(inputs.map(file => [file.relative, file]));
  const classified = inputs.map(file => ({ ...file, targetRel: targetFor(file.relative, targets) }));
  const byProject = new Map(classified.filter(file => file.targetRel).map(file => [`${sourcePath}/${file.relative}`, file.targetRel]));
  const textOf = relative => {
    const file = byRelative.get(relative);
    if (!file || file.bytes.includes(0)) return null;
    return rewriteMarkdown(file.bytes.toString('utf8'), `${sourcePath}/${relative}`, byProject.get(`${sourcePath}/${relative}`), sourcePath, featureName, byProject);
  };
  const proposal = textOf('proposal.md');
  const design = textOf('design.md');
  const tasks = textOf('tasks.md');
  const deltas = classified.filter(file => file.relative.startsWith('specs/') && file.relative.endsWith('/spec.md')).sort((a, b) => a.relative.localeCompare(b.relative));
  const prd = renderPrd({ id, featureName, profile, sourcePath, proposal, deltas, tasks, design, byProject, targets });
  const tech = renderDesign({ id, featureName, profile, sourcePath, proposal: Boolean(proposal), design, tasks, targets });
  const outputs = new Map();
  outputs.set(targets.proposal, Buffer.from(prd));
  outputs.set(targets.design, Buffer.from(tech));
  for (const file of classified) {
    if (!file.targetRel || file.targetRel === targets.proposal || file.targetRel === targets.design) continue;
    const rewritten = file.bytes.includes(0) ? file.bytes : Buffer.from(rewriteMarkdown(file.bytes.toString('utf8'), `${sourcePath}/${file.relative}`, file.targetRel, sourcePath, featureName, byProject));
    outputs.set(file.targetRel, rewritten);
  }
  const bytesFor = relative => {
    const target = targetFor(relative, targets);
    return target ? outputs.get(target) : null;
  };
  return {
    entries: classified.map(file => ({ sourceRel: file.relative, targetRel: file.targetRel, bytes: bytesFor(file.relative) })),
    outputs: [...outputs].sort((a, b) => a[0].localeCompare(b[0])).map(([targetRel, bytes]) => ({ targetRel, bytes })),
    missing: ['proposal.md', 'design.md', 'tasks.md'].filter(name => !byRelative.has(name)),
    nextTask: nextTask(tasks),
    warnings: capabilityWarnings(proposal, deltas),
  };
}

export function targetFor(relative, targets = defaultTargets) {
  if (relative === 'proposal.md') return targets.proposal;
  if (relative === 'design.md' || relative === 'tasks.md') return targets.design;
  if (relative === '.openspec.yaml') return null;
  if (relative.startsWith('specs/') && relative.endsWith('/spec.md')) return targets.proposal;
  return `context/${relative}`;
}

function renderPrd({ id, featureName, profile, sourcePath, proposal, deltas, tasks, design, byProject, targets }) {
  const back = link(targets.proposal, 'BRIEF.md');
  const parsed = proposalSections(proposal);
  const exclude = parsed.exclude || nonGoals(design);
  const requirements = deltaRequirements(deltas, sourcePath, featureName, byProject);
  const pending = [];
  if (!proposal) pending.push('来源没有 proposal.md，背景和范围未能从提案对齐。');
  if (!design) pending.push('来源没有 design.md。');
  if (!tasks) pending.push('来源没有 tasks.md，当前不可接续。');
  for (const item of requirements.gaps) pending.push(item);
  const title = parsed.title || id;
  if (profile === 'simple') {
    return `# PRD：${title}

> Feature：${featureName} | Profile：simple | 状态：草案
> 需求来源：\`${sourcePath}/proposal.md\` | 模板来源：MAI simple

[返回需求简报](${back})

## 目标与范围

${parsed.why || '来源提案没有单独的背景段落。'}

${parsed.scope || '来源提案没有单独的范围段落。'}

${exclude ? `明确排除：\n\n${exclude}` : ''}
${parsed.capabilities ? `\n${parsed.capabilities}\n` : ''}${parsed.impact ? `\n${parsed.impact}\n` : ''}

${parsed.rest ? `来源提案的其余内容：\n\n${parsed.rest}` : ''}

## 用户流程与行为

${requirements.body || '来源没有可对齐的差量需求。'}

## 验收条件

验收标准如下。

${requirements.acceptance || '来源差量没有可抽取的场景。'}

${pending.length ? `## 待决定事项\n\n${pending.map(item => `- ${item}`).join('\n')}\n` : ''}`;
  }
  return `# PRD：${title}

> 状态：草案 | 负责人：待填

[返回需求简报](${back})

本文由 \`${sourcePath}\` 的提案和差量对齐到 MAI PRD。来源没有表达的章节已省略。

## 1. 背景与目标（Why）

- **背景/痛点**：${oneLine(parsed.why) || '来源提案没有单独的背景段落。'}
- **目标**：保留并继续 \`${sourcePath}\` 中尚未完成的变更。
${parsed.why ? `\n${parsed.why}\n` : ''}
## 4. 功能需求（What）

${requirements.body || '来源没有可对齐的差量需求。功能范围以下节为准。'}

## 7. 范围与边界（Scope）

- **包含**：${oneLine(parsed.scope) || oneLine(parsed.capabilities) || '来源提案没有 What Changes 或范围段落。'}
- **不包含**：${oneLine(exclude) || '来源提案没有 Non-goals 或非目标段落。'}
- **依赖**：${oneLine(parsed.impact) || '迁移不推断其他 change 的依赖。'}
${parsed.scope ? `\n${parsed.scope}\n` : ''}${parsed.capabilities ? `\n### Capabilities\n\n${parsed.capabilities}\n` : ''}${parsed.impact ? `\n### Impact\n\n${parsed.impact}\n` : ''}${exclude ? `\n### 非目标\n\n${exclude}\n` : ''}${parsed.rest ? `\n### 提案其余内容\n\n${parsed.rest}\n` : ''}

## 9. 验收标准（Acceptance Criteria）

${requirements.acceptance || '来源差量没有可抽取的场景。'}

## 待确认事项

| 问题/假设 | 来源 | 影响的编号/范围 | 是否阻塞 | 决策人/状态 |
|---|---|---|---|---|
${pending.length ? pending.map(item => `| ${cell(item)} | \`${sourcePath}\` | 本次导入 | 否 | 待核对 |`).join('\n') : '| 无 | — | — | 否 | — |'}
`;
}

function renderDesign({ id, featureName, profile, sourcePath, proposal, design, tasks, targets }) {
  const back = link(targets.design, 'BRIEF.md');
  const source = proposal ? `[PRD](${link(targets.design, targets.proposal)})` : `\`${sourcePath}\``;
  const taskBody = tasks?.trim() || '来源没有 tasks.md，当前不可接续。';
  const parts = designParts(design);
  const designBody = [parts.context, parts.goals, parts.rest].filter(Boolean).join('\n\n') || '来源没有 design.md。技术方案只登记已有任务，不补写未提供的设计。';
  if (profile === 'simple') {
    return `# 技术方案：${id}

> Feature：${featureName} | Profile：simple | 状态：草案 | 代码基线：待核对
> 需求来源：${source} | 模板来源：MAI simple

[返回需求简报](${back})

## 需求依据与验收

行为与验收以 ${source} 为准。差量要求已写入该 PRD。迁移不改写现行规格。

## 最小实现方案

${designBody}

## 实施任务与验证

${taskBody}

勾选状态沿用来源。迁移没有把这些任务标为完成。
`;
  }
  return `# ${id} 技术方案

> Feature：${featureName} | 有效需求来源：${source} | Profile：${profile || 'standard'} | 模板：MAI standard | 代码基线：待核对 | 状态：草案

[返回需求简报](${back})

## 需求依据与验收

行为与验收以 ${source} 为准。差量要求已写入该 PRD。迁移不改写现行规格。

## 1. 方案概述

### 1.1 设计目标和设计原则

${designBody}
${parts.decisions ? `\n### 1.3 关键决策与 Review 索引\n\n${parts.decisions}\n` : ''}${parts.risks ? `\n## 3. 风险评估\n\n${parts.risks}\n` : ''}${parts.migration ? `\n## 4. 兼容性考量\n\n${parts.migration}\n` : ''}
## 5. 任务分解

${taskBody}

勾选状态沿用来源。迁移没有把这些任务标为完成。
`;
}

function proposalSections(text) {
  if (!text) return { title: '', why: '', scope: '', exclude: '', capabilities: '', impact: '', rest: '', hasCapabilities: false };
  const lines = text.split(/\r?\n/);
  const title = lines.find(line => /^#\s+/.test(line))?.replace(/^#\s+/, '').trim() || '';
  const blocks = [];
  const intro = [];
  let current = null;
  for (const line of lines) {
    if (/^#\s+/.test(line)) continue;
    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      current = { title: heading[1], body: [] };
      blocks.push(current);
      continue;
    }
    if (current) current.body.push(line);
    else intro.push(line);
  }
  if (intro.join('\n').trim()) blocks.unshift({ title: '', body: intro });
  const used = new Set();
  const claim = pattern => {
    const matched = blocks.filter(block => pattern.test(block.title));
    for (const block of matched) used.add(block);
    return matched.map(block => block.body.join('\n').trim()).filter(Boolean).join('\n\n');
  };
  const why = claim(/^why\b|为什么|背景|problem/i);
  const exclude = claim(/non-goal|非目标|不包含|out of scope/i);
  const capabilities = claim(/^capabilities\b|能力/i);
  const impact = claim(/^impact\b|影响/i);
  const scope = claim(/what changes|变更内容|^范围\b|^scope\b/i);
  const rest = blocks.filter(block => !used.has(block)).map(block => block.title ? `## ${block.title}\n\n${block.body.join('\n').trim()}` : block.body.join('\n').trim()).filter(block => block.trim()).join('\n\n');
  return { title, why, scope, exclude, capabilities, impact, rest, hasCapabilities: blocks.some(block => /^capabilities\b|能力/i.test(block.title)) };
}

function nonGoals(design) {
  const goals = designParts(design).goals;
  const match = goals.match(/\*\*Non-Goals:\*\*\s*([\s\S]*)$/i);
  return match ? match[1].trim() : '';
}

function designParts(text) {
  const empty = { context: '', goals: '', decisions: '', risks: '', migration: '', rest: '' };
  if (!text) return empty;
  const blocks = headingBlocks(text);
  const used = new Set();
  const claim = pattern => {
    const matched = blocks.filter(block => pattern.test(block.title));
    for (const block of matched) used.add(block);
    return matched.map(block => block.body.join('\n').trim()).filter(Boolean).join('\n\n');
  };
  const context = claim(/^context\b|上下文/i);
  const goals = claim(/goals|目标/i);
  const decisions = claim(/^decisions\b|决策/i);
  const risks = claim(/risks|风险/i);
  const migration = claim(/migration plan|迁移/i);
  const rest = blocks.filter(block => !used.has(block)).map(block => block.title ? `## ${block.title}\n\n${block.body.join('\n').trim()}` : block.body.join('\n').trim()).filter(Boolean).join('\n\n');
  return { context, goals, decisions, risks, migration, rest };
}

function headingBlocks(text) {
  const blocks = [];
  const intro = [];
  let current = null;
  for (const line of text.split(/\r?\n/)) {
    if (/^#\s+/.test(line)) continue;
    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      current = { title: heading[1], body: [] };
      blocks.push(current);
      continue;
    }
    if (current) current.body.push(line);
    else intro.push(line);
  }
  if (intro.join('\n').trim()) blocks.unshift({ title: '', body: intro });
  return blocks;
}

function capabilityWarnings(proposal, deltas) {
  const sections = proposalSections(proposal);
  if (!sections.hasCapabilities) return [];
  const declared = [...sections.capabilities.matchAll(/`([^`]+)`/g)].map(match => match[1]);
  const present = deltas.map(file => file.relative.slice('specs/'.length, -'/spec.md'.length));
  const warnings = [];
  if (!declared.length && present.length) warnings.push('提案 Capabilities 没有列出已有差量能力。');
  for (const name of declared) if (!present.includes(name)) warnings.push(`提案列出的能力 \`${name}\` 没有对应差量 specs/${name}/spec.md。`);
  for (const name of present) if (declared.length && !declared.includes(name)) warnings.push(`差量能力 \`${name}\` 没有出现在提案 Capabilities 中。`);
  return warnings;
}

function deltaRequirements(deltas, sourcePath, featureName, byProject) {
  const rows = { ADDED: [], MODIFIED: [], REMOVED: [], RENAMED: [] };
  const acceptance = [];
  const gaps = [];
  let index = 1;
  const nextId = () => `FR-${String(index++).padStart(2, '0')}`;
  for (const file of deltas) {
    const capability = file.relative.slice('specs/'.length, -'/spec.md'.length);
    const text = rewriteMarkdown(file.bytes.toString('utf8'), `${sourcePath}/${file.relative}`, file.targetRel, sourcePath, featureName, byProject);
    const parsed = parseDelta(text, capability);
    for (const finding of parsed.findings) gaps.push(finding.message);
    const sourceRel = `${sourcePath}/specs/${capability}/spec.md`;
    for (const item of parsed.ADDED) rows.ADDED.push(requirementRow(nextId(), capability, item, acceptance, gaps));
    for (const item of parsed.MODIFIED) rows.MODIFIED.push(requirementRow(nextId(), capability, item, acceptance, gaps));
    for (const name of parsed.REMOVED) rows.REMOVED.push(`- ${name}（${capability}，来源 \`${sourceRel}\`）`);
    for (const item of parsed.RENAMED) rows.RENAMED.push(`- ${item.from} → ${item.to}（${capability}）`);
  }
  const purposes = [];
  for (const file of deltas) {
    const capability = file.relative.slice('specs/'.length, -'/spec.md'.length);
    const purpose = file.bytes.toString('utf8').match(/^## Purpose\s*\n+([\s\S]*?)(?=\n## |$)/);
    if (purpose?.[1].trim()) purposes.push(`能力 \`${capability}\`：${purpose[1].trim()}`);
  }
  const parts = [];
  if (purposes.length) parts.push(purposes.join('\n\n'));
  parts.push('### 4.1 新增需求\n\n' + (rows.ADDED.length ? table(rows.ADDED) : '无'));
  parts.push('### 4.2 变更需求\n\n' + (rows.MODIFIED.length ? table(rows.MODIFIED) : '无'));
  if (rows.REMOVED.length) parts.push(`### 4.3 移除需求\n\n${rows.REMOVED.join('\n')}`);
  if (rows.RENAMED.length) parts.push(`### 4.4 改名需求\n\n${rows.RENAMED.join('\n')}`);
  return { body: parts.join('\n\n'), acceptance: acceptance.join('\n\n'), gaps };
}

function requirementRow(id, capability, item, acceptance, gaps) {
  const scenarios = scenariosOf(item.raw);
  if (!scenarios.length) gaps.push(`${capability} 的需求「${item.name}」没有可抽取的场景。`);
  const related = [];
  for (const scenario of scenarios) {
    const ac = `AC-${String(acceptance.length + 1).padStart(2, '0')}`;
    related.push(ac);
    acceptance.push(`### ${ac}：${scenario.name}\n\n**关联**：${id}\n\n- **Given**：${scenario.given}\n- **When**：${scenario.when}\n- **Then**：${scenario.then}\n- **验证方式**：待对照当前代码`);
  }
  const behavior = behaviorOf(item.raw);
  return `| ${id} | 见关联验收 | 来源差量未单列输入 | ${cell(behavior)} | 见关联验收 | ${related.join('、') || '无'} |`;
}

function table(rows) {
  return `| 需求编号 | 触发条件 | 输入 | 预期行为 | 输出/结果 | 关联需求编号 |\n|---|---|---|---|---|---|\n${rows.join('\n')}`;
}

function scenariosOf(raw) {
  const marks = [...raw.matchAll(/^####\s+Scenario:\s*(.+)\s*$/gm)];
  return marks.map((mark, index) => {
    const start = mark.index + mark[0].length;
    const body = raw.slice(start, marks[index + 1]?.index ?? raw.length);
    return { name: mark[1].trim(), given: pick(body, 'GIVEN'), when: pick(body, 'WHEN'), then: pick(body, 'THEN') };
  });
}

function pick(body, label) {
  const bullet = body.match(new RegExp(`^\\s*[-*]\\s+${label}\\s+(.+)$`, 'mi'));
  if (bullet) return bullet[1].trim();
  const bold = body.match(new RegExp(`\\*\\*${label}\\*\\*\\s+(.+)`, 'i'));
  return bold ? bold[1].trim() : '来源未单列';
}

function behaviorOf(raw) {
  const lines = [];
  for (const line of raw.split(/\r?\n/).slice(1)) {
    if (/^####\s+/.test(line) || /^\s*(?:[-*+]\s+)?(?:FROM|TO):/.test(line)) break;
    if (line.trim()) lines.push(line.trim());
  }
  return lines.join(' ') || '见来源差量';
}

function nextTask(source) {
  if (source === null || source === undefined) return '缺少任务清单，当前不可接续。';
  const items = [];
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^(\s*)[-*]\s+\[([ xX])\]\s+(.*)$/);
    if (match) items.push({ indent: match[1].length, done: match[2].toLowerCase() === 'x', text: match[3] });
  }
  if (!items.length) return '任务清单没有可识别任务，当前不可接续。';
  const next = items.find((item, index) => {
    if (item.done) return false;
    const parent = [...items.slice(0, index)].reverse().find(candidate => candidate.indent < item.indent);
    return !parent || parent.done;
  });
  return next ? `下一项可执行任务：${next.text}` : '任务均已勾选。勾选本身不是验收通过，继续前请核对当前代码。';
}

function rewriteMarkdown(text, fromProjectFile, targetRel, sourcePath, featureName, byProject) {
  if (!targetRel) return text;
  const lines = text.split(/\n/);
  let fence = null;
  const rewritten = lines.map(line => {
    if (fence) {
      if (new RegExp(`^ {0,3}${fence[0]}{${fence.length},}\\s*$`).test(line)) fence = null;
      return line;
    }
    const opened = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (opened) { fence = opened[1]; return line; }
    return line.replace(/(!?\[[^\]]*]\()([^)]+)(\))/g, (all, open, destination, close) => {
      const next = rewriteDestination(destination, fromProjectFile, targetRel, sourcePath, featureName, byProject);
      return next ? `${open}${next}${close}` : all;
    });
  });
  return rewritten.join('\n');
}

function rewriteDestination(raw, fromProjectFile, targetRel, sourcePath, featureName, byProject) {
  let destination = raw.trim();
  if (destination.startsWith('<') && destination.endsWith('>')) destination = destination.slice(1, -1).trim();
  const titled = destination.match(/^(.*?)(\s+["'][^"']*["'])$/);
  const body = (titled ? titled[1] : destination).trim();
  const title = titled ? titled[2] : '';
  const splitAt = body.search(/[?#]/);
  const href = (splitAt < 0 ? body : body.slice(0, splitAt)).trim();
  const tail = (splitAt < 0 ? '' : body.slice(splitAt)) + title;
  if (!href || href.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(href)) return null;
  let decoded = href;
  try { decoded = decodeURI(href); } catch { return null; }
  if (decoded.startsWith('/')) return null;
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(fromProjectFile), decoded));
  if (resolved.startsWith('../') || resolved === '..') return null;
  const inside = resolved.startsWith(`${sourcePath}/`);
  const mapped = byProject.get(resolved);
  if (inside && !mapped) return null;
  const to = mapped ? path.posix.join('mai-specs', featureName, mapped) : resolved;
  const fromDir = path.posix.dirname(path.posix.join('mai-specs', featureName, targetRel));
  let relative = path.posix.relative(fromDir, to);
  if (!relative.startsWith('.')) relative = `./${relative}`;
  return `${relative}${tail}`;
}

function oneLine(value) {
  return value ? cell(value).slice(0, 180) : '';
}

function cell(value) {
  return value.replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim();
}
