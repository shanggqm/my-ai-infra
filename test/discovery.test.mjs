import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { apply, plan, doctor, publicPlan } from '../src/project.mjs';
import { setup, defaultConfig } from '../src/store.mjs';
import { hash, json, readJSON, write } from '../src/fs.mjs';
import { legacyPromptTargets, promptTargets } from '../src/assets.mjs';

const tools = ['codex','claudecode','cursor','copilot'];
const config = {...defaultConfig(),tools};
const prompts = ['my-auto-design','my-auto-feature','my-init-repo-memory'];
async function fixture(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'mai-discovery-')));
  t.after(() => fs.rm(root,{recursive:true,force:true}));
  const home = path.join(root,'home'), project = path.join(root,'中文 project'), toolHome = path.join(root,'tools');
  await fs.mkdir(project); await fs.mkdir(toolHome);
  return {root,home,project,toolHome};
}
async function oldPrompts(root, state, global = false) {
  for (const name of prompts) {
    for (const relative of [`.agents/skills/${name}/SKILL.md`,`.agents/skills/${name}/agents/openai.yaml`]) {
      await fs.unlink(path.join(root,relative)); delete state[relative];
    }
    for (const [tool,relative] of Object.entries(legacyPromptTargets(name))) {
      if (global && tool === 'copilot') continue;
      await fs.mkdir(path.dirname(path.join(root,relative)),{recursive:true});
      const target = path.posix.relative(path.posix.dirname(relative),`.agents/prompts/${name}.md`);
      await fs.symlink(target,path.join(root,relative));
      state[relative] = global ? hash(target) : {kind:'symlink',target,hash:hash(target)};
    }
  }
}

test('native discovery inventory covers all selected tools and distinguishes configuration from host verification',async t => {
  const {home,project} = await fixture(t);
  for (const type of ['hooks','mcp','custom']) {
    await write(home,`assets/${type}/demo/asset.json`,json({name:'demo',description:'test',entry:'entry.txt',targets:{codex:`.codex/${type}/demo.txt`}}));
    await write(home,`assets/${type}/demo/entry.txt`,'configuration payload\n');
  }
  const preview = publicPlan(await plan(home,project,config));
  assert.equal(preview.discovery.filter(a => a.type === 'prompts').length,12);
  assert.ok(preview.discovery.filter(a => a.type === 'prompts').every(a => a.status === 'planned'));
  assert.deepEqual(await fs.readdir(project),[]);
  const result = await apply(home,project,config);
  assert.ok(result.discovery.every(a => a.hostVerified === false));
  for (const tool of tools) {
    const entries = result.discovery.filter(a => a.tool === tool);
    assert.equal(entries.filter(a => a.type === 'skills').length,10);
    assert.equal(entries.filter(a => a.type === 'prompts' && a.status === 'ready').length,3);
    assert.equal(entries.filter(a => a.type === 'agents').length,2);
    assert.ok(entries.some(a => a.type === 'rules'));
    for (const type of ['hooks','mcp','custom']) assert.equal(entries.find(a => a.type === type).status,tool === 'codex' ? 'configuration-required' : 'unsupported');
  }
  assert.match(result.discovery.find(a => a.tool === 'codex' && a.type === 'prompts').invocation,/@my-/);
  assert.match(result.discovery.find(a => a.tool === 'cursor' && a.type === 'prompts').invocation,/^\/my-/);
  const check = await doctor(home,project);
  assert.equal(check.healthy,true);
  assert.ok(check.discovery.filter(a => a.type === 'prompts').every(a => a.status === 'ready'));
  await fs.unlink(path.join(project,promptTargets(prompts[0]).codex));
  const broken = await doctor(home,project);
  assert.equal(broken.healthy,false);
  assert.equal(broken.discovery.find(a => a.name === prompts[0] && a.tool === 'codex').status,'needs-sync');
});

test('0.0.8 project aliases migrate with customized body, backups and idempotent native entries',async t => {
  const {home,project} = await fixture(t);
  await apply(home,project,config);
  const state = await readJSON(project,'.my-ai-infra/state.json');
  await oldPrompts(project,state.files);
  await write(project,'.my-ai-infra/state.json',json(state));
  const source = '.agents/prompts/my-auto-feature.md';
  await fs.appendFile(path.join(project,source),'\nKeep this project workflow.\n');
  const result = await apply(home,project,undefined,undefined,{conflict:'merge'});
  assert.equal(result.complete,true);
  assert.match(await fs.readFile(path.join(project,source),'utf8'),/Keep this project workflow/);
  for (const name of prompts) {
    assert.ok((await fs.lstat(path.join(project,promptTargets(name).codex))).isFile());
    for (const target of Object.values(legacyPromptTargets(name))) {
      await assert.rejects(fs.lstat(path.join(project,target)),{code:'ENOENT'});
      assert.ok((await fs.lstat(path.join(result.recovery,'before',target))).isSymbolicLink());
    }
  }
  assert.equal((await doctor(home,project)).healthy,true);
  const again = await apply(home,project);
  assert.equal(again.recovery,null);
});

test('global setup migrates recorded aliases and rejects user-owned conflicts before writing',async t => {
  const {home,toolHome} = await fixture(t);
  await setup(home,tools,toolHome);
  const state = await readJSON(home,'global-state.json');
  await oldPrompts(toolHome,state,true);
  await write(home,'global-state.json',json(state));
  const old = legacyPromptTargets(prompts[0]).codex;
  await fs.unlink(path.join(toolHome,old)); await write(toolHome,old,'User-owned replacement\n');
  await assert.rejects(setup(home,tools,toolHome),/Global asset conflict/);
  await assert.rejects(fs.stat(path.join(toolHome,promptTargets(prompts[0]).codex)),{code:'ENOENT'});
  assert.equal(await fs.readFile(path.join(toolHome,old),'utf8'),'User-owned replacement\n');
  await fs.unlink(path.join(toolHome,old));
  const target = path.posix.relative(path.posix.dirname(old),`.agents/prompts/${prompts[0]}.md`);
  await fs.symlink(target,path.join(toolHome,old));
  await setup(home,tools,toolHome);
  await assert.rejects(fs.lstat(path.join(toolHome,old)),{code:'ENOENT'});
  assert.ok((await fs.lstat(path.join(toolHome,promptTargets(prompts[0]).codex))).isFile());
  await setup(home,tools,toolHome);
});

test('same-name Skill and Prompt reject without modifying the target project',async t => {
  const {home,project} = await fixture(t);
  await write(home,'assets/prompts/my-review-code.md','---\ndescription: "conflicting name"\n---\nDo something else.\n');
  await assert.rejects(plan(home,project,config),/Duplicate asset target.*my-review-code/);
  assert.deepEqual(await fs.readdir(project),[]);
});

test('blocked Prompt body skips dependent entries and preserves old invocation paths for retry',async t => {
  const {root,home,project} = await fixture(t);
  await apply(home,project,config);
  const state = await readJSON(project,'.my-ai-infra/state.json');
  await oldPrompts(project,state.files);
  await write(project,'.my-ai-infra/state.json',json(state));
  const outside = path.join(root,'outside'); await fs.mkdir(outside);
  await fs.rm(path.join(project,'.agents/prompts'),{recursive:true});
  await fs.symlink(outside,path.join(project,'.agents/prompts'));
  const result = await apply(home,project,undefined,undefined,{conflict:'merge'});
  assert.equal(result.complete,false);
  for (const name of prompts) {
    await assert.rejects(fs.lstat(path.join(project,promptTargets(name).codex)),{code:'ENOENT'});
    assert.ok((await fs.lstat(path.join(project,legacyPromptTargets(name).codex))).isSymbolicLink());
    assert.equal(result.discovery.find(a => a.tool === 'codex' && a.name === name).status,'needs-sync');
  }
  assert.deepEqual(await fs.readdir(outside),[]);
  await fs.unlink(path.join(project,'.agents/prompts'));
  assert.equal((await apply(home,project,undefined,undefined,{conflict:'merge'})).complete,true);
  assert.equal((await doctor(home,project)).healthy,true);
});

test('doctor reports a locally diverged Prompt wrapper after merge preserves it',async t => {
  const {home,project} = await fixture(t);
  await apply(home,project,config);
  const entry = promptTargets(prompts[0]).codex;
  await fs.appendFile(path.join(project,entry),'\nLocally changed adapter.\n');
  await apply(home,project,undefined,undefined,{conflict:'merge'});
  const result = await doctor(home,project);
  assert.equal(result.healthy,false);
  assert.ok(result.issues.some(issue => issue.path === entry));
  assert.equal(result.discovery.find(a => a.tool === 'codex' && a.name === prompts[0]).status,'needs-sync');
});

test('legacy Prompt resource filenames with Markdown delimiters resolve within the project',async t => {
  const {home,project} = await fixture(t);
  const entry = '正文 # (1).md';
  await write(home,'assets/prompts/legacy/asset.json',json({name:'legacy',description:'legacy resource',entry,targets:{codex:'.codex/prompts/legacy.md'}}));
  await write(home,`assets/prompts/legacy/${entry}`,'Only this local body.\n');
  await apply(home,project,config);
  const target = path.join(project,promptTargets('legacy').codex);
  const body = await fs.readFile(target,'utf8');
  const reference = body.match(/\]\(([^)]+)\)/)[1];
  assert.equal(await fs.readFile(path.resolve(path.dirname(target),decodeURIComponent(reference)),'utf8'),'Only this local body.\n');
});

test('a user-owned same-name entry keeps legacy commands and reports partial completion',async t => {
  const {home,project} = await fixture(t);
  await apply(home,project,config);
  const state = await readJSON(project,'.my-ai-infra/state.json');
  await oldPrompts(project,state.files);
  await write(project,'.my-ai-infra/state.json',json(state));
  const entry = promptTargets(prompts[0]).codex;
  await write(project,entry,'---\nname: "my-auto-design"\ndescription: "User workflow"\n---\nKeep my instructions.\n');
  const result = await apply(home,project,undefined,undefined,{conflict:'merge'});
  assert.equal(result.complete,false);
  assert.match(await fs.readFile(path.join(project,entry),'utf8'),/Keep my instructions/);
  assert.ok(result.skipped.some(item => item.path === entry));
  assert.ok((await fs.lstat(path.join(project,legacyPromptTargets(prompts[0]).codex))).isSymbolicLink());
  assert.match(await fs.readFile(path.join(result.recovery,'incoming',entry),'utf8'),/读取并执行/);
  const replaced = await apply(home,project,undefined,undefined,{conflict:'replace'});
  assert.equal(replaced.complete,true);
  assert.equal((await doctor(home,project)).healthy,true);
});
