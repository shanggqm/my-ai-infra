import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import readline from 'node:readline';
import path from 'node:path';

// Read-only host integration: no thread, model request or tool execution is started.
export async function checkCodexDiscovery(binary, project, expected) {
  const child = spawn(binary,['app-server'],{cwd:project,stdio:['pipe','pipe','pipe']});
  const pending = new Map(); let sequence = 0, failure;
  const rejectAll = error => {
    failure = error;
    for (const {reject} of pending.values()) reject(error);
    pending.clear();
  };
  const timer = setTimeout(() => rejectAll(Error('Codex Skill discovery timed out')),30000);
  const closed = new Promise(resolve => child.once('close',resolve));
  child.on('error',rejectAll);
  child.on('exit',code => rejectAll(Error(`Codex app-server exited: ${code}`)));
  child.stdin.on('error',rejectAll);
  child.stderr.resume();
  const lines = readline.createInterface({input:child.stdout});
  lines.on('line',line => {
    let message;
    try { message = JSON.parse(line); } catch { return; }
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(Error(JSON.stringify(message.error)));
    else request.resolve(message.result);
  });
  const send = message => child.stdin.write(JSON.stringify(message)+'\n');
  const request = (method,params) => new Promise((resolve,reject) => {
    if (failure) { reject(failure); return; }
    const id = ++sequence;
    pending.set(id,{resolve,reject}); send({id,method,params});
  });
  try {
    await request('initialize',{clientInfo:{name:'mai_discovery_check',version:'1.0.0'}});
    send({method:'initialized',params:{}});
    const {data} = await request('skills/list',{cwds:[project],forceReload:true});
    const result = data.find(entry => path.resolve(entry.cwd) === path.resolve(project));
    assert.ok(result,'Host did not return the requested project');
    const prefix = path.join(project,'.agents','skills') + path.sep;
    const errors = result.errors.filter(entry => entry.path.startsWith(prefix));
    assert.deepEqual(errors,[],'Host rejected installed Skill metadata');
    const skills = result.skills.filter(entry => entry.path.startsWith(prefix) && entry.enabled);
    assert.deepEqual(skills.map(skill => skill.name).sort(),[...expected].sort(),'Host did not discover every selected project Skill');
    return {count:skills.length,names:skills.map(skill => skill.name).sort()};
  } finally {
    clearTimeout(timer); lines.close(); child.kill();
    const killTimer = setTimeout(() => child.kill('SIGKILL'),2000);
    await closed; clearTimeout(killTimer);
  }
}
