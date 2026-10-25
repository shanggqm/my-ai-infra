import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { apply, plan, doctor } from '../src/project.mjs';
import { setup, PACKAGE } from '../src/store.mjs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
const cli = path.join(PACKAGE,'bin/my-ai-infra.mjs');
import { hash, json, readJSON, write } from '../src/fs.mjs';
import { BUILTINS } from '../src/names.mjs';

const chosen = {version:1,tools:['codex','claudecode','cursor','copilot'],skills:['my-review-code']};
const source = '.agents/skills/my-review-code/SKILL.md';
const oldPath = relative => relative.replace('.agents/','.agents/assets/');
async function fixture(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'mai-flat-')));
  t.after(() => fs.rm(root,{recursive:true,force:true}));
  const home = path.join(root,'home'), project = path.join(root,'project');
  await fs.mkdir(project);
  await write(home,'assets/hooks/check/asset.json',json({name:'check',description:'Hook fixture',entry:'run.sh',targets:{claudecode:'.claude/hooks/check.sh'}}));
  await write(home,'assets/hooks/check/run.sh','echo check\n');
  return {root,home,project};
}
// Reconstruct the released nested layout, including native file aliases and state hashes.
async function nest(root, records) {
  const next = {};
  const entries = Object.entries(records);
  for (const [relative, record] of entries) {
    const file = path.join(root,relative);
    if (relative.startsWith('.agents/') && record.kind === 'file') {
      const text = await fs.readFile(file,'utf8');
      await fs.unlink(file); await write(root,oldPath(relative),text);
      next[oldPath(relative)] = record;
      if (relative.startsWith('.agents/skills/')) {
        const target = path.posix.relative(path.posix.dirname(relative),oldPath(relative));
        await fs.symlink(target,file); next[relative] = {kind:'symlink',target,hash:hash(target)};
      }
    } else if (record.kind === 'symlink') {
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(relative),record.target));
      const target = path.posix.relative(path.posix.dirname(relative),oldPath(resolved));
      await fs.unlink(file); await fs.symlink(target,file);
      next[relative] = {kind:'symlink',target,hash:hash(target)};
    } else next[relative] = record;
  }
  // Rule sources are user-owned and intentionally absent from installation records.
  for (const name of ['AGENTS.md','copilot-instructions.md']) {
    const relative = `.agents/rules/${name}`;
    try { const text = await fs.readFile(path.join(root,relative),'utf8'); await fs.unlink(path.join(root,relative)); await write(root,oldPath(relative),text); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return next;
}
async function legacy(t) {
  const f = await fixture(t); await apply(f.home,f.project,chosen);
  const state = await readJSON(f.project,'.my-ai-infra/state.json');
  state.files = await nest(f.project,state.files);
  await write(f.project,'.my-ai-infra/state.json',json(state));
  return f;
}
test('fresh init keeps every asset type directly under .agents and creates no assets layer',async t => {
  const {home,project} = await fixture(t); await apply(home,project,chosen);
  for (const type of ['skills','agents','hooks','rules']) assert.ok((await fs.stat(path.join(project,'.agents',type))).isDirectory());
  assert.ok((await fs.lstat(path.join(project,source))).isFile());
  await assert.rejects(fs.lstat(path.join(project,'.agents/assets')),{code:'ENOENT'});
  assert.equal((await doctor(home,project)).healthy,true);
});
test('nested layout migrates read-only preview, customized sources, rules, backups and stable relative links',async t => {
  const {root,home,project} = await legacy(t);
  const customized = [source,'.agents/agents/code-review.md','.agents/hooks/check/run.sh'];
  for (const file of customized) await fs.appendFile(path.join(project,oldPath(file)),'\nLocal customization\n');
  await write(project,'.agents/assets/rules/AGENTS.md','# Local rules\n');
  const before = await fs.readFile(path.join(project,'.my-ai-infra/state.json'),'utf8');
  const preview = await plan(home,project,undefined,{conflict:'merge'});
  assert.equal(await fs.readFile(path.join(project,'.my-ai-infra/state.json'),'utf8'),before);
  assert.ok((await fs.lstat(path.join(project,source))).isSymbolicLink());
  const result = await apply(home,project,undefined,preview.revision,{conflict:'merge'});
  assert.equal(result.complete,true);
  for (const file of customized) {
    assert.match(await fs.readFile(path.join(project,file),'utf8'),/Local customization/);
    assert.match(await fs.readFile(path.join(result.recovery,'before',oldPath(file)),'utf8'),/Local customization/);
  }
  assert.match(await fs.readFile(path.join(project,'.codex/agents/code-review.toml'),'utf8'),/Local customization/);
  assert.equal(await fs.readFile(path.join(project,'CLAUDE.md'),'utf8'),'# Local rules\n');
  await assert.rejects(fs.lstat(path.join(project,'.agents/assets')),{code:'ENOENT'});
  assert.equal((await doctor(home,project)).healthy,true);
  assert.equal((await apply(home,project)).recovery,null);
  const moved = path.join(root,'moved'); await fs.rename(project,moved);
  assert.equal(await fs.realpath(path.join(moved,'.claude/skills/my-review-code/SKILL.md')),path.join(moved,source));
});
test('migration preserves untracked files and aborts conflicting destination copies without writes',async t => {
  const {home,project} = await legacy(t);
  await write(project,'.agents/assets/private/notes.txt','User file');
  await fs.mkdir(path.join(project,'.agents/assets/user-empty'));
  await fs.unlink(path.join(project,source)); await write(project,source,'Destination edit');
  const before = await fs.readFile(path.join(project,'.my-ai-infra/state.json'),'utf8');
  await assert.rejects(apply(home,project),/Conflicting files/);
  assert.equal(await fs.readFile(path.join(project,'.my-ai-infra/state.json'),'utf8'),before);
  const result = await apply(home,project,undefined,undefined,{conflict:'merge'});
  assert.equal(await fs.readFile(path.join(project,source),'utf8'),'Destination edit');
  assert.equal(await fs.readFile(path.join(project,'.agents/assets/private/notes.txt'),'utf8'),'User file');
  await fs.access(path.join(result.recovery,'before',oldPath(source)));
  assert.ok((await fs.stat(path.join(project,'.agents/assets/user-empty'))).isDirectory());
  assert.equal((await doctor(home,project)).healthy,true);
});
test('failed migration restores legacy links, content and installation record',async t => {
  const {home,project} = await legacy(t);
  const before = await fs.readFile(path.join(project,'.my-ai-infra/state.json'),'utf8');
  const rename = fs.rename; let failed = false;
  fs.rename = async (from,to) => {
    if (!failed && to === path.join(project,'CLAUDE.md')) { failed = true; throw Error('migration failure'); }
    return rename(from,to);
  };
  try { await assert.rejects(apply(home,project),/migration failure/); }
  finally { fs.rename = rename; }
  assert.equal(await fs.readFile(path.join(project,'.my-ai-infra/state.json'),'utf8'),before);
  assert.ok((await fs.lstat(path.join(project,source))).isSymbolicLink());
  assert.equal(await fs.realpath(path.join(project,source)),path.join(project,oldPath(source)));
});
test('global setup migrates nested sources with backups and stays idempotent',async t => {
  const {home,project} = await fixture(t); await setup(home,chosen.tools,project,chosen.skills);
  const previous = await readJSON(home,'global-state.json'), records = {};
  for (const [relative,digest] of Object.entries(previous)) {
    const info = await fs.lstat(path.join(project,relative));
    records[relative] = info.isSymbolicLink() ? {kind:'symlink',target:await fs.readlink(path.join(project,relative)),hash:digest} : {kind:'file',hash:digest};
  }
  const nested = await nest(project,records);
  await write(home,'global-state.json',json(Object.fromEntries(Object.entries(nested).map(([file,entry]) => [file,entry.hash]))));
  await setup(home,['codex'],project,chosen.skills);
  assert.equal(await fs.realpath(path.join(project,'.claude/skills/my-review-code/SKILL.md')),path.join(project,source));
  assert.ok((await fs.lstat(path.join(project,'.agents/skills/my-ai-infra/SKILL.md'))).isFile());
  await assert.rejects(fs.lstat(path.join(project,'.agents/assets')),{code:'ENOENT'});
  await setup(home,chosen.tools,project,chosen.skills);
});
test('blocked migration keeps legacy sources, dependent Agent links and records for a later retry',async t => {
  const {root,home,project} = await legacy(t);
  const outside = path.join(root,'outside'); await fs.mkdir(outside);
  await fs.rm(path.join(project,'.agents/skills'),{recursive:true});
  await fs.symlink(outside,path.join(project,'.agents/skills'));
  const result = await apply(home,project,undefined,undefined,{conflict:'merge'});
  assert.equal(result.complete,false);
  assert.equal(await fs.readlink(path.join(project,'.agents/skills')),outside);
  assert.deepEqual(await fs.readdir(outside),[]);
  assert.match(await fs.readFile(path.join(project,'.codex/agents/code-review.toml'),'utf8'),/code-review/);
  const state = await readJSON(project,'.my-ai-infra/state.json');
  assert.ok(state.files[oldPath(source)]);
  await fs.unlink(path.join(project,'.agents/skills'));
  await apply(home,project,undefined,undefined,{conflict:'merge'});
  assert.equal((await doctor(home,project)).healthy,true);
  await assert.rejects(fs.lstat(path.join(project,'.agents/assets')),{code:'ENOENT'});
});

for (const explicit of [false,true]) test(`CLI init discovers all entry files in a target with spaces and Unicode (explicit project: ${explicit})`,async t => {
  const {root,home,project:caller} = await fixture(t);
  const project = path.join(root,'目标 project'); await fs.mkdir(project);
  const cwd = explicit ? caller : project, args = ['--home',home,...(explicit ? ['--project',project] : [])];
  await exec(process.execPath,[cli,'init',...args,'--tools','codex,cursor','--yes'],{cwd});
  const config = await readJSON(project,'.my-ai-infra.json');
  assert.deepEqual(new Set(config.skills),new Set(BUILTINS.map(skill => skill.name)));
  assert.ok(config.skills.includes('my-analyze-debt'));
  for (const name of config.skills) {
    const directory = path.join(project,'.agents/skills',name);
    assert.ok((await fs.lstat(directory)).isDirectory());
    // readdir/lstat must see a real manifest; readFile alone also accepts invisible file links.
    assert.ok((await fs.readdir(directory,{withFileTypes:true})).some(entry => entry.name === 'SKILL.md' && entry.isFile()),name);
    assert.equal(await fs.realpath(path.join(project,'.cursor/skills',name,'SKILL.md')),path.join(directory,'SKILL.md'));
  }
  const repeated = JSON.parse((await exec(process.execPath,[cli,'init',...args,'--yes'],{cwd})).stdout);
  assert.equal(repeated.recovery,null);
  await exec(process.execPath,[cli,'sync',...args],{cwd});
  assert.equal(JSON.parse((await exec(process.execPath,[cli,'doctor',...args],{cwd})).stdout).healthy,true);
  await assert.rejects(fs.lstat(path.join(project,'.agents/assets')),{code:'ENOENT'});
  if (explicit) await assert.rejects(fs.lstat(path.join(caller,'.my-ai-infra.json')),{code:'ENOENT'});
});
test('doctor rejects a file-linked Skill entry; sync restores discoverability without changing the link target',async t => {
  const {root,home,project} = await fixture(t); await apply(home,project,chosen);
  const file = path.join(project,source), text = await fs.readFile(file,'utf8');
  const outside = path.join(root,'external-skill.md'); await fs.writeFile(outside,text);
  await fs.unlink(file); await fs.symlink(outside,file);
  const result = await doctor(home,project);
  assert.equal(result.healthy,false);
  assert.ok(result.issues.some(issue => issue.path === source));
  assert.ok((await fs.lstat(file)).isSymbolicLink());
  await apply(home,project,undefined,undefined,{conflict:'merge'});
  assert.ok((await fs.lstat(file)).isFile());
  assert.equal(await fs.readFile(outside,'utf8'),text);
  assert.equal((await doctor(home,project)).healthy,true);
});
