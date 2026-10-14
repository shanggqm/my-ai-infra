import fs from 'node:fs/promises';
import path from 'node:path';
import { sourceRoots } from './assets.mjs';
import { read, stat } from './fs.mjs';

const validName = value => typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 64;
export const AGENT_TOOLS = { codex: '.codex/agents', claudecode: '.claude/agents', cursor: '.cursor/agents', copilot: '.github/agents' };
export const GLOBAL_AGENT_TOOLS = { ...AGENT_TOOLS, copilot: '.copilot/agents' };
export const agentFilename = (tool, name) => `${name}${tool === 'codex' ? '.toml' : tool === 'copilot' ? '.agent.md' : '.md'}`;

export function parseAgent(content, expectedName) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]+)$/);
  if (!match) throw Error(`Invalid Agent asset: ${expectedName}`);
  const header = {};
  for (const line of match[1].split(/\r?\n/)) {
    const field = line.match(/^(name|description|skills):\s*(.+)$/);
    if (!field || Object.hasOwn(header, field[1])) throw Error(`Invalid Agent metadata: ${expectedName}`);
    header[field[1]] = JSON.parse(field[2]);
  }
  if (!validName(header.name) || header.name !== expectedName || typeof header.description !== 'string' || !header.description.trim() || !Array.isArray(header.skills) || !header.skills.every(validName) || new Set(header.skills).size !== header.skills.length) throw Error(`Invalid Agent metadata: ${expectedName}`);
  const body = match[2].trim();
  for (const skill of header.skills) if (!body.includes(`{{SKILL:${skill}}}`)) throw Error(`Agent ${expectedName} must reference Skill ${skill}`);
  for (const [, skill] of body.matchAll(/\{\{SKILL:([^}]+)\}\}/g)) if (!header.skills.includes(skill)) throw Error(`Undeclared Agent Skill: ${skill}`);
  return { ...header, body, content };
}

export async function agentCatalog(home) {
  const result = new Map();
  for (const root of await sourceRoots(home, 'agents')) {
    const info = await stat(root);
    if (!info) continue;
    if (!info.isDirectory() || info.isSymbolicLink()) throw Error(`Invalid Agent source directory: ${root}`);
    for (const entry of await fs.readdir(root, { withFileTypes: true })) {
      if (entry.name === 'README.md') continue;
      if (!entry.isFile() || !entry.name.endsWith('.md')) throw Error(`Invalid Agent source: ${entry.name}`);
      const name = entry.name.slice(0, -3);
      if (result.has(name)) continue;
      result.set(name, { ...parseAgent(await read(root, entry.name), name), sourceRoot: root });
    }
  }
  return [...result.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function renderAgent(agent, tool, skillPath) {
  if (!Object.hasOwn(AGENT_TOOLS, tool)) throw Error(`Unsupported Agent tool: ${tool}`);
  const body = agent.body.replace(/\{\{SKILL:([^}]+)\}\}/g, (_, skill) => {
    // Markdown destinations are URI-escaped; the path resolves from the agent file.
    return skillPath(skill).split(path.sep).join('/').split('/').map(encodeURIComponent).join('/');
  });
  const quote = JSON.stringify;
  if (tool === 'codex') return `name = ${quote(agent.name)}\ndescription = ${quote(agent.description)}\ndeveloper_instructions = ${quote(body + '\n')}\n`;
  const extra = tool === 'claudecode' ? `skills: ${quote(agent.skills)}\n` : tool === 'copilot' ? 'include-custom-instructions: true\n' : '';
  return `---\nname: ${quote(agent.name)}\ndescription: ${quote(agent.description)}\n${extra}---\n\n${body}\n`;
}

export function isManagedAgentPath(relative) {
  for (const prefix of ['.agents/agents', ...Object.values(AGENT_TOOLS)]) {
    if (!relative.startsWith(prefix + '/')) continue;
    const suffix = prefix === AGENT_TOOLS.codex ? '.toml' : prefix === AGENT_TOOLS.copilot ? '.agent.md' : '.md';
    const filename = relative.slice(prefix.length + 1);
    return filename.endsWith(suffix) && validName(filename.slice(0, -suffix.length));
  }
  return false;
}
