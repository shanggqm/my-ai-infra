import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { apply, plan, doctor } from '../src/project.mjs';
import { seed, setup, catalog, allAssets, importAsset, saveAsset, PACKAGE } from '../src/store.mjs';
import { hash, json, write } from '../src/fs.mjs';
import { parseExtension } from '../src/assets.mjs';
import { startWeb } from '../src/web.mjs';
const exec = promisify(execFile);
const chosen = {version:1,tools:['codex','claudecode'],skills:['my-review-code']};
async function fixture(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'infra-assets-')));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const project=path.join(root,'project'), home=path.join(root,'home'), toolHome=path.join(root,'tools');
  await fs.mkdir(project); await fs.mkdir(toolHome); return {root,project,home,toolHome};
}
test('Codex uses source files and Claude uses links; project Agent source edits regenerate every format',async t=>{
  const {project,home,toolHome}=await fixture(t);
  await apply(home,project,chosen);
  for (const prefix of ['.agents','.claude']) {
    const entry=path.join(project,prefix,'skills/my-review-code/SKILL.md');
    assert.equal((await fs.lstat(entry)).isSymbolicLink(),prefix !== '.agents');
    assert.equal(await fs.realpath(entry),path.join(project,'.agents/skills/my-review-code/SKILL.md'));
  }
  const entries=['.codex/agents/code-review.toml','.claude/agents/code-review.md'];
  for(const entry of entries) { assert.ok((await fs.lstat(path.join(project,entry))).isSymbolicLink()); assert.ok((await fs.realpath(path.join(project,entry))).includes('/.agents/.generated/')); }
  await fs.appendFile(path.join(project,'.agents/agents/code-review.md'),'\nProject role customization.\n');
  await apply(home,project,undefined,undefined,{conflict:'merge'});
  for(const entry of entries) assert.match(await fs.readFile(path.join(project,entry),'utf8'),/Project role customization/);
  assert.equal((await doctor(home,project)).healthy,true);
  await fs.appendFile(path.join(project,entries[0]),'# Native-only edit\n');
  const repaired=await apply(home,project,undefined,undefined,{conflict:'merge'});
  assert.ok(repaired.review.some(item=>item.path.includes('.generated/')));
  assert.doesNotMatch(await fs.readFile(path.join(project,entries[0]),'utf8'),/Native-only edit/);
  assert.match(await fs.readFile(path.join(repaired.recovery,'local/.agents/.generated/codex/agents/code-review.toml'),'utf8'),/Native-only edit/);
  await setup(home,chosen.tools,toolHome,chosen.skills);
  for(const entry of entries) assert.ok((await fs.lstat(path.join(toolHome,entry))).isSymbolicLink());
});
test('legacy personal roots migrate intact and retain old upgrade baselines; divergent roots refuse migration',async t=>{
  const {home}=await fixture(t);
  const text='---\nname: "my-review-code"\ndescription: "Legacy version"\n---\nOld version\n';
  await write(home,'skills/my-review-code/SKILL.md',text);
  await write(home,'bundle-state.json',json({version:1,files:{'my-review-code/SKILL.md':hash(text)}}));
  const migrated = await seed(home);
  assert.equal(await fs.readFile(path.join(migrated.skillMigrations[0].backup,'SKILL.md'),'utf8'),text);
  await assert.rejects(fs.lstat(path.join(home,'skills')),{code:'ENOENT'});
  await seed(home,{updateBuiltins:true});
  assert.notEqual((await catalog(home)).find(a=>a.name==='my-review-code').content,text);
  await write(home,'agents/code-review.md','different source');
  await assert.rejects(seed(home),/migration conflict/);
  assert.equal(await fs.readFile(path.join(home,'agents/code-review.md'),'utf8'),'different source');
});
test('v3 flat sources and shared rules remain intact through read-only preview and sync',async t=>{
  const {home,project}=await fixture(t); await seed(home);
  const files={};
  for(const [target,source] of [['.agents/skills/my-review-code/SKILL.md','assets/skills/my-review-code/SKILL.md'],['.agents/agents/code-review.md','assets/agents/code-review.md']]) {
    const text=await fs.readFile(path.join(source.startsWith('assets/skills/')?PACKAGE:home,source),'utf8'); await write(project,target,text);files[target]={kind:'file',hash:hash(text)};
  }
  await write(project,'.agents/rules/AGENTS.md','# Keep my principles\n');
  for(const entry of ['AGENTS.md','CLAUDE.md']) {await fs.symlink('.agents/rules/AGENTS.md',path.join(project,entry));files[entry]={kind:'symlink',target:'.agents/rules/AGENTS.md',hash:hash('.agents/rules/AGENTS.md')};}
  await write(project,'.my-ai-infra/state.json',json({version:3,files}));
  const preview=await plan(home,project,chosen,{conflict:'merge'});
  await assert.rejects(fs.stat(path.join(project,'.agents/assets')),{code:'ENOENT'});
  const result=await apply(home,project,chosen,preview.revision,{conflict:'merge'});
  assert.equal(result.complete,true);
  assert.equal(await fs.realpath(path.join(project,'AGENTS.md')),await fs.realpath(path.join(project,'CLAUDE.md')));
  assert.equal(await fs.readFile(path.join(project,'AGENTS.md'),'utf8'),'# Keep my principles\n');
  assert.ok((await fs.lstat(path.join(project,'.agents/agents/code-review.md'))).isFile());
  assert.ok((await fs.lstat(path.join(project,'.agents/skills/my-review-code/SKILL.md'))).isFile());
  assert.equal(preview.actions.find(a => a.path === '.agents/rules/AGENTS.md').action,'preserve');
  assert.equal((await doctor(home,project)).healthy,true);
});
for(const type of ['prompts','hooks','mcp','future-assets']) test(`${type} shares import, edit, CLI/Web listing, conflict, setup and removal`,async t=>{
  const {root,home,project,toolHome}=await fixture(t),name='demo',source=path.join(root,name);
  const targets={codex:`.codex/${type}/demo.txt`,claudecode:`.claude/${type}/demo.txt`};
  await write(source,'asset.json',json({name,description:'test asset',entry:'entry.txt',targets,globalTargets:targets}));
  await write(source,'entry.txt','original body\n'); await importAsset(home,source,type);
  const asset=(await allAssets(home)).find(a=>a.type===type && a.name===name); assert.ok(asset);
  const listed=JSON.parse((await exec(process.execPath,[path.join(PACKAGE,'bin/my-ai-infra.mjs'),'asset','list','--type',type,'--home',home])).stdout);
  assert.equal(listed.filter(a=>a.name===name).length,1); assert.ok(listed.every(a=>a.type===type));
  const web=await startWeb({home,project,port:0});t.after(()=>new Promise(resolve=>web.server.close(resolve)));
  const headers={'x-my-ai-token':web.token,'Content-Type':'application/json'};
  const state=await (await fetch(web.origin+'/api/state',{headers})).json();assert.ok(state.inventory.some(a=>a.type===type));
  const response=await fetch(web.origin+'/api/asset',{method:'POST',headers,body:JSON.stringify({type,name,content:'edited body\n',revision:asset.revision})}); assert.equal(response.status,200);
  await assert.rejects(saveAsset(home,name,'stale overwrite',asset.revision,type),/changed since/);
  await apply(home,project,chosen);
  const center=path.join(project,`.agents/${type}/${name}/entry.txt`);
  const entries = type === 'prompts' ? ['.claude/skills/demo/SKILL.md'] : Object.values(targets);
  for(const target of entries) {assert.ok((await fs.lstat(path.join(project,target))).isSymbolicLink());assert.equal(await fs.realpath(path.join(project,target)),type === 'prompts' ? path.join(project,'.agents/skills/demo/SKILL.md') : center);}
  if(type === 'prompts') assert.ok((await fs.lstat(path.join(project,'.agents/skills/demo/SKILL.md'))).isFile());
  await fs.writeFile(center,'local customization');
  const merged=await apply(home,project,undefined,undefined,{conflict:'merge'}); assert.ok(merged.review.length);assert.equal(await fs.readFile(center,'utf8'),'local customization');
  await setup(home,chosen.tools,toolHome,chosen.skills);
  for(const target of entries) assert.ok((await fs.lstat(path.join(toolHome,target))).isSymbolicLink());
  await apply(home,project,{...chosen,tools:['cursor']},undefined,{conflict:'merge'});
  for(const target of entries) await assert.rejects(fs.lstat(path.join(project,target)),{code:'ENOENT'});
  assert.equal(await fs.readFile(center,'utf8'),'local customization');
});
test('extension paths reject traversal, native namespaces and shared config',()=>{
  for(const target of ['../outside','.claude/../outside','.claude/settings.json','.claude/skills/other/SKILL.md','.claude/agents/other.md']) assert.throws(()=>parseExtension(json({name:'demo',description:'test',entry:'main',targets:{claudecode:target}}),'hooks','demo'));
  assert.throws(()=>parseExtension(json({name:'demo',description:'test',entry:'../outside',targets:{}}),'hooks','demo'));
});
