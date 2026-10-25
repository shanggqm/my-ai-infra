import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUILTINS } from '../src/names.mjs';
import { metadata } from '../src/store.mjs';
import { checkSkillResources } from './check-skill-resources.mjs';
import { files } from '../src/fs.mjs';
import { agentCatalog, AGENT_TOOLS, renderAgent } from '../src/agents.mjs';
import { extensionCatalog, addExtensions, assetRelative } from '../src/assets.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const errors = [];
const check = (condition, message) => { if (!condition) errors.push(message); };
const exists = async relative => { try { await fs.access(path.resolve(root, relative)); return true; } catch { return false; } };
const names = BUILTINS.flatMap(s => [s.name, ...s.aliases]);
check(new Set(names).size === names.length, 'Duplicate canonical name or alias');
const actual = (await fs.readdir(path.join(root, 'assets/skills'), { withFileTypes: true })).filter(s => s.isDirectory()).map(s => s.name).sort();
check(JSON.stringify(actual) === JSON.stringify(BUILTINS.map(s => s.name).sort()), 'Skill set mismatch');
const manifest = await fs.readFile(path.join(root, 'manifest.yml'), 'utf8');
let section = '';
for (const line of manifest.split('\n')) {
  if (/^[a-z_]+:/.test(line)) section = line.split(':')[0];
  if (/^- /.test(line)) check(section === 'deliverables', `Top-level resource list outside deliverables: ${line}`);
}
const canonicalBlock = manifest.split('canonical:\n')[1]?.split('\nconfiguration:')[0] || '';
for (const [,relative] of canonicalBlock.matchAll(/^  [a-z_]+: (.+)$/gm)) {
  check(!path.isAbsolute(relative) && !relative.split('/').includes('..'), `Canonical path must stay inside this repository: ${relative}`);
  check(await exists(relative), `Missing canonical manifest path: ${relative}`);
}
const deliverables = manifest.split('deliverables:\n')[1]?.split('\nvalidation:')[0] || '';
for (const [,relative] of deliverables.matchAll(/^- (.+)$/gm)) check(await exists(relative), `Missing manifest deliverable: ${relative}`);
for (const { name } of BUILTINS) {
  try {
    const text = await fs.readFile(path.join(root, 'assets/skills', name, 'SKILL.md'), 'utf8');
    metadata(text, name);
    const header = text.match(/^---\nname: (".*")\ndescription: (".*")\ncompatibility: (".*")\nmetadata:\n  author: (".*")\n  source: (".*")\n(?:disable-model-invocation: true\n)?---\n/);
    check(Boolean(header), `Noncanonical frontmatter: ${name}`);
    if (header) {
      const [identity, description, compatibility, author, source] = header.slice(1).map(s => JSON.parse(s));
      check(identity === name && /[\u4e00-\u9fff]/u.test(description) && /[\u4e00-\u9fff]/u.test(compatibility), `Invalid identity or Chinese metadata: ${name}`);
      check(author === 'andy' && source === `assets/skills/${name}/SKILL.md`, `Invalid author/source: ${name}`);
    }
    check(deliverables.split('\n').includes(`- assets/skills/${name}/SKILL.md`), `Missing deliverable: ${name}`);
  } catch (e) { errors.push(`${name}: ${e.message}`); }
}
check(await exists('assets/skills/my-create-worktree/scripts/create-worktree.sh'), 'Missing worktree script');
check(await exists('assets/agents/architecture-review.md'), 'Missing architecture review Agent');
check(await exists('assets/agents/code-review.md'), 'Missing code review Agent');
errors.push(...await checkSkillResources(root, BUILTINS.map(s => s.name)));
try {
  for (const agent of await agentCatalog(root)) {
    check(agent.skills.every(skill => BUILTINS.some(item => item.name === skill)), `Unknown bundled Agent Skill: ${agent.name}`);
    check(deliverables.split('\n').includes(`- assets/agents/${agent.name}.md`), `Missing Agent deliverable: ${agent.name}`);
    for (const tool of Object.keys(AGENT_TOOLS)) renderAgent(agent, tool, skill => `../../.agents/skills/${skill}/SKILL.md`);
  }
} catch (error) { errors.push(error.message); }
try {
  const extensions = await extensionCatalog(root);
  for (const asset of extensions) {
    for (const file of Object.keys(asset.contents)) check(deliverables.split('\n').includes(`- assets/${assetRelative(asset,file)}`), `Missing extension deliverable: ${assetRelative(asset,file)}`);
  }
  for (const global of [false, true]) addExtensions(new Map(), extensions, ['codex', 'claudecode', 'cursor', 'copilot'], global);
} catch (error) { errors.push(error.message); }
for (const relative of ['README.md', 'assets/README.md', 'assets/agents/README.md', 'scripts/README.md', 'catalog/README.md', 'skill-inventory.md', 'CHANGELOG.md', 'THIRD_PARTY_NOTICES.md', ...await files(path.join(root, 'docs')).then(names => names.filter(name => name.endsWith('.md')).map(name => 'docs/' + name))]) {
  const body = (await fs.readFile(path.join(root, relative), 'utf8')).replace(/```[\s\S]*?```/g, '');
  for (const [, target] of body.matchAll(/\]\(([^)]+)\)/g)) {
    if (!target.includes('://') && !target.startsWith('#')) check(await exists(path.join(path.dirname(relative), target.split('#')[0])), `Broken link: ${relative} -> ${target}`);
  }
}
const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
const version = typeof pkg.version === 'string' && pkg.version.match(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/);
check(pkg.name === '@easyuseai/my-ai-infra' && version && (!version[4] || version[4].split('.').every(part => !/^0\d+$/.test(part))), 'Invalid npm identity/version');
check(manifest.split('\n').includes(`version: ${pkg.version}`), 'Package and manifest version differ');
check(pkg.author === 'andy' && typeof pkg.license === 'string' && pkg.keywords?.length > 0, 'Missing npm author/license/keywords');
check(pkg.type === 'module' && pkg.engines?.node === '>=22', 'Invalid runtime configuration');
check(pkg.private !== true && pkg.publishConfig?.access === 'public' && pkg.publishConfig?.registry === 'https://registry.npmjs.org/', 'Invalid publication target');
check(pkg.bin?.['my-ai-infra'] === 'bin/my-ai-infra.mjs' && (await fs.readFile(path.join(root, pkg.bin['my-ai-infra']), 'utf8')).startsWith('#!/usr/bin/env node\n'), 'Invalid CLI bin/shebang');
for (const entry of pkg.files || []) check(await exists(entry), `Missing packaged path: ${entry}`);
check(!['install','preinstall','postinstall','prepare'].some(name => pkg.scripts?.[name]), 'Unexpected installation lifecycle script');
check(Object.keys(pkg.dependencies || {}).length === 0, 'Runtime dependencies require an explicit distribution review');
check(pkg.scripts?.prepack === 'npm run validate' && pkg.scripts?.prepublishOnly === 'npm run verify', 'Release lifecycle must validate the tested snapshot');
for (const error of errors) console.error(error);
if (errors.length) process.exitCode = 1;
else console.log(`Validation passed: ${BUILTINS.length} Skills, recursive resources, Chinese frontmatter, author/source, links and npm configuration.`);
