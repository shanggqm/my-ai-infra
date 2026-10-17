import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { checkSkillResources } from './check-skill-resources.mjs';
import { checkCodexDiscovery } from './check-codex-discovery.mjs';
import { checkClaudeDiscovery } from './check-claude-discovery.mjs';
import { parseAgent, AGENT_TOOLS, agentFilename } from '../src/agents.mjs';
import { RULES, ruleTarget } from '../src/rules.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const exec = promisify(execFile);
const npm = process.env.npm_execpath;
if (!npm) throw Error('请使用 npm run release:check 执行发布检查。');
const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
const output = path.join(root, 'dist'); await fs.mkdir(output, { recursive: true });
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'my-ai-infra-release-'));
const checks = [], pass = message => { checks.push(message); console.log(`OK: ${message}`); };
const ensure = (condition, message) => { if (!condition) throw Error(message); };
const run = (file, args, options = {}) => exec(file, args, { cwd: temp, timeout: 60000, maxBuffer: 8 * 1024 * 1024, ...options });
const npmRun = args => run(process.execPath, [npm, ...args]);
let server;
async function startServer(cli, args, options = {}) {
  const child = spawn(cli, args, { cwd: temp, stdio: ['ignore','pipe','pipe'], ...options });
  server = child;
  return new Promise((resolve, reject) => {
    let output = '', errors = '';
    const timer = setTimeout(() => reject(Error('Packaged Web startup timed out')), 15000);
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/http:\/\/127\.0\.0\.1:\d+\/#([a-f0-9]+)/);
      if (match) { clearTimeout(timer); resolve({ origin: match[0].split('/#')[0], token: match[1] }); }
    });
    child.stderr.on('data', chunk => { errors += chunk; });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); reject(Error(`Packaged Web exited ${code}: ${errors}`)); });
  });
}
async function links(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    // Templates contain links to artifacts created later in the target project.
    if (entry.name === 'skills' || entry.name === 'templates' || entry.name === 'node_modules') continue;
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) { await links(filename); continue; }
    if (!filename.endsWith('.md')) continue;
    const text = (await fs.readFile(filename, 'utf8')).replace(/```[\s\S]*?```/g, '');
    if (directory === path.join(installedRoot, 'assets/agents') && entry.name !== 'README.md') {
      const agent = parseAgent(text, entry.name.slice(0, -3));
      for (const skill of agent.skills) await fs.access(path.join(installedRoot, 'assets/skills', skill, 'SKILL.md'));
      continue;
    }
    for (const [, target] of text.matchAll(/\]\(([^)]+)\)/g)) {
      if (target.includes('://') || target.startsWith('#')) continue;
      const file = path.resolve(path.dirname(filename), decodeURIComponent(target.split('#')[0]));
      ensure(file.startsWith(installedRoot + path.sep), `Documentation escapes package: ${target}`);
      await fs.access(file);
    }
  }
}
let installedRoot;
try {
  const packed = await run(process.execPath, [npm, 'pack', '--json', '--pack-destination', output], { cwd: root });
  const info = JSON.parse(packed.stdout.slice(packed.stdout.lastIndexOf('\n[') + 1))[0];
  const artifact = path.join(output, info.filename), bytes = await fs.readFile(artifact);
  const names = info.files.map(file => file.path);
  ensure(!names.some(file => file.startsWith('assets/skills/my-verify-feature/')), 'Retired verification Skill was packaged');
  for (const file of names) {
    ensure(!path.posix.isAbsolute(file) && !file.split('/').includes('..'), `Invalid packed path: ${file}`);
    ensure(!/^(?:test|scripts|dist|node_modules)\//.test(file), `Unexpected development file: ${file}`);
    ensure(!/(?:^|\/)(?:\.git|\.npmrc|\.DS_Store|\.env(?:\.[^/]*)?)(?:\/|$)/.test(file), `Unexpected local/private file: ${file}`);
  }
  for (const file of ['LICENSE','bin/my-ai-infra.mjs','CHANGELOG.md','THIRD_PARTY_NOTICES.md','web/assets/logo.png','design-system/bxy-design-tokens.css','design-system/assets/icons/material-symbols-rounded.woff2','design-system/assets/icons/APACHE-2.0.txt']) ensure(names.includes(file), `Missing packed resource: ${file}`);
  ensure(info.files.find(file => file.path === 'design-system/assets/icons/material-symbols-rounded.woff2').size < 100 * 1024, 'Icon font unexpectedly contains the full library');
  const integrity = 'sha512-' + createHash('sha512').update(bytes).digest('base64');
  ensure(integrity === info.integrity, 'Tarball integrity does not match npm pack');
  ensure((info.files.find(file => file.path === 'bin/my-ai-infra.mjs').mode & 0o111) !== 0, 'Packed CLI is not executable');
  pass('Distribution whitelist, resources, executable entry and tarball integrity');

  const home = path.join(temp, 'personal assets'), project = path.join(temp, 'project with spaces'); await fs.mkdir(project);
  const prefix = ['exec','--yes','--offline','--cache',path.join(temp,'npm-cache'),'--package='+artifact,'--','my-ai-infra'];
  ensure((await npmRun([...prefix,'--version','--home',home])).stdout.trim() === pkg.version, 'npx version mismatch');
  await fs.access(home).then(() => { throw Error('Version command unexpectedly created a personal store'); }, e => { if (e.code !== 'ENOENT') throw e; });
  const assets = JSON.parse((await npmRun([...prefix,'catalog','--home',home])).stdout);
  ensure(!assets.some(asset => asset.name === 'my-verify-feature'), 'Retired verification Skill is selectable');
  installedRoot = path.dirname(path.dirname(assets[0].sourceRoot));
  const cli = path.join(installedRoot,'bin/my-ai-infra.mjs');
  ensure((await run(process.execPath,[cli,'--help'])).stdout.includes('upgrade'), 'Packaged help is stale');
  await links(installedRoot);
  const missing = await checkSkillResources(installedRoot, assets.map(a => a.name)); ensure(!missing.length, missing.join('\n'));
  pass('Offline npx bin, read-only version/catalog, packaged documentation and Skill resources');

  const globalPrefix = path.join(temp, 'global install');
  await npmRun(['install','--global','--prefix',globalPrefix,'--offline','--no-audit','--no-fund',artifact]);
  const binDirectory = process.platform === 'win32' ? globalPrefix : path.join(globalPrefix, 'bin');
  const globalOptions = { cwd: project, env: { ...process.env, PATH: binDirectory + path.delimiter + process.env.PATH, MY_AI_INFRA_HOME: home }, shell: process.platform === 'win32' };
  for (const command of ['mai', 'my-ai-infra']) ensure((await run(command, ['--version'], globalOptions)).stdout.trim() === pkg.version, `Global ${command} version mismatch`);
  await run('mai', ['init','--tools','codex,claudecode,cursor,copilot','--yes'], globalOptions);
  ensure(JSON.parse((await run('mai', ['doctor'], globalOptions)).stdout).healthy, 'Global mai init did not initialize the current directory');
  pass('Global mai and my-ai-infra commands, current-directory init and doctor');
  const selectedSkills = [...JSON.parse(await fs.readFile(path.join(project,'.my-ai-infra.json'),'utf8')).skills, 'my-auto-design', 'my-auto-feature', 'my-init-repo-memory'];
  for (const name of selectedSkills) {
    const directory = path.join(project,'.agents/skills',name);
    ensure((await fs.readdir(directory,{withFileTypes:true})).some(entry => entry.name === 'SKILL.md' && entry.isFile()), `Skill manifest must be a regular file: ${name}`);
  }
  pass(`All ${selectedSkills.length} selected Skills have discoverable regular SKILL.md files`);
  if (process.env.MAI_CODEX_BIN) {
    await checkCodexDiscovery(process.env.MAI_CODEX_BIN,await fs.realpath(project),selectedSkills);
    pass('Codex app-server skills/list discovers every selected Skill after global mai init');
  }
  if (process.env.MAI_CLAUDE_BIN) {
    await checkClaudeDiscovery(process.env.MAI_CLAUDE_BIN,await fs.realpath(project),selectedSkills,['architecture-review','code-review']);
    pass('Claude SDK initialization discovers all project Skills, Prompts and review roles without duplicate commands');
  }
  await fs.access(path.join(project, 'mai-specs/FEATURE_LAYOUT.json')).then(() => { throw Error('Default layout should stay bundled'); }, error => { if (error.code !== 'ENOENT') throw error; });
  const layout = JSON.parse(await fs.readFile(path.join(project,'.agents/skills/my-create-feature/template/FEATURE_LAYOUT.json'),'utf8'));
  ensure(!layout.artifacts.some(item => item.id === 'acceptance' || item.skill === 'my-verify-feature'), 'New Feature layout still requires standalone acceptance');
  for (const adapter of ['.agents','.claude','.cursor','.github']) {
    const file = path.join(project,adapter,'skills/my-create-feature/scripts/init-feature.mjs');
    await fs.access(file);
    ensure((await fs.lstat(file)).isSymbolicLink() === (adapter !== '.agents'), `Invalid adapter content source: ${adapter}`);
    ensure(await fs.realpath(file) === await fs.realpath(path.join(project,'.agents/skills/my-create-feature/scripts/init-feature.mjs')), `Adapter does not share the canonical source: ${adapter}`);
  }
  await fs.lstat(path.join(project,'.agents/assets')).then(() => { throw Error('Unexpected nested asset directory'); }, error => { if (error.code !== 'ENOENT') throw error; });
  const roleCatalog = JSON.parse((await run(process.execPath, [cli, 'agents', '--home', home])).stdout);
  for (const name of ['architecture-review', 'code-review']) ensure(roleCatalog.some(agent => agent.name === name), `Packaged Agent asset missing: ${name}`);
  for (const role of roleCatalog) {
    for (const [tool, prefix] of Object.entries(AGENT_TOOLS)) {
      const file = path.join(project, prefix, agentFilename(tool, role.name));
      const text = await fs.readFile(file, 'utf8');
      ensure(!text.includes('{{SKILL:'), `Unresolved Agent dependency: ${tool}/${role.name}`);
      const references = [...text.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)];
      for (const skill of role.skills) {
        const reference = references.find(match => match[1] === skill)?.[2];
        ensure(Boolean(reference), `Missing Agent Skill reference: ${tool}/${role.name}/${skill}`);
        const dependency = path.resolve(path.dirname(file), decodeURIComponent(reference));
        ensure(await fs.realpath(dependency) === await fs.realpath(path.join(project, '.agents/skills', skill, 'SKILL.md')), `Agent resolves the wrong Skill: ${tool}/${role.name}/${skill}`);
      }
    }
  }
  pass('Packaged role assets and four native Agent formats resolve their installed Skill');
  for (const rule of RULES) {
    const source = rule.entry === 'CLAUDE.md' ? '.agents/rules/AGENTS.md' : rule.source;
    ensure(await fs.readlink(path.join(project,rule.entry)) === ruleTarget(rule, source), `Runtime rule link missing: ${rule.entry}`);
    ensure(await fs.readFile(path.join(project,source),'utf8') === '', `Runtime rules must start empty: ${source}`);
  }
  ensure(await fs.realpath(path.join(project,'AGENTS.md')) === await fs.realpath(path.join(project,'CLAUDE.md')), 'New runtime rules must share AGENTS.md');
  await fs.lstat(path.join(project,'.agents/AGENTS.md')).then(() => { throw Error('Unexpected generated shared SDD rule'); }, error => { if (error.code !== 'ENOENT') throw error; });
  pass('New AGENTS/CLAUDE share one empty source and relative native entry links');
  const initializer = path.join(project,'.agents/skills/my-create-feature/scripts/init-feature.mjs');
  const feature = JSON.parse((await run(process.execPath,[initializer,'--project',project,'--slug','release-smoke','--title','发布包验证'])).stdout);
  for (const file of ['BRIEF.md','context/_INDEX.md']) await fs.access(path.join(feature.path,file));
  for (const directory of ['design','spec','test','review']) await fs.access(path.join(feature.path,directory)).then(() => { throw Error(`Unexpected premature Feature directory: ${directory}`); }, error => { if (error.code !== 'ENOENT') throw error; });
  await run(process.execPath,[cli,'sync','--home',home,'--project',project]);
  ensure(JSON.parse((await run(process.execPath,[cli,'doctor','--home',home,'--project',project])).stdout).healthy, 'Packaged install drift');
  pass('Four adapters, installed Feature initializer/templates, repeat sync and doctor');
  if (process.env.MAI_CODEX_BIN) {
    await checkCodexDiscovery(process.env.MAI_CODEX_BIN,await fs.realpath(project),selectedSkills);
    pass('Codex Skill discovery remains complete after repeat sync');
  }

  const protectedFile = path.join(project,'.agents/skills/my-create-prd/SKILL.md');
  const original = await fs.readFile(protectedFile,'utf8'), edited = original+'\nProject customization.\n'; await fs.writeFile(protectedFile,edited);
  const beforeConfig = await fs.readFile(path.join(project,'.my-ai-infra.json'),'utf8');
  let refused = false;
  try { await run(process.execPath,[cli,'sync','--home',home,'--project',project,'--tools','cursor','--conflict','abort']); }
  catch (error) { ensure(error.stderr.includes('Conflicting files'), error.stderr); refused = true; }
  ensure(refused && await fs.readFile(protectedFile,'utf8') === edited, 'Modified project asset was overwritten');
  ensure(await fs.readFile(path.join(project,'.my-ai-infra.json'),'utf8') === beforeConfig, 'Conflict changed project config');
  const merged = JSON.parse((await run(process.execPath,[cli,'sync','--home',home,'--project',project])).stdout);
  ensure(merged.conflict === 'merge' && merged.complete && await fs.readFile(protectedFile,'utf8') === edited, 'Default merge did not preserve project customization');
  ensure((await fs.readFile(path.join(merged.recovery,'incoming/.agents/skills/my-create-prd/SKILL.md'),'utf8')) === original, 'Incoming merge candidate missing');
  const replaced = JSON.parse((await run(process.execPath,[cli,'sync','--home',home,'--project',project,'--conflict','replace'])).stdout);
  ensure(await fs.readFile(protectedFile,'utf8') === original, 'Explicit replace did not install incoming asset');
  ensure(await fs.readFile(path.join(replaced.recovery,'before/.agents/skills/my-create-prd/SKILL.md'),'utf8') === edited, 'Replacement backup missing');
  pass('Conflict refusal preserves modified project files and config');

  const web = await startServer('mai',['web','--port','0'],globalOptions);
  for (const [route,type] of [['/','text/html; charset=utf-8'],['/app.js','text/javascript'],['/cog-train.js','text/javascript'],['/style.css','text/css'],['/assets/logo.png','image/png'],['/design-system/bxy-design-tokens.css','text/css'],['/design-system/assets/icons/material-symbols-rounded.woff2','font/woff2']]) {
    const response = await fetch(web.origin+route,{signal:AbortSignal.timeout(5000)});
    ensure(response.status===200 && response.headers.get('content-type')===type, `Packaged Web failed: ${route}`);
    ensure((await response.arrayBuffer()).byteLength>0,`Empty Web resource: ${route}`);
  }
  ensure((await fetch(web.origin+'/api/state')).status===403,'Web API unexpectedly public');
  const state = await fetch(web.origin+'/api/state',{headers:{'X-My-Ai-Token':web.token}});
  ensure(state.status===200,'Authenticated Web state failed');
  ensure((await state.json()).project === await fs.realpath(project), 'Global mai web did not select the current directory');
  pass('Global mai web selects current directory; packaged resources and API authentication');

  ensure(names.includes('assets/skills/my-create-memory/SKILL.md') && names.includes('src/memory.mjs'), 'Packaged personal memory capability missing');
  const memoryInput = path.join(temp, 'memory-entry.md');
  await fs.writeFile(memoryInput, '# 个人偏好记忆\n\n## 最小方案\n\n- ID: pref-smoke\n- Key: architecture.complexity\n- Scenes: design\n- Status: approved\n- Basis: explicit\n- Source: 隔离安装包验证\n- Evidence: 以后在本项目先给最小方案\n- Updated: 2026-10-14\n\n先给最小方案，保留明确的可靠性要求。\n');
  const binding = JSON.parse((await run(process.execPath, [cli, 'memory', 'bind', '--home', home, '--project', project])).stdout);
  await run(process.execPath, [cli, 'memory', 'put', '--home', home, '--project', project, '--file', memoryInput, '--revision', 'missing']);
  await run(process.execPath, [cli, 'sync', '--home', home, '--project', project]);
  const memory = JSON.parse((await run(process.execPath, [cli, 'memory', 'recall', '--home', home, '--project', project, '--scene', 'design'])).stdout);
  ensure(memory.projectId === binding.projectId && memory.entries.length === 1, 'Packaged memory identity or recall failed');
  const memoryResponse = await fetch(web.origin + '/api/memory/read', { method: 'POST', headers: { 'X-My-Ai-Token': web.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ project }) });
  ensure(memoryResponse.ok && (await memoryResponse.json()).entries.length === 1, 'Packaged Web memory read failed');
  ensure(!names.some(file => file.startsWith('projects/') || file === 'memory.md'), 'Private memory leaked into package');
  pass('Packaged Markdown memory, stable identity, repeat sync, scene recall and Web management');

  const personalName = 'team-release-skill', personalSource = path.join(temp, personalName);
  const personalBody = `---\nname: ${personalName}\ndescription: Personal reusable workflow\n---\nKeep across uninstall.\n`;
  await fs.mkdir(path.join(personalSource, 'references'), { recursive: true });
  await fs.writeFile(path.join(personalSource, 'SKILL.md'), personalBody);
  await fs.writeFile(path.join(personalSource, 'references/notes.md'), 'Complete directory import');
  await run('mai', ['asset', 'import', personalSource], globalOptions);
  let listed = JSON.parse((await run('mai', ['catalog'], globalOptions)).stdout);
  ensure(listed.find(item => item.name === personalName)?.origin === 'personal', 'Personal origin missing');
  ensure(listed.find(item => item.name === 'my-review-code')?.origin === 'builtin', 'Builtin origin missing');
  await run('mai', ['upgrade'], globalOptions);
  await npmRun(['uninstall', '--global', '--prefix', globalPrefix, '--offline', pkg.name]);
  ensure(await fs.readFile(path.join(home, 'assets/skills', personalName, 'SKILL.md'), 'utf8') === personalBody, 'Uninstall removed personal data');
  ensure(await fs.readFile(path.join(project, '.agents/skills/my-create-prd/SKILL.md'), 'utf8') === original, 'Uninstall removed project data');
  await npmRun(['install', '--global', '--prefix', globalPrefix, '--offline', '--no-audit', '--no-fund', artifact]);
  listed = JSON.parse((await run('mai', ['catalog'], globalOptions)).stdout);
  ensure(listed.some(item => item.name === personalName && item.origin === 'personal'), 'Reinstall failed to rediscover personal Skill');
  const nextProject = path.join(temp, 'next-project'); await fs.mkdir(nextProject);
  await run('mai', ['init', '--project', nextProject, '--tools', 'codex', '--yes'], globalOptions);
  ensure(await fs.readFile(path.join(nextProject, '.agents/skills', personalName, 'references/notes.md'), 'utf8') === 'Complete directory import', 'New project omitted personal Skill resources');
  pass('Personal Skill import, upgrade isolation, npm global uninstall/reinstall persistence and new-project reuse');

  const report = { checkedAt:new Date().toISOString(), package:pkg.name, version:pkg.version, node:process.version, platform:process.platform, filename:info.filename, size:info.size, unpackedSize:info.unpackedSize, entryCount:info.entryCount, sha256:createHash('sha256').update(bytes).digest('hex'), integrity, checks, files:names, publication:'not-published', deferred:['owner-provided asset distribution authorization'] };
  await fs.writeFile(path.join(output,'release-report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(`Release artifact verified: ${artifact}\nReport: ${path.join(output,'release-report.json')}`);
} finally {
  if (server && server.exitCode===null && server.signalCode===null) {
    await new Promise(resolve => { server.once('exit',resolve); server.kill('SIGTERM'); const timer=setTimeout(()=>server.kill('SIGKILL'),2000); timer.unref(); });
  }
  await fs.rm(temp,{recursive:true,force:true});
}
