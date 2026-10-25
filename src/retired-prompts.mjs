import fs from 'node:fs/promises';
import path from 'node:path';
import { safe, stat } from './fs.mjs';
import { namePart } from './assets.mjs';
import { SHORTCUT_SKILLS } from './names.mjs';

// Prompt is retired. Only identify files to discard; never parse or merge its content.
const sources = ['.agents/prompts', '.agents/assets/prompts'];
const directories = [...sources, '.codex/prompts', '.github/prompts', '.copilot/prompts'];
const skillRoots = ['.agents/skills', '.claude/skills', '.cursor/skills', '.github/skills', '.copilot/skills'];
const within = (file, directory) => file === directory || file.startsWith(directory + '/');

export async function hasRetiredPromptLibrary(home) {
  for (const relative of ['assets/prompts', 'prompts']) if (await stat(await safe(home, relative, { leafLink: true }))) return true;
  return false;
}

export async function retiredPrompts(root, records, inspect, excluded = []) {
  const names = new Set(SHORTCUT_SKILLS), removals = new Map(), reset = new Set();
  let found = false;
  async function remove(relative) {
    if (excluded.some(directory => within(relative, directory))) return null;
    const before = await inspect(relative);
    if (before) removals.set(relative, { path: relative, action: 'remove', before, after: null, note: '丢弃已停用的 Prompt 资产，使用同名 Skill' });
    return before;
  }
  for (const directory of directories) {
    const before = await remove(directory);
    if (before) found = true;
    if (before?.kind === 'directory') {
      for (const entry of await fs.readdir(await safe(root, directory), { withFileTypes: true })) {
        const name = entry.name.replace(/(?:\.prompt)?\.md$/, '');
        if (namePart(name)) names.add(name);
      }
    }
  }
  for (const [relative, entry] of Object.entries(records)) {
    const source = sources.find(directory => within(relative, directory));
    if (source) {
      found = true;
      const name = relative.slice(source.length + 1).split('/')[0].replace(/\.md$/, '');
      if (namePart(name)) names.add(name);
    }
    if (entry?.kind === 'symlink') {
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(relative), entry.target));
      if (sources.some(directory => within(target, directory))) await remove(relative);
    }
  }
  for (const name of names) {
    for (const directory of ['.claude/commands', '.cursor/commands']) if (await remove(`${directory}/${name}.md`)) found = true;
    const body = await inspect(`.agents/skills/${name}/SKILL.md`);
    const wrapper = body?.kind === 'file' && /(?:\.\.\/)+(?:assets\/)?prompts\//.test(body.text);
    if (wrapper) found = true;
    if (wrapper && !SHORTCUT_SKILLS.includes(name)) {
      for (const directory of skillRoots) await remove(`${directory}/${name}`);
    }
  }
  if (found) for (const name of SHORTCUT_SKILLS) for (const directory of skillRoots) {
    for (const file of ['SKILL.md', 'agents/openai.yaml']) reset.add(`${directory}/${name}/${file}`);
  }
  // Avoid overlapping transactions when an old alias is inside a retired directory.
  const actions = [...removals.values()].filter(action => ![...removals.keys()].some(parent => parent !== action.path && within(action.path, parent)));
  return { found, reset, actions, contains: relative => directories.some(directory => within(relative, directory)) || actions.some(action => within(relative, action.path)) };
}
