import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { apply, plan, doctor } from '../src/project.mjs';
import { write, read, json } from '../src/fs.mjs';
import { PACKAGE, saveAsset } from '../src/store.mjs';
import { startWeb } from '../src/web.mjs';
const exec = promisify(execFile);
const chosen={version:1,tools:['codex','claudecode','cursor','copilot'],skills:['my-create-feature']};
const source='.agents/skills/my-create-feature/SKILL.md',alias='.claude/skills/my-create-feature/SKILL.md';
async function fixture(t){const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'infra-conflicts-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));const project=path.join(root,'project'),home=path.join(root,'personal');await fs.mkdir(project);return{root,home,project};}
const merge=(f,config=chosen,revision)=>apply(f.home,f.project,config,revision,{conflict:'merge'});
test('preflight lists every conflict without writing target files',async t=>{
  const f=await fixture(t);await write(f.project,source,'# Local skill');await write(f.project,'AGENTS.md','# Root');await write(f.project,'.agents/rules/AGENTS.md','# Central');await write(f.project,'.my-ai-infra.json','broken json');await write(f.project,'.my-ai-infra/state.json','broken state');await fs.mkdir(path.join(f.project,'.gitignore'));
  const p=await plan(f.home,f.project,chosen,{conflict:'merge'});for(const file of [source,'AGENTS.md','.my-ai-infra.json','.my-ai-infra/state.json','.gitignore'])assert.ok(p.conflicts.some(c=>c.path===file),file);
  assert.equal(await read(f.project,source),'# Local skill');await assert.rejects(fs.stat(f.home),{code:'ENOENT'});
});
test('merge preserves local canonical text, saves incoming candidate and remains healthy after edits and sync',async t=>{
  const f=await fixture(t);await write(f.project,source,'# Local skill\r\n');const result=await merge(f);assert.equal(result.complete,true);assert.equal(await read(f.project,source),'# Local skill\r\n');assert.ok(await read(result.recovery,`incoming/${source}`));assert.equal(await fs.realpath(path.join(f.project,alias)),path.join(f.project,source));
  await fs.appendFile(path.join(f.project,source),'New project customization\n');assert.equal((await doctor(f.home,f.project)).healthy,true);const repeated=await merge(f);assert.equal(repeated.review.length,0);assert.match(await read(f.project,source),/New project customization/);
});
test('merge centralizes divergent adapter copies and retains all variants',async t=>{
  const f=await fixture(t);await write(f.project,alias,'# Claude local');await write(f.project,'.cursor/skills/my-create-feature/SKILL.md','# Cursor local');const result=await merge(f);assert.equal(await read(f.project,source),'# Claude local');assert.equal(await read(result.recovery,`local/.cursor/skills/my-create-feature/SKILL.md`),'# Cursor local');assert.ok(await read(result.recovery,`incoming/${source}`));assert.equal((await doctor(f.home,f.project)).healthy,true);
  for(const prefix of ['.claude','.cursor','.github'])assert.equal(await fs.realpath(path.join(f.project,prefix,'skills/my-create-feature/SKILL.md')),path.join(f.project,source));
});
test('replace backs up local text and can explicitly reset a previously merged customization',async t=>{
  const f=await fixture(t);await write(f.project,source,'# Local');await merge(f);const result=await apply(f.home,f.project,chosen,undefined,{conflict:'replace'});assert.equal(await read(result.recovery,`before/${source}`),'# Local');assert.match(await read(f.project,source),/name: "my-create-feature"/);assert.equal((await doctor(f.home,f.project)).healthy,true);
});
test('later personal source changes create fresh candidates and keep approved local content protected',async t=>{
  const f=await fixture(t), name='team-feature', target=`.agents/skills/${name}/SKILL.md`;
  const content=`---\nname: ${name}\ndescription: Team workflow\n---\n`;
  await saveAsset(f.home,name,content,null);
  const choice={...chosen,skills:[name]};
  await write(f.project,target,'# Local');await merge(f,choice);
  await fs.appendFile(path.join(f.home,`assets/skills/${name}/SKILL.md`),'\nUpstream update\n');
  const result=await merge(f,choice);assert.equal(await read(f.project,target),'# Local');
  assert.match(await read(result.recovery,`incoming/${target}`),/Upstream update/);assert.equal((await doctor(f.home,f.project)).healthy,true);
});

test('abort and invalid policies leave project content unchanged',async t=>{
  const f=await fixture(t);await write(f.project,source,'# Local');await assert.rejects(apply(f.home,f.project,chosen,undefined,{conflict:'abort'}),e=>e.exitCode===2);await assert.rejects(plan(f.home,f.project,chosen,{conflict:'oops'}),/Invalid conflict policy/);assert.equal(await read(f.project,source),'# Local');await assert.rejects(fs.stat(path.join(f.project,'.my-ai-infra.json')),{code:'ENOENT'});
});
test('merge recovers corrupt state/config and malformed ignore markers with originals backed up',async t=>{
  const f=await fixture(t);await write(f.project,'.my-ai-infra.json','{bad config');await write(f.project,'.my-ai-infra/state.json','{bad state');await write(f.project,'.gitignore','# User comment\n<!-- my-ai-infra:start -->\nprivate/\n');const result=await merge(f);for(const file of ['.my-ai-infra.json','.my-ai-infra/state.json','.gitignore'])assert.ok(await read(result.recovery,`before/${file}`));assert.match(await read(f.project,'.gitignore'),/User comment/);assert.match(await read(f.project,'.gitignore'),/private\//);assert.equal((await doctor(f.home,f.project)).healthy,true);
});
test('directory/file and binary collisions are archived without losing bytes',async t=>{
  const f=await fixture(t);await fs.mkdir(path.join(f.project,source),{recursive:true});const bytes=Buffer.from([255,0,128,19]);await fs.writeFile(path.join(f.project,source,'keep.bin'),bytes);await fs.writeFile(path.join(f.project,'.gitignore'),bytes);const result=await merge(f);assert.deepEqual(await fs.readFile(path.join(result.recovery,'before',source,'keep.bin')),bytes);assert.deepEqual(await fs.readFile(path.join(result.recovery,'before/.gitignore')),bytes);assert.equal((await doctor(f.home,f.project)).healthy,true);
});
test('namespace files are archived before creating directories; blocked project state does not block global recovery',async t=>{
  const f=await fixture(t);await write(f.project,'.agents','# Old namespace file');await write(f.project,'.my-ai-infra','# Old state namespace');const result=await merge(f);assert.ok(result.recovery.startsWith(f.home + path.sep));assert.equal(await read(result.recovery,`before/.agents`),'# Old namespace file');assert.equal(await read(result.recovery,`before/.my-ai-infra`),'# Old state namespace');assert.equal((await doctor(f.home,f.project)).healthy,true);
});
test('merge skips unsafe directory links; replace detaches the link without touching its destination',async t=>{
  const f=await fixture(t);const outside=path.join(f.root,'outside');await fs.mkdir(outside);await fs.writeFile(path.join(outside,'keep.txt'),'External data');await fs.symlink(outside,path.join(f.project,'.claude'));
  const first=await merge(f);assert.equal(first.complete,false);assert.ok(first.skipped.some(a=>a.path==='.claude'));assert.equal(await fs.readlink(path.join(f.project,'.claude')),outside);assert.equal((await doctor(f.home,f.project)).healthy,false);
  const second=await apply(f.home,f.project,chosen,undefined,{conflict:'replace'});assert.equal(second.complete,true);assert.equal(await fs.readlink(path.join(second.recovery,'before/.claude')),outside);assert.equal(await fs.readFile(path.join(outside,'keep.txt'),'utf8'),'External data');assert.deepEqual(await fs.readdir(outside),['keep.txt']);assert.equal((await doctor(f.home,f.project)).healthy,true);
});
test('existing correct directory links are reused and switching tools does not delete their canonical files',async t=>{
  const f=await fixture(t);await fs.mkdir(path.join(f.project,'.claude'));await fs.symlink('../.agents/skills',path.join(f.project,'.claude/skills'));await merge(f);assert.equal(await fs.readlink(path.join(f.project,'.claude/skills')),'../.agents/skills');assert.equal((await doctor(f.home,f.project)).healthy,true);await merge(f,{...chosen,tools:['codex']});assert.ok(await read(f.project,source));assert.equal((await doctor(f.home,f.project)).healthy,true);
});
test('runtime-rule conflicts keep central text and archive root text while repairing the entry',async t=>{
  const f=await fixture(t);await write(f.project,'AGENTS.md','# Root principles');await write(f.project,'.agents/rules/AGENTS.md','# Central principles');const result=await merge(f);assert.equal(await read(f.project,'AGENTS.md'),'# Central principles');assert.equal(await read(result.recovery,`local/AGENTS.md`),'# Root principles');assert.equal((await doctor(f.home,f.project)).healthy,true);
});
test('failed replacement restores a directory, namespace file, state and an external leaf link',async t=>{
  const f=await fixture(t);await write(f.project,'.agents','# Namespace');const bytes=Buffer.from([255,0,128]);await fs.writeFile(path.join(f.project,'.my-ai-infra.json'),bytes);const outside=path.join(f.root,'outside.md');await fs.writeFile(outside,'Keep outside');await fs.symlink(outside,path.join(f.project,'AGENTS.md'));await fs.mkdir(path.join(f.project,'.gitignore'));await fs.writeFile(path.join(f.project,'.gitignore/user'),'Keep directory');
  const original=fs.rename;let failed=false;fs.rename=async (from,to)=>{if(!failed&&to===path.join(f.project,'.my-ai-infra/state.json')){failed=true;throw Error('Injected state failure');}return original(from,to);};
  try{await assert.rejects(merge(f),/Injected state failure/);}finally{fs.rename=original;}
  assert.equal(await read(f.project,'.agents'),'# Namespace');assert.deepEqual(await fs.readFile(path.join(f.project,'.my-ai-infra.json')),bytes);assert.equal(await fs.readlink(path.join(f.project,'AGENTS.md')),outside);assert.equal(await fs.readFile(path.join(f.project,'.gitignore/user'),'utf8'),'Keep directory');assert.equal(await fs.readFile(outside,'utf8'),'Keep outside');await assert.rejects(fs.stat(path.join(f.project,'.my-ai-infra/state.json')),{code:'ENOENT'});
});
test('failed replace restores an external parent directory link without modifying its destination',async t=>{
  const f=await fixture(t),outside=path.join(f.root,'shared');await fs.mkdir(outside);await fs.writeFile(path.join(outside,'keep'),'Keep');await fs.symlink(outside,path.join(f.project,'.claude'));const original=fs.rename;let failed=false;fs.rename=async(from,to)=>{if(!failed&&to===path.join(f.project,'.my-ai-infra/state.json')){failed=true;throw Error('Injected failure');}return original(from,to);};try{await assert.rejects(apply(f.home,f.project,chosen,undefined,{conflict:'replace'}),/Injected failure/);}finally{fs.rename=original;}assert.equal(await fs.readlink(path.join(f.project,'.claude')),outside);assert.deepEqual(await fs.readdir(outside),['keep']);
});
test('CLI defaults to merge and supports explicit replace/abort without typed asset names',async t=>{
  const f=await fixture(t);await write(f.project,source,'# Local');const cli=path.join(PACKAGE,'bin/my-ai-infra.mjs'),args=['init','--home',f.home,'--project',f.project,'--tools','codex','--yes'];const first=JSON.parse((await exec(process.execPath,[cli,...args])).stdout);assert.equal(first.conflict,'merge');assert.equal(await read(f.project,source),'# Local');await write(f.project,'.agents/skills/my-create-prd/SKILL.md','# Newly conflicting edit');await assert.rejects(exec(process.execPath,[cli,...args,'--conflict','abort']));await exec(process.execPath,[cli,...args,'--conflict','replace']);assert.match(await read(f.project,source),/name: "my-create-feature"/);
});
test('Web uses the selected policy and rejects applying a preview with a changed policy',async t=>{
  const f=await fixture(t);await write(f.project,source,'# Local');const web=await startWeb({...f,port:0});t.after(()=>new Promise(resolve=>web.server.close(resolve)));const request=(route,data)=>fetch(web.origin+'/api/'+route,{method:'POST',headers:{'X-My-Ai-Token':web.token,'Content-Type':'application/json'},body:json(data)});
  const p=await(await request('plan',{project:f.project,config:chosen})).json();assert.equal(p.conflict,'merge');assert.ok(p.conflicts.some(c=>c.path===source));assert.equal((await request('apply',{project:f.project,config:chosen,revision:p.revision,conflict:'replace'})).status,400);
  const fresh=await(await request('plan',{project:f.project,config:chosen,conflict:'merge'})).json();assert.equal((await request('apply',{project:f.project,config:chosen,revision:fresh.revision,conflict:'merge'})).status,200);assert.equal(await read(f.project,source),'# Local');
});
