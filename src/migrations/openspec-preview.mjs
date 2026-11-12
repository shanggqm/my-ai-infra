import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { scanOpenSpec } from './openspec-scan.mjs';
import { safe, stat } from '../fs.mjs';

// A source snapshot is only one input to a migration plan. In particular,
// it cannot authorize writes until target and workspace inputs are included.
export async function previewOpenSpecSource(project, options) {
  const root = await fs.realpath(project);
  const scan = await scanOpenSpec(root, options);
  const findings = [];
  for (const id of scan.selection.ids) {
    const metadata = scan.metadata[id];
    if (!metadata.supported) {
      findings.push({ id, severity: scan.selection.mode === 'all' ? 'block' : 'warning', message: metadata.reason });
      continue;
    }
    for (const key of metadata.unknown) findings.push({ id, severity: 'warning', message: `未解释的元数据字段：${key}` });
    const deltaRoot = `openspec/changes/${id}/specs/`;
    if (metadata.skipSpecs && scan.files.some(file => file.path.startsWith(deltaRoot))) {
      findings.push({ id, severity: 'block', message: 'skip_specs 为 true，但存在差量文件' });
    }
    if (metadata.retireCapabilities) findings.push({ id, severity: 'warning', message: '迁移保留能力文件，不因 retire_capabilities 删除规格' });
  }
  const target = await safe(root, 'mai-specs');
  const targetInfo = await stat(target);
  if (targetInfo && !targetInfo.isDirectory()) findings.push({ severity: 'block', message: 'mai-specs 不是普通目录' });
  const payload = { version: 1, root, scan, findings };
  return {
    ...payload,
    sourceRevision: createHash('sha256').update(JSON.stringify(payload)).digest('hex')
  };
}
