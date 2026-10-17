import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { apply, doctor, plan } from '../src/project.mjs';
import { PACKAGE, catalog, defaultConfig, setup } from '../src/store.mjs';
import { hash, json, readJSON, write } from '../src/fs.mjs';
const exec = promisify(execFile);
const chosen = { version: 1, tools: ['codex','claudecode','cursor','copilot'], skills: ['my-create-feature','my-review-design'] };
const aliases = ['AGENTS.md','CLAUDE.md','.github/copilot-instructions.md'];
async function fixture(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'single-source-')));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const project = path.join(root,'project with spaces'), home = path.join(root,'personal');
  await fs.mkdir(project); return { root, project, home };
}
async function legacy(t) {
  const f = await fixture(t); await apply(f.home, f.project, chosen);
  const state = await readJSON(f.project,'.my-ai-infra/state.json');
  for (const [relative, entry] of Object.entries(state.files)) {
    if (entry.kind !== 'symlink') continue;
    const file = path.join(f.project,relative), text = await fs.readFile(file,'utf8');
    await fs.unlink(file); await fs.writeFile(file,text);
    if (aliases.includes(relative)) { delete state.files[relative]; continue; }
    const block = aliases.includes(relative) ? text.match(/<!-- my-ai-infra:start -->[\s\S]*<!-- my-ai-infra:end -->/)[0] : text;
    state.files[relative] = { kind: aliases.includes(relative) ? 'block' : 'file', hash: hash(block) };
  }
  await fs.rm(path.join(f.project,'.agents/rules'),{recursive:true});
  const core = (await fs.readFile(new URL('./fixtures/legacy-instructions-0.0.2.md',import.meta.url),'utf8')).trim();
  const rules = `<!-- my-ai-infra:start -->\n${core}\n\n可用 Skill：my-create-feature, my-review-design。\n<!-- my-ai-infra:end -->`;
  for(const file of aliases) { await write(f.project,file,rules+'\n');state.files[file]={kind:'block',hash:hash(rules)}; }
  state.version = 1; await write(f.project,'.my-ai-infra/state.json',json(state)); return f;
}
test('all adapters use relative file links to .agents and follow canonical edits after moving the project', async t => {
  const { root, project, home } = await fixture(t);
  await write(project,'.cursor/rules/user.mdc','User cursor rule');
  await apply(home,project,chosen);
  assert.equal((await doctor(home,project)).healthy,true);
  const source = '.agents/skills/my-create-feature/SKILL.md';
  for (const prefix of ['.claude','.cursor','.github']) {
    const alias = path.join(project,prefix,'skills/my-create-feature/SKILL.md');
    assert.ok((await fs.lstat(alias)).isSymbolicLink());
    assert.ok(!path.isAbsolute(await fs.readlink(alias)));
    assert.equal(await fs.realpath(alias),path.join(project,source));
  }
  for (const alias of aliases) assert.ok((await fs.lstat(path.join(project,alias))).isSymbolicLink());
  const moved = path.join(root,'moved project'); await fs.rename(project,moved);
  const body = (await fs.readFile(path.join(moved,source),'utf8'))+'\nLocal canonical edit.\n';
  await fs.writeFile(path.join(moved,source),body);
  for (const prefix of ['.claude','.cursor','.github']) assert.equal(await fs.readFile(path.join(moved,prefix,'skills/my-create-feature/SKILL.md'),'utf8'),body);
  assert.equal(await fs.readFile(path.join(moved,'.cursor/rules/user.mdc'),'utf8'),'User cursor rule');
});
test('legacy copies migrate with backups, retain human rules and become one canonical source', async t => {
  const { project, home } = await legacy(t);
  for (const file of aliases) await fs.appendFile(path.join(project,file),'\nShared user rule.\n');
  const original = await fs.readFile(path.join(project,'CLAUDE.md'),'utf8');
  await apply(home,project);
  assert.ok((await fs.lstat(path.join(project,'CLAUDE.md'))).isSymbolicLink());
  assert.match(await fs.readFile(path.join(project,'CLAUDE.md'),'utf8'),/Shared user rule/);
  assert.doesNotMatch(await fs.readFile(path.join(project,'CLAUDE.md'),'utf8'),/my-ai-infra:/);
  const backups = await fs.readdir(path.join(home,'projects',hash(project),'backups'));
  let recovered = false;
  for (const stamp of backups) {
    const candidate = path.join(home,'projects',hash(project),'backups',stamp,'CLAUDE.md');
    try { if (await fs.readFile(candidate,'utf8') === original) recovered = true; } catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  assert.ok(recovered); assert.equal((await doctor(home,project)).healthy,true);
});
test('edited legacy Skill copies stop migration without changing files', async t => {
  for (const relative of ['.claude/skills/my-create-feature/SKILL.md']) {
    const { project, home } = await legacy(t);
    await fs.appendFile(path.join(project,relative),'\nPrivate adapter edit.\n');
    const before = await fs.readFile(path.join(project,relative),'utf8');
    const state = await fs.readFile(path.join(project,'.my-ai-infra/state.json'),'utf8');
    await assert.rejects(apply(home,project),/Conflicting files/);
    assert.equal(await fs.readFile(path.join(project,relative),'utf8'),before);
    assert.equal(await fs.readFile(path.join(project,'.my-ai-infra/state.json'),'utf8'),state);
    assert.ok((await fs.lstat(path.join(project,'CLAUDE.md'))).isFile());
  }
});
test('retargeted aliases and forged link state never follow or overwrite outside content', async t => {
  const { root, project, home } = await fixture(t); await apply(home,project,chosen);
  const outside = path.join(root,'outside.txt'); await fs.writeFile(outside,'keep outside');
  const alias = path.join(project,'.claude/skills/my-create-feature/SKILL.md');
  await fs.unlink(alias); await fs.symlink(outside,alias);
  assert.ok((await plan(home,project)).actions.some(a => a.path === '.claude/skills/my-create-feature/SKILL.md' && a.action === 'conflict'));
  await assert.rejects(apply(home,project),/Conflicting files/);
  const state = await readJSON(project,'.my-ai-infra/state.json');
  state.files['.claude/skills/my-create-feature/SKILL.md'] = { kind:'symlink', target:outside, hash:hash(outside) };
  await write(project,'.my-ai-infra/state.json',json(state));
  await assert.rejects(apply(home,project),/Invalid managed link/);
  assert.equal(await fs.readFile(outside,'utf8'),'keep outside');
});
test('failed link migration restores original copies, config and state', async t => {
  const { project, home } = await legacy(t);
  const before = await fs.readFile(path.join(project,'.my-ai-infra/state.json'),'utf8');
  const claude = await fs.readFile(path.join(project,'CLAUDE.md'),'utf8');
  const rename = fs.rename; let failed = false;
  fs.rename = async (from,to) => { if (!failed && to === path.join(project,'.github/copilot-instructions.md')) { failed = true; throw Error('link failure'); } return rename(from,to); };
  try { await assert.rejects(apply(home,project),/link failure/); } finally { fs.rename = rename; }
  assert.equal(await fs.readFile(path.join(project,'.my-ai-infra/state.json'),'utf8'),before);
  assert.ok((await fs.lstat(path.join(project,'CLAUDE.md'))).isFile());
  assert.equal(await fs.readFile(path.join(project,'CLAUDE.md'),'utf8'),claude);
  await assert.rejects(fs.lstat(path.join(project,'.agents/AGENTS.md')),{code:'ENOENT'});
  for (const file of ['AGENTS.md','CLAUDE.md','copilot-instructions.md']) await assert.rejects(fs.lstat(path.join(project,'.agents/rules',file)),{code:'ENOENT'});
});
test('CLI initialization respects explicit defaults without a Skill prompt; sync preserves project selection', async t => {
  const { project, home } = await fixture(t);
  assert.equal(defaultConfig().skills.length,10);
  await write(home,'defaults.json',json({version:1,tools:['copilot'],skills:['my-create-feature']}));
  const cli=path.join(PACKAGE,'bin/my-ai-infra.mjs');
  const result=await exec(process.execPath,[cli,'init','--home',home,'--project',project,'--yes']);
  assert.doesNotMatch(result.stdout,/选择 Skill/);
  assert.equal(JSON.parse(result.stdout).nextSteps[0].tool,'copilot');
  assert.match(result.stderr,/copilot init/);
  assert.deepEqual((await readJSON(project,'.my-ai-infra.json')).skills,['my-create-feature']);
  await apply(home,project,{version:1,tools:['copilot'],skills:['my-create-feature']});
  await exec(process.execPath,[cli,'sync','--home',home,'--project',project]);
  assert.deepEqual((await readJSON(project,'.my-ai-infra.json')).skills,['my-create-feature']);
});
test('global setup keeps a canonical entry even without Codex and links selected adapters to it', async t => {
  const { root, home } = await fixture(t);const tools=path.join(root,'tools');await fs.mkdir(tools);
  await setup(home,['claudecode','cursor','copilot'],tools);
  const source=path.join(tools,'.agents/skills/my-ai-infra/SKILL.md');
  for(const prefix of ['.claude','.cursor','.copilot']) assert.equal(await fs.realpath(path.join(tools,prefix,'skills/my-ai-infra/SKILL.md')),source);
  assert.ok((await fs.lstat(source)).isFile());
  await setup(home,['claudecode','cursor','copilot'],tools);
});
