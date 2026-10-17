import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { apply, plan, publicPlan, doctor } from '../src/project.mjs';
import { hash, json, write } from '../src/fs.mjs';
import { RULES, ruleTarget, SHARED_RULE_SOURCE, ruleActions } from '../src/rules.mjs';
const chosen={version:1,tools:['codex','claudecode','cursor','copilot'],skills:['my-create-feature']};
const START='<!-- my-ai-infra:start -->',END='<!-- my-ai-infra:end -->';
const core=(await fs.readFile(new URL('./fixtures/legacy-instructions-0.0.2.md',import.meta.url),'utf8')).trim();
const legacy=`${START}\n${core}\n\n可用 Skill：my-create-feature。\n${END}`;
const names=['AGENTS.md','CLAUDE.md','.github/copilot-instructions.md','.agents/AGENTS.md'];
async function fixture(t){const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'existing-project-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));const project=path.join(root,'project'),home=path.join(root,'personal');await fs.mkdir(project);return{root,home,project};}
test('fresh initialization creates empty centralized rules and native links without SDD injection',async t=>{
  const {home,project}=await fixture(t);const result=await apply(home,project,chosen);
  for(const name of names.slice(0,3)){assert.ok((await fs.lstat(path.join(project,name))).isSymbolicLink());assert.equal(await fs.readFile(path.join(project,name),'utf8'),'');}
  await assert.rejects(fs.lstat(path.join(project,'.agents/AGENTS.md')),{code:'ENOENT'});
  assert.deepEqual(result.nextSteps.map(s=>s.tool),['codex','cursor','claudecode','copilot']);
  assert.equal((await doctor(home,project)).healthy,true);
});
test('different pre-existing runtime instructions and relative imports remain byte-for-byte unchanged',async t=>{
  const {home,project}=await fixture(t);const docs={'AGENTS.md':'# Codex rules\r\n@./docs/codex.md\r\n','CLAUDE.md':'# Claude\n@./docs/claude.md\n','.github/copilot-instructions.md':'# Copilot\nKeep my constraints.\n','.agents/AGENTS.md':'# My custom nested rules\n'};
  for(const[file,body]of Object.entries(docs))await write(project,file,body);
  await apply(home,project,chosen);await apply(home,project);
  for(const[file,body]of Object.entries(docs))assert.equal(await fs.readFile(path.join(project,file),'utf8'),body);
});
test('known public-release blocks are removed with missing state, preserving every byte outside them and keeping backups',async t=>{
  const {home,project}=await fixture(t);const before=`# Project\r\n@README.md\r\n\n${legacy}\n\n# More personal rules\n`;
  await write(project,'CLAUDE.md',before);
  const p=await plan(home,project,chosen);assert.equal(p.actions.find(a=>a.path==='CLAUDE.md').action,'update');
  await apply(home,project,chosen,p.revision);assert.equal(await fs.readFile(path.join(project,'CLAUDE.md'),'utf8'),before.replace(legacy,''));
  let recovered=false;for(const stamp of await fs.readdir(path.join(home,'projects',hash(project),'backups'))){try{if(await fs.readFile(path.join(home,'projects',hash(project),'backups',stamp,'CLAUDE.md'),'utf8')===before)recovered=true;}catch(e){if(e.code!=='ENOENT')throw e;}}
  assert.ok(recovered);assert.equal((await apply(home,project)).summary.update||0,0);
});
test('generated-only shared rules migrate to empty independent rules without leaving dangling links',async t=>{
  const {home,project}=await fixture(t);await write(project,'.agents/AGENTS.md',legacy+'\n');
  await fs.symlink('.agents/AGENTS.md',path.join(project,'AGENTS.md'));await fs.symlink('.agents/AGENTS.md',path.join(project,'CLAUDE.md'));
  await apply(home,project,chosen);for(const name of ['AGENTS.md','CLAUDE.md']){assert.ok((await fs.lstat(path.join(project,name))).isSymbolicLink());assert.equal(await fs.readFile(path.join(project,name),'utf8'),'');}
  await assert.rejects(fs.lstat(path.join(project,'.agents/AGENTS.md')),{code:'ENOENT'});
  assert.ok((await fs.lstat(path.join(project,'.claude/skills/my-create-feature/SKILL.md'))).isSymbolicLink());
});
test('shared legacy sources containing human principles retain their aliases and original human text',async t=>{
  const {home,project}=await fixture(t);const original='# Human principles\n\n'+legacy+'\n';await write(project,'.agents/AGENTS.md',original);await fs.symlink('.agents/AGENTS.md',path.join(project,'AGENTS.md'));
  await apply(home,project,chosen);assert.ok((await fs.lstat(path.join(project,'AGENTS.md'))).isSymbolicLink());assert.equal(await fs.readFile(path.join(project,'AGENTS.md'),'utf8'),original.replace(legacy,''));assert.equal((await doctor(home,project)).healthy,true);
});
test('unknown or changed historical rule blocks are preserved with notices, rather than guessed or overwritten',async t=>{
  for(const text of [`# Human\n${legacy.replace('## SDD 工作约定','## My customized workflow')}`,`# Human\n${START}\nIncomplete user fragment`]){
    const {home,project}=await fixture(t);await write(project,'CLAUDE.md',text);const p=publicPlan(await plan(home,project,chosen));assert.match(p.actions.find(a=>a.path==='CLAUDE.md').note,/原样保留/);await apply(home,project,chosen);assert.equal(await fs.readFile(path.join(project,'CLAUDE.md'),'utf8'),text);
  }
});
test('old registered reference blocks are cleaned without injecting a replacement',async t=>{
  const {home,project}=await fixture(t);const reference='<!-- my-ai-infra:reference:start -->\nOld shared reference\n<!-- my-ai-infra:reference:end -->';const text='# Human rules\n'+reference+'\n';await write(project,'CLAUDE.md',text);await write(project,'.my-ai-infra/state.json',json({version:3,files:{'CLAUDE.md':{kind:'reference',hash:hash(reference)}}}));await apply(home,project,chosen);assert.equal(await fs.readFile(path.join(project,'CLAUDE.md'),'utf8'),text.replace(reference,''));
});
test('stale or edited ignore blocks merge additively, retaining comments, CRLF, negations and idempotence',async t=>{
  const {home,project}=await fixture(t);const original=`node_modules\r\n!.env.example\r\n# ${START}\r\n/.my-ai-infra/\r\n# human comment\r\n/private/\r\n# ${END}\r\n!/.claude/skills/my-create-feature/\r\n`;await write(project,'.gitignore',original);await apply(home,project,chosen);const text=await fs.readFile(path.join(project,'.gitignore'),'utf8');assert.ok(text.startsWith('node_modules\r\n!.env.example\r\n'));assert.ok(text.includes('# human comment\r\n/private/\r\n'));assert.ok(text.endsWith('!/.claude/skills/my-create-feature/\r\n'));assert.ok(!text.split(/\r?\n/).includes('/.claude/skills/my-create-feature/'));await apply(home,project);assert.equal(await fs.readFile(path.join(project,'.gitignore'),'utf8'),text);
  await fs.unlink(path.join(project,'.my-ai-infra/state.json'));await apply(home,project,chosen);assert.equal(await fs.readFile(path.join(project,'.gitignore'),'utf8'),text);
});
test('real asset conflicts and malformed ignore markers report the path, cause and exit 2 without overwriting input',async t=>{
  const f=await fixture(t);await write(f.project,'.agents/skills/my-create-feature/SKILL.md','# User asset\n');const p=publicPlan(await plan(f.home,f.project,chosen));assert.match(p.actions.find(a=>a.action==='conflict').reason,/没有可信安装记录/);await assert.rejects(apply(f.home,f.project,chosen),e=>e.exitCode===2&&e.message.includes('plan --project'));await assert.rejects(fs.stat(path.join(f.project,'.my-ai-infra.json')),{code:'ENOENT'});
  const g=await fixture(t);const ignore=`# ${START}\nmissing end`;await write(g.project,'.gitignore',ignore);await assert.rejects(apply(g.home,g.project,chosen),e=>e.exitCode===2&&e.message.includes('.gitignore'));assert.equal(await fs.readFile(path.join(g.project,'.gitignore'),'utf8'),ignore);
});

test('registered dangling legacy rule links are repaired with empty centralized sources',async t=>{
  const {home,project}=await fixture(t);await fs.symlink('.agents/AGENTS.md',path.join(project,'AGENTS.md'));
  await write(project,'.my-ai-infra/state.json',json({version:2,files:{'AGENTS.md':{kind:'symlink',target:'.agents/AGENTS.md',hash:hash('.agents/AGENTS.md')}}}));
  await apply(home,project,chosen);assert.equal(await fs.readlink(path.join(project,'AGENTS.md')),'.agents/rules/AGENTS.md');assert.equal(await fs.readFile(path.join(project,'AGENTS.md'),'utf8'),'');
});

test('selected tools receive required rule entries; Claude uses the shared AGENTS source',async t=>{
  for(const [tool,entry] of [['codex','AGENTS.md'],['cursor','AGENTS.md'],['claudecode','CLAUDE.md'],['copilot','.github/copilot-instructions.md']]){
    const {home,project}=await fixture(t);
    const result=await apply(home,project,{...chosen,tools:[tool]});
    for(const rule of RULES){
      if(rule.entry===entry || tool==='claudecode' && rule.entry==='AGENTS.md'){
        const source=tool==='claudecode'?SHARED_RULE_SOURCE:rule.source;
        assert.equal(await fs.readlink(path.join(project,rule.entry)),ruleTarget(rule,source));assert.equal(await fs.readFile(path.join(project,source),'utf8'),'');
      }
      else {await assert.rejects(fs.lstat(path.join(project,rule.entry)),{code:'ENOENT'});await assert.rejects(fs.lstat(path.join(project,rule.source)),{code:'ENOENT'});}
    }
    assert.equal(result.nextSteps.length,1);assert.equal(result.nextSteps[0].tool,tool);
    assert.equal((await doctor(home,project)).healthy,true);
    assert.equal((await apply(home,project)).summary.create||0,0);
    if(tool!=='cursor')assert.match(result.nextSteps[0].message,/\/init|copilot init/);
    else assert.match(result.nextSteps[0].message,/Cursor Agent/);
  }
});
test('existing root rules are centralized without mixing, and inactive aliases are removed on sync',async t=>{
  const {home,project}=await fixture(t);const agents='# Codex only\r\nExact bytes.\r\n',claude='# Claude only\nDifferent rules.\n';
  await write(project,'AGENTS.md',agents);await write(project,'CLAUDE.md',claude);
  const result=await apply(home,project,{...chosen,tools:['cursor']});assert.deepEqual(result.nextSteps,[]);
  assert.equal(await fs.readFile(path.join(project,'.agents/rules/AGENTS.md'),'utf8'),agents);assert.equal(await fs.readFile(path.join(project,'.agents/rules/CLAUDE.md'),'utf8'),claude);
  assert.notEqual(await fs.realpath(path.join(project,'AGENTS.md')),await fs.realpath(path.join(project,'CLAUDE.md')));
  await fs.appendFile(path.join(project,'CLAUDE.md'),'User runtime edit.\n');
  await apply(home,project,{...chosen,tools:['codex']});await assert.rejects(fs.lstat(path.join(project,'CLAUDE.md')),{code:'ENOENT'});assert.match(await fs.readFile(path.join(project,'.agents/rules/CLAUDE.md'),'utf8'),/User runtime edit/);assert.equal((await doctor(home,project)).healthy,true);
  await fs.unlink(path.join(project,'.my-ai-infra/state.json'));await apply(home,project,{...chosen,tools:['codex','claudecode']});assert.match(await fs.readFile(path.join(project,'CLAUDE.md'),'utf8'),/User runtime edit/);
});
test('selecting Claude alongside existing AGENTS links new CLAUDE to its existing content',async t=>{
  const {home,project}=await fixture(t);await write(project,'AGENTS.md','# Already configured\n');
  const result=await apply(home,project,{...chosen,tools:['claudecode']});assert.equal(await fs.readFile(path.join(project,'CLAUDE.md'),'utf8'),'# Already configured\n');assert.deepEqual(result.nextSteps,[]);assert.equal(await fs.realpath(path.join(project,'CLAUDE.md')),await fs.realpath(path.join(project,'AGENTS.md')));
});
test('agent initialization can replace an empty root symlink with a file and sync re-centralizes it',async t=>{
  const {home,project}=await fixture(t);await apply(home,project,{...chosen,tools:['claudecode']});
  await fs.unlink(path.join(project,'CLAUDE.md'));await fs.writeFile(path.join(project,'CLAUDE.md'),'# Generated project principles\n');
  const result=await apply(home,project);assert.deepEqual(result.nextSteps,[]);assert.equal(await fs.readlink(path.join(project,'CLAUDE.md')),SHARED_RULE_SOURCE);assert.equal(await fs.readFile(path.join(project,SHARED_RULE_SOURCE),'utf8'),'# Generated project principles\n');
});

test('new AGENTS and CLAUDE always share one editable source across sync, lost state and relocation',async t=>{
  const {root,home,project}=await fixture(t);await apply(home,project,chosen);
  assert.equal(await fs.realpath(path.join(project,'CLAUDE.md')),await fs.realpath(path.join(project,'AGENTS.md')));
  await assert.rejects(fs.lstat(path.join(project,'.agents/rules/CLAUDE.md')),{code:'ENOENT'});
  await fs.writeFile(path.join(project,'CLAUDE.md'),'# One source\r\n');assert.equal(await fs.readFile(path.join(project,'AGENTS.md'),'utf8'),'# One source\r\n');
  await apply(home,project,{...chosen,tools:['codex']});assert.equal((await doctor(home,project)).healthy,true);
  await fs.unlink(path.join(project,'.my-ai-infra/state.json'));await apply(home,project,chosen);
  const moved=path.join(root,'moved-shared');await fs.rename(project,moved);await fs.appendFile(path.join(moved,'AGENTS.md'),'More rules.\n');assert.equal(await fs.readFile(path.join(moved,'CLAUDE.md'),'utf8'),'# One source\r\nMore rules.\n');assert.equal((await doctor(home,moved)).healthy,true);
});
test('adding Claude after a Codex-only initialization reuses AGENTS without creating another source',async t=>{
  const {home,project}=await fixture(t);await apply(home,project,{...chosen,tools:['codex']});await fs.writeFile(path.join(project,'AGENTS.md'),'# Initialized once\n');await apply(home,project,chosen);
  assert.equal(await fs.realpath(path.join(project,'CLAUDE.md')),await fs.realpath(path.join(project,'AGENTS.md')));await assert.rejects(fs.lstat(path.join(project,'.agents/rules/CLAUDE.md')),{code:'ENOENT'});
});
test('a replacement shared entry cannot overwrite different nonempty canonical principles',async t=>{
  const {home,project}=await fixture(t);await apply(home,project,chosen);await fs.writeFile(path.join(project,'AGENTS.md'),'# Canonical\n');await fs.unlink(path.join(project,'CLAUDE.md'));await fs.writeFile(path.join(project,'CLAUDE.md'),'# Different replacement\n');
  await assert.rejects(apply(home,project),e=>e.exitCode===2);assert.equal(await fs.readFile(path.join(project,'AGENTS.md'),'utf8'),'# Canonical\n');assert.equal(await fs.readFile(path.join(project,'CLAUDE.md'),'utf8'),'# Different replacement\n');
});
test('a concurrent edit of the shared source during preview is retained and requires a fresh preview',async t=>{
  const {project}=await fixture(t);await write(project,'AGENTS.md','# Existing root\n');await write(project,SHARED_RULE_SOURCE,'');
  const originalRead=fs.readFile;let edited=false;
  fs.readFile=async (file,...args)=>{const result=await originalRead(file,...args);if(!edited&&file===path.join(project,SHARED_RULE_SOURCE)){edited=true;await fs.writeFile(file,'# Concurrent edit\n');}return result;};
  try {await assert.rejects(ruleActions(project,['codex','claudecode'],{}),/Rule changed during preview/);}finally{fs.readFile=originalRead;}
  assert.equal(await fs.readFile(path.join(project,SHARED_RULE_SOURCE),'utf8'),'# Concurrent edit\n');assert.equal(await fs.readFile(path.join(project,'AGENTS.md'),'utf8'),'# Existing root\n');
});
test('different nonempty rule copies cause an explicit conflict and no installation writes',async t=>{
  const {home,project}=await fixture(t);await write(project,'AGENTS.md','# Root rules\n');await write(project,'.agents/rules/AGENTS.md','# Central rules\n');
  await assert.rejects(apply(home,project,chosen),e=>e.exitCode===2&&e.message.includes('.agents/rules/AGENTS.md')&&e.message.includes('两份内容均已保留'));
  assert.equal(await fs.readFile(path.join(project,'AGENTS.md'),'utf8'),'# Root rules\n');assert.equal(await fs.readFile(path.join(project,'.agents/rules/AGENTS.md'),'utf8'),'# Central rules\n');await assert.rejects(fs.stat(path.join(project,'.my-ai-infra.json')),{code:'ENOENT'});
});
test('missing root links are repaired; equal copies migrate; nonempty canonical rules survive empty entries',async t=>{
  const {home,project}=await fixture(t);await write(project,'.agents/rules/AGENTS.md','# Canonical\n');await write(project,'CLAUDE.md','# Equal\n');await write(project,'.agents/rules/CLAUDE.md','# Equal\n');await apply(home,project,chosen);
  await fs.unlink(path.join(project,'AGENTS.md'));await apply(home,project);assert.equal(await fs.readFile(path.join(project,'AGENTS.md'),'utf8'),'# Canonical\n');
  await fs.unlink(path.join(project,'AGENTS.md'));await fs.writeFile(path.join(project,'AGENTS.md'),'');await apply(home,project);assert.equal(await fs.readFile(path.join(project,'AGENTS.md'),'utf8'),'# Canonical\n');
});
test('runtime rule links and canonical paths never follow unknown external links',async t=>{
  for(const file of ['CLAUDE.md','.agents/rules/CLAUDE.md']){
    const {root,home,project}=await fixture(t);const external=path.join(root,'outside.md');await fs.writeFile(external,'Private outside rules');await fs.mkdir(path.dirname(path.join(project,file)),{recursive:true});await fs.symlink(external,path.join(project,file));
    await assert.rejects(apply(home,project,chosen),e=>e.exitCode===2);assert.equal(await fs.readlink(path.join(project,file)),external);assert.equal(await fs.readFile(external,'utf8'),'Private outside rules');
  }
});
test('centralized runtime links keep working after a whole project move',async t=>{
  const {root,home,project}=await fixture(t);await write(project,'CLAUDE.md','# Move me\n');await apply(home,project,chosen);const moved=path.join(root,'moved');await fs.rename(project,moved);assert.equal(await fs.readFile(path.join(moved,'CLAUDE.md'),'utf8'),'# Move me\n');assert.equal((await doctor(home,moved)).healthy,true);
});
