// Parses OpenSpec delta headings so migration can place requirements into the MAI PRD.
const OPS = ['ADDED', 'MODIFIED', 'REMOVED', 'RENAMED'];

export function equivalent(left, right) {
  const norm = value => value.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n*$/, '\n');
  return norm(left) === norm(right);
}
export function requirementKey(name) {
  return name.normalize('NFC').trim();
}
export function requirementFold(name) {
  return requirementKey(name).replace(/\s+/g, ' ').toLowerCase();
}

function maskLines(lines) {
  const mask = Array(lines.length).fill('');
  let fence = null, comment = false;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (fence) {
      mask[index] = 'code';
      const closing = line.match(/^ {0,3}(`+|~+)[ \t]*$/);
      if (closing && closing[1][0] === fence[0] && closing[1].length >= fence.length) fence = null;
      continue;
    }
    if (!comment && /^ {0,3}(`{3,}|~{3,})/.test(line)) {
      fence = line.match(/^ {0,3}(`{3,}|~{3,})/)[1];
      mask[index] = 'code';
      continue;
    }
    let cursor = 0, hidden = comment;
    while (cursor < line.length) {
      const marker = line.indexOf(hidden ? '-->' : '<!--', cursor);
      if (marker < 0) break;
      hidden = !hidden;
      cursor = marker + (hidden ? 4 : 3);
    }
    if (comment || hidden) mask[index] = 'comment';
    comment = hidden;
  }
  return mask;
}

function splitLines(text) {
  const newline = text.includes('\r\n') ? '\r\n' : text.includes('\r') ? '\r' : '\n';
  const lines = text.split(/\r\n|\r|\n/);
  if (lines.at(-1) === '') lines.pop();
  return { lines, newline, trailing: text.endsWith(newline) || text === '' };
}

function visibleHeading(line, hidden) {
  if (hidden) return null;
  const section = line.match(/^ {0,3}##\s+(.+?)\s*$/);
  if (section) return { level: 2, title: section[1] };
  const requirement = line.match(/^ {0,3}### Requirement:\s*(.+?)\s*$/);
  if (requirement) return { level: 3, title: requirement[1] };
  return null;
}

export function parseDelta(text, capability = 'spec') {
  const { lines } = splitLines(text);
  const mask = maskLines(lines);
  const sections = { ADDED: [], MODIFIED: [], REMOVED: [], RENAMED: [] };
  const findings = [];
  let section = null, block = null, comment = false;
  const finish = () => {
    if (!block || !section) return;
    if (section === 'REMOVED') sections.REMOVED.push(block.name);
    else if (section === 'RENAMED') sections.RENAMED.push(block);
    else sections[section].push(block);
    block = null;
  };
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (mask[index] === 'code') continue;
    if (line.includes('<!--') || comment) {
      const opens = (line.match(/<!--/g) || []).length;
      const closes = (line.match(/-->/g) || []).length;
      if (line.includes('<!--')) comment = true;
      if (comment && closes >= opens && line.includes('-->')) comment = false;
      if (mask[index] === 'comment' || comment) continue;
    }
    const heading = visibleHeading(line, false);
    if (heading?.level === 2) {
      finish();
      const operation = heading.title.match(/^(ADDED|MODIFIED|REMOVED|RENAMED) Requirements$/);
      if (!operation) {
        if (/Requirements$/.test(heading.title)) findings.push({ blocking: true, message: `${capability} 含未支持的差量标题：${heading.title}` });
        section = null;
        continue;
      }
      section = operation[1];
      continue;
    }
    if (heading?.level === 3) {
      finish();
      if (!section) {
        findings.push({ blocking: true, message: `${capability} 的需求「${heading.title}」不在差量章节中` });
        continue;
      }
      block = { name: heading.title, raw: line, renames: [] };
      continue;
    }
    if (!block) {
      const rename = line.match(/^\s*(?:[-*+]\s+)?(FROM|TO):\s*`?(.+?)`?\s*$/);
      if (rename && section === 'RENAMED') {
        const last = sections.RENAMED.at(-1);
        if (rename[1] === 'FROM') sections.RENAMED.push({ name: rename[2], raw: '', renames: [rename[2]], to: null });
        else if (last && last.to === null) last.to = rename[2];
        else findings.push({ blocking: true, message: `${capability} 的 RENAMED 条目 TO 没有紧随的 FROM` });
      }
      continue;
    }
    block.raw += `\n${line}`;
    const rename = line.match(/^\s*(?:[-*+]\s+)?(FROM|TO):\s*`?(.+?)`?\s*$/);
    if (rename && section === 'RENAMED') {
      if (rename[1] === 'FROM') block.renames.push(rename[2]);
      else block.to = rename[2];
    }
  }
  finish();
  for (const item of sections.RENAMED) {
    const from = item.renames?.[0] || item.name;
    if (!item.to || item.renames?.length > 1) findings.push({ blocking: true, message: `${capability} 的改名必须是紧邻的 FROM 与 TO：${from}` });
    item.from = requirementKey(from);
    item.to = item.to ? requirementKey(item.to) : '';
  }
  for (const operation of OPS) {
    const names = operation === 'RENAMED' ? sections.RENAMED.flatMap(item => [item.from, item.to]) : sections[operation].map(item => requirementKey(item.name || item));
    const seen = new Map();
    for (const name of names) {
      const fold = requirementFold(name);
      if ([...seen.values()].some(existing => requirementFold(existing) === fold)) findings.push({ blocking: true, message: `${capability} 的 ${operation} 存在重复或仅空白/大小写不同的需求：${name}` });
      seen.set(name, name);
    }
  }
  const added = new Set(sections.ADDED.map(item => requirementKey(item.name)));
  const modified = new Set(sections.MODIFIED.map(item => requirementKey(item.name)));
  const removed = new Set(sections.REMOVED.map(requirementKey));
  for (const name of modified) {
    if (removed.has(name) || added.has(name)) findings.push({ blocking: true, message: `${capability} 的需求「${name}」同时出现在多个操作中` });
  }
  for (const name of added) if (removed.has(name)) findings.push({ blocking: true, message: `${capability} 的需求「${name}」同时新增和删除` });
  for (const item of sections.RENAMED) {
    if (removed.has(item.from)) findings.push({ blocking: true, message: `${capability} 不能同时改名并删除「${item.from}」` });
    if (modified.has(item.from)) findings.push({ blocking: true, message: `${capability} 改名后的修改必须使用新名称「${item.to}」` });
    if (added.has(item.to)) findings.push({ blocking: true, message: `${capability} 的新名称「${item.to}」与新增需求冲突` });
  }
  if (!sections.ADDED.length && !sections.MODIFIED.length && !sections.REMOVED.length && !sections.RENAMED.length) {
    findings.push({ blocking: true, message: `${capability} 没有可识别的 ADDED、MODIFIED、REMOVED 或 RENAMED 操作` });
  }
  return { ...sections, findings, purpose: purposeOf(text) };
}

function purposeOf(text) {
  const { lines } = splitLines(text);
  const mask = maskLines(lines);
  let capture = false, body = [];
  for (let index = 0; index < lines.length; index++) {
    if (mask[index]) continue;
    if (/^ {0,3}##\s+Purpose\s*$/.test(lines[index])) { capture = true; body = []; continue; }
    if (capture && /^ {0,3}##\s+/.test(lines[index])) break;
    if (capture) body.push(lines[index]);
  }
  return body.join('\n').trim();
}
