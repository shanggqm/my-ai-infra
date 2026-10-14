import fs from 'node:fs/promises';
import path from 'node:path';

// Markdown links declare package resources. Code spans/blocks describe commands,
// dynamic fixtures, and target-project inputs/outputs and are not dependencies.
export async function checkSkillResources(root, names) {
  const errors = [];
  async function exists(target) {
    try { await fs.access(target); return true; } catch { return false; }
  }
  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const filename = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) { errors.push(`Symlinked Skill resource: ${path.relative(root, filename)}`); continue; }
      if (entry.isDirectory()) { await walk(filename); continue; }
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
      const text = (await fs.readFile(filename, 'utf8')).replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, '').replace(/`+[^`\n]*`+/g, '');
      const targets = [
        ...text.matchAll(/\[[^\]\n]*\]\(\s*(?:<([^>\n]+)>|([^\s)]+))(?:\s+["'][^\n]*?["'])?\s*\)/g),
        ...text.matchAll(/^\s{0,3}\[[^\]\n]+\]:\s*(?:<([^>\n]+)>|(\S+))/gm),
      ];
      for (const match of targets) {
        const raw = match[1] || match[2];
        if (raw.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith('//')) continue;
        let target;
        try { target = decodeURIComponent(raw.split(/[?#]/)[0]); }
        catch { errors.push(`Invalid resource URL: ${path.relative(root, filename)} -> ${raw}`); continue; }
        if (!(await exists(path.resolve(path.dirname(filename), target)))) errors.push(`Broken Skill resource: ${path.relative(root, filename)} -> ${raw}`);
      }
    }
  }
  for (const name of names) {
    const dir = path.join(root, 'assets/skills', name);
    if (!(await exists(path.join(dir, 'SKILL.md')))) errors.push(`Missing required Skill resource: assets/skills/${name}/SKILL.md`);
    if (await exists(dir)) await walk(dir);
  }
  return errors;
}
