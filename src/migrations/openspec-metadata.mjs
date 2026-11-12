// Conservative YAML subset: metadata is never rewritten or evaluated.
const semanticKeys = new Set(['schema', 'created', 'goal', 'affected_areas', 'initiative', 'skip_specs', 'retire_capabilities']);
const failure = message => ({ supported: false, reason: message });

function stripComment(line) {
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote === '"' && c === '\\') { i++; continue; }
    if (quote === "'" && c === "'" && line[i + 1] === "'") { i++; continue; }
    if (quote && c === quote) { quote = null; continue; }
    if (!quote && (c === '"' || c === "'")) { quote = c; continue; }
    if (!quote && c === '#' && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i).trimEnd();
  }
  if (quote) throw new Error('字符串未闭合');
  return line.trimEnd();
}

function arrayItems(input) {
  const result = [];
  let start = 0, quote = null;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (quote === '"' && c === '\\') { i++; continue; }
    if (quote === "'" && c === "'" && input[i + 1] === "'") { i++; continue; }
    if (quote && c === quote) { quote = null; continue; }
    if (!quote && (c === '"' || c === "'")) { quote = c; continue; }
    if (!quote && c === ',') { result.push(input.slice(start, i)); start = i + 1; }
  }
  if (quote) throw new Error('字符串未闭合');
  if (input.trim()) result.push(input.slice(start));
  return result.map(scalar);
}

function scalar(raw) {
  const value = raw.trim();
  if (!value) throw new Error('缺少值');
  if (value.startsWith('"')) {
    const parsed = JSON.parse(value);
    if (typeof parsed !== 'string') throw new Error('不是字符串');
    return parsed;
  }
  if (value.startsWith("'")) {
    if (!value.endsWith("'") || value.length < 2) throw new Error('字符串未闭合');
    return value.slice(1, -1).replaceAll("''", "'");
  }
  if (/^[\[\]{}&*!|>@`]/.test(value) || /\s#/.test(value) || value.includes(': ')) throw new Error('不支持的 YAML 语法');
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (['null', '~'].includes(value)) throw new Error('不支持空值');
  return value;
}

export function inspectMetadata(bytes) {
  if (bytes === null) return failure('缺少 .openspec.yaml，schema 待核对');
  const text = bytes.toString('utf8');
  if (!Buffer.from(text).equals(bytes)) return failure('元数据不是 UTF-8');
  const value = Object.create(null), unknown = [];
  try {
    let sequence = null;
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim() || /^\s*#/.test(line)) continue;
      const visible = stripComment(line);
      if (!visible.trim()) continue;
      if (/^\s+/.test(visible)) {
        const item = visible.match(/^  -\s+(.+)$/);
        if (sequence === 'initiative') {
          const field = visible.match(/^  (store|id):\s+(.+)$/);
          if (!field || Object.hasOwn(value.initiative, field[1])) throw new Error('无效 initiative 字段');
          value.initiative[field[1]] = scalar(field[2]);
          continue;
        }
        if (!item || sequence !== 'affected_areas') throw new Error('不支持的嵌套语法');
        const parsed = scalar(item[1]);
        if (typeof parsed !== 'string' || !parsed) throw new Error('affected_areas 必须是字符串数组');
        value.affected_areas.push(parsed);
        continue;
      }
      sequence = null;
      const match = visible.match(/^([a-zA-Z][a-zA-Z0-9_-]*):(?:\s*(.*))?$/);
      if (!match) throw new Error('不支持的顶层语法');
      const [, key, raw = ''] = match;
      if (Object.hasOwn(value, key)) throw new Error(`重复字段：${key}`);
      if (key === 'initiative') {
        if (raw.trim()) throw new Error('initiative 必须是一层映射');
        value[key] = Object.create(null); sequence = key; continue;
      }
      if (key === 'affected_areas') {
        if (!raw.trim()) { value[key] = []; sequence = key; continue; }
        if (!raw.trim().startsWith('[') || !raw.trim().endsWith(']')) throw new Error('affected_areas 必须是数组');
        const inside = raw.trim().slice(1, -1).trim();
        value[key] = arrayItems(inside);
        if (value[key].some(item => typeof item !== 'string' || !item)) throw new Error('affected_areas 必须是字符串数组');
        continue;
      }
      value[key] = scalar(raw);
      if (!semanticKeys.has(key)) unknown.push(key);
    }
    if (value.initiative !== undefined && (Object.keys(value.initiative).length !== 2
      || !['store', 'id'].every(key => typeof value.initiative[key] === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.initiative[key])))) throw new Error('initiative 必须包含有效的 store 和 id');
    if (typeof value.schema !== 'string' || !value.schema) throw new Error('缺少 schema');
    if (value.schema !== 'spec-driven') throw new Error(`不支持的 schema：${value.schema}`);
    if (value.created !== undefined && (typeof value.created !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.created))) throw new Error('created 必须为 YYYY-MM-DD');
    if (value.goal !== undefined && (typeof value.goal !== 'string' || !value.goal)) throw new Error('goal 必须为非空字符串');
    for (const key of ['skip_specs', 'retire_capabilities']) {
      if (value[key] !== undefined && typeof value[key] !== 'boolean') throw new Error(`${key} 必须是布尔值`);
    }
    return { supported: true, schema: value.schema, skipSpecs: value.skip_specs ?? false, retireCapabilities: value.retire_capabilities ?? false, unknown };
  } catch (error) {
    return failure(error.message);
  }
}
