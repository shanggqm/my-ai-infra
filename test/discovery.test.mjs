import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { apply, plan, doctor, publicPlan } from '../src/project.mjs';
import { defaultConfig } from '../src/store.mjs';
import { json, write } from '../src/fs.mjs';
import { BUILTINS } from '../src/names.mjs';

const tools = ['codex','claudecode','cursor','copilot'];
const config = {...defaultConfig(),tools};
const prompts = ['my-auto-design','my-auto-feature','my-init-repo-memory','my-simple-feature'];
async function fixture(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'mai-discovery-')));
  t.after(() => fs.rm(root,{recursive:true,force:true}));
  const home = path.join(root,'home'), project = path.join(root,'中文 project'), toolHome = path.join(root,'tools');
  await fs.mkdir(project); await fs.mkdir(toolHome);
  return {root,home,project,toolHome};
}
test('native discovery inventory covers all selected tools and distinguishes configuration from host verification',async t => {
  const {home,project} = await fixture(t);
  for (const type of ['hooks','mcp','custom']) {
    await write(home,`assets/${type}/demo/asset.json`,json({name:'demo',description:'test',entry:'entry.txt',targets:{codex:`.codex/${type}/demo.txt`}}));
    await write(home,`assets/${type}/demo/entry.txt`,'configuration payload\n');
  }
  const preview = publicPlan(await plan(home,project,config));
  assert.ok(preview.discovery.every(a => a.type !== 'prompts'));
  assert.ok(preview.discovery.filter(a => a.type === 'skills' && prompts.includes(a.name)).every(a => a.status === 'planned'));
  assert.deepEqual(await fs.readdir(project),[]);
  const result = await apply(home,project,config);
  assert.ok(result.discovery.every(a => a.hostVerified === false));
  for (const tool of tools) {
    const entries = result.discovery.filter(a => a.tool === tool);
    assert.equal(entries.filter(a => a.type === 'skills').length,BUILTINS.length);
    assert.equal(entries.find(a => a.type === 'skills' && a.name === 'my-analyze-debt')?.status,'ready');
    assert.equal(entries.filter(a => a.type === 'skills' && prompts.includes(a.name) && a.status === 'ready').length,prompts.length);
    assert.equal(entries.filter(a => a.type === 'agents').length,2);
    assert.ok(entries.some(a => a.type === 'rules'));
    for (const type of ['hooks','mcp','custom']) assert.equal(entries.find(a => a.type === type).status,tool === 'codex' ? 'configuration-required' : 'unsupported');
  }
  assert.match(result.discovery.find(a => a.tool === 'codex' && a.type === 'skills' && prompts.includes(a.name)).invocation,/@my-/);
  assert.match(result.discovery.find(a => a.tool === 'cursor' && a.type === 'skills' && prompts.includes(a.name)).invocation,/^\/my-/);
  const check = await doctor(home,project);
  assert.equal(check.healthy,true);
  assert.ok(check.discovery.filter(a => a.type === 'skills' && prompts.includes(a.name)).every(a => a.status === 'ready'));
  await fs.unlink(path.join(project,`.agents/skills/${prompts[0]}/SKILL.md`));
  const broken = await doctor(home,project);
  assert.equal(broken.healthy,false);
  assert.equal(broken.discovery.find(a => a.name === prompts[0] && a.tool === 'codex').status,'needs-sync');
});
