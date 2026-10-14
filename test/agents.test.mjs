import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { agentCatalog, parseAgent, renderAgent, AGENT_TOOLS, GLOBAL_AGENT_TOOLS, agentFilename } from '../src/agents.mjs';
import { apply, plan, doctor } from '../src/project.mjs';
import { setup, seed } from '../src/store.mjs';
import { hash } from '../src/fs.mjs';

const exec = promisify(execFile);
const roles = [
  { name: 'architecture-review', skill: 'my-review-design' },
  { name: 'code-review', skill: 'my-review-code' },
];

test('default setup and CLI init install both review roles; sync can select either independently', async t => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'my-review-agents-')));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const project = path.join(root, 'project'), home = path.join(root, 'personal'), toolHome = path.join(root, 'tools');
  await fs.mkdir(project); await fs.mkdir(toolHome);
  const allTools = Object.keys(AGENT_TOOLS);
  assert.deepEqual((await setup(home, allTools, toolHome)).agents, roles.map(role => role.name));
  const cli = fileURLToPath(new URL('../bin/my-ai-infra.mjs', import.meta.url));
  await exec(process.execPath, [cli, 'init', '--home', home, '--project', project, '--tools', allTools.join(','), '--yes']);
  for (const role of roles) {
    for (const tool of allTools) {
      await fs.access(path.join(project, AGENT_TOOLS[tool], agentFilename(tool, role.name)));
      await fs.access(path.join(toolHome, GLOBAL_AGENT_TOOLS[tool], agentFilename(tool, role.name)));
    }
  }
  for (const selected of roles) {
    await exec(process.execPath, [cli, 'sync', '--home', home, '--project', project, '--skills', selected.skill, '--yes']);
    for (const role of roles) {
      for (const tool of allTools) {
        const file = path.join(project, AGENT_TOOLS[tool], agentFilename(tool, role.name));
        if (role === selected) await fs.access(file);
        else await assert.rejects(fs.lstat(file), { code: 'ENOENT' });
      }
    }
    assert.equal((await doctor(home, project)).healthy, true);
  }
});

for (const { name, skill } of roles) {
  const chosen = (tools = Object.keys(AGENT_TOOLS), skills = [skill]) => ({ version: 1, tools, skills });
  async function fixture(t) {
    const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'my-agent-')));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    const project = path.join(root, 'project with 空格'), home = path.join(root, 'personal'), toolHome = path.join(root, 'tools');
    await fs.mkdir(project); await fs.mkdir(toolHome);
    return { root, project, home, toolHome };
  }
  async function absent(filename) { await assert.rejects(fs.lstat(filename), { code: 'ENOENT' }); }
  function body(text, tool) {
    if (tool !== 'codex') return text.split('\n---\n')[1];
    // The renderer uses only TOML basic strings; parse their values independently.
    const fields = Object.fromEntries(text.trim().split('\n').map(line => {
      const [key, value] = line.split(/ = (.*)/s); return [key, JSON.parse(value)];
    }));
    assert.deepEqual(Object.keys(fields).sort(), ['description', 'developer_instructions', 'name']);
    assert.equal(fields.name, name);
    return fields.developer_instructions;
  }
  async function checkInstalled(root, tool, global = false) {
    const file = path.join(root, (global ? GLOBAL_AGENT_TOOLS : AGENT_TOOLS)[tool], agentFilename(tool, name));
    const text = await fs.readFile(file, 'utf8');
    const prompt = body(text, tool);
    assert.ok(prompt.trim().length > 0);
    assert.ok(!text.includes('{{SKILL:'));
    const link = [...prompt.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)].find(match => match[1] === skill)?.[2];
    assert.ok(link, file);
    const dependency = path.resolve(path.dirname(file), decodeURIComponent(link));
    assert.equal(await fs.realpath(dependency), await fs.realpath(path.join(root, '.agents/assets/skills', skill, 'SKILL.md')));
    assert.equal(await fs.readFile(dependency, 'utf8'), await fs.readFile(new URL(`../assets/skills/${skill}/SKILL.md`, import.meta.url), 'utf8'));
    if (tool === 'claudecode') assert.ok(text.includes(`skills: ["${skill}"]`));
    if (tool === 'copilot') assert.ok(text.includes('include-custom-instructions: true'));
    assert.ok(!/^model[: =]|^sandbox_mode|^permissionMode/m.test(text));
    return text;
  }

  test(name + ': roles render to four native formats with working Skill references and survive project relocation', async t => {
    const { root, project, home } = await fixture(t);
    const preview = await plan(home, project, chosen());
    assert.deepEqual(preview.agents, [name]);
    await absent(home); await absent(path.join(project, '.codex'));
    await apply(home, project, chosen(), preview.revision);
    for (const tool of Object.keys(AGENT_TOOLS)) await checkInstalled(project, tool);
    assert.equal((await doctor(home, project)).healthy, true);
    const repeated = await apply(home, project);
    assert.equal(repeated.summary.create || 0, 0); assert.equal(repeated.summary.update || 0, 0);
    const relocated = path.join(root, 'relocated 项目'); await fs.rename(project, relocated);
    for (const tool of Object.keys(AGENT_TOOLS)) await checkInstalled(relocated, tool);
  });

  test(name + ': roles follow selected Skills and tools, remove only owned outputs and preserve unrelated agents', async t => {
    const { project, home } = await fixture(t);
    await apply(home, project, chosen(['cursor'], ['my-create-feature']));
    await absent(path.join(project, '.cursor/agents'));
    await apply(home, project, chosen());
    await fs.writeFile(path.join(project, '.cursor/agents/user-reviewer.md'), '# user role');
    await apply(home, project, chosen(['codex']));
    await checkInstalled(project, 'codex');
    await absent(path.join(project, `.cursor/agents/${name}.md`));
    assert.equal(await fs.readFile(path.join(project, '.cursor/agents/user-reviewer.md'), 'utf8'), '# user role');
    await apply(home, project, chosen(['codex'], ['my-create-feature']));
    await absent(path.join(project, `.codex/agents/${name}.toml`));
    await absent(path.join(project, `.agents/agents/${name}.md`));
  });

  test(name + ': unknown or modified native Agent files block the whole installation', async t => {
    const { project, home } = await fixture(t);
    const target = path.join(project, `.codex/agents/${name}.toml`);
    await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, '# User-defined role');
    await assert.rejects(apply(home, project, chosen()), /Conflicting files/);
    await absent(path.join(project, '.my-ai-infra.json'));
    assert.equal(await fs.readFile(target, 'utf8'), '# User-defined role');
    await fs.unlink(target); await apply(home, project, chosen());
    await fs.appendFile(target, '# Project customization\n');
    assert.equal((await doctor(home, project)).healthy, false);
    await assert.rejects(apply(home, project, chosen(['cursor'])), /Conflicting files/);
    assert.ok((await fs.readFile(target, 'utf8')).includes('Project customization'));
  });

  test(name + ': personal role edits invalidate previews and sync to every native format', async t => {
    const { project, home } = await fixture(t);
    await apply(home, project, chosen());
    const preview = await plan(home, project);
    await fs.appendFile(path.join(home, `assets/agents/${name}.md`), '\n额外关注恢复时间目标。\n');
    await assert.rejects(apply(home, project, undefined, preview.revision), /changed since preview/);
    await apply(home, project);
    for (const tool of Object.keys(AGENT_TOOLS)) assert.ok((await checkInstalled(project, tool)).includes('额外关注恢复时间目标'));
  });

  test(name + ': setup installs global roles and dependencies, preserves edits and keeps relocated runtime functional', async t => {
    const { home, toolHome } = await fixture(t);
    const result = await setup(home, Object.keys(AGENT_TOOLS), toolHome, [skill]);
    assert.deepEqual(result.agents, [name]);
    for (const tool of Object.keys(AGENT_TOOLS)) await checkInstalled(toolHome, tool, true);
    await setup(home, Object.keys(AGENT_TOOLS), toolHome, [skill]);
    const listing = await exec(process.execPath, [path.join(home, 'runtime/bin/my-ai-infra.mjs'), 'agents', '--home', home]);
    assert.deepEqual(JSON.parse(listing.stdout).map(agent => agent.name), roles.map(role => role.name));
    const target = path.join(toolHome, `.claude/agents/${name}.md`);
    await fs.appendFile(target, '\nPersonal native edit\n');
    await fs.appendFile(path.join(home, `assets/agents/${name}.md`), '\nUpdated role source\n');
    const codexBefore = await fs.readFile(path.join(toolHome, `.codex/agents/${name}.toml`));
    await assert.rejects(setup(home, Object.keys(AGENT_TOOLS), toolHome, [skill]), /Global Agent conflict/);
    assert.deepEqual(await fs.readFile(path.join(toolHome, `.codex/agents/${name}.toml`)), codexBefore);
    assert.ok((await fs.readFile(target, 'utf8')).includes('Personal native edit'));
  });

  test(name + ': setup selection excludes roles without their dependency and upgrade preserves personal role edits', async t => {
    const { home, toolHome } = await fixture(t);
    const result = await setup(home, ['codex'], toolHome, ['my-create-feature']);
    assert.deepEqual(result.agents, []);
    await absent(path.join(toolHome, '.codex/agents'));
    const file = path.join(home, `assets/agents/${name}.md`), original = await fs.readFile(file, 'utf8');
    await fs.appendFile(file, '\nUser change\n');
    const report = await seed(home, { updateBuiltins: true });
    assert.ok(report.preserved.includes(`agents/${name}.md`));
    assert.ok((await fs.readFile(file, 'utf8')).includes('User change'));
    const baselineFile = path.join(home, 'bundle-state.json'), baseline = JSON.parse(await fs.readFile(baselineFile, 'utf8'));
    baseline.files[`assets/agents/${name}.md`] = hash(await fs.readFile(file));
    await fs.writeFile(baselineFile, JSON.stringify(baseline));
    const upgraded = await seed(home, { updateBuiltins: true });
    assert.ok(upgraded.updated.includes(`agents/${name}.md`));
    assert.equal(await fs.readFile(file, 'utf8'), original);
  });

  test(name + ': Agent metadata rejects missing dependencies, traversal and unregistered placeholders', async t => {
    const { project, home, root } = await fixture(t);
    const role = (await agentCatalog(home)).find(agent => agent.name === name);
    for (const text of [role.content.replace(name, '../escape'), role.content.replace(JSON.stringify([skill]), '[]'), role.content.replace(`{{SKILL:${skill}}}`, '{{SKILL:missing}}')]) assert.throws(() => parseAgent(text, name));
    assert.throws(() => renderAgent(role, 'unknown', () => ''), /Unsupported/);
    await fs.mkdir(path.join(project, '.codex'));
    await fs.symlink(root, path.join(project, '.codex/agents'));
    const preview = await plan(home, project, chosen(['codex']));
    assert.ok(preview.actions.some(action => action.path === '.codex/agents' && action.action === 'conflict'));
    await assert.rejects(apply(home, project, chosen(['codex'])), /Symlink/);
    await absent(path.join(root, `${name}.toml`));
  });

}
