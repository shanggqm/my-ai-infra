import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import readline from 'node:readline';

// Initialize the host's SDK protocol only. No user message or model turn is sent.
export async function checkClaudeDiscovery(binary, project, expected, roles = []) {
  const child = spawn(binary,['--setting-sources','project','--settings','{"disableAllHooks":true}','--strict-mcp-config','--mcp-config','{"mcpServers":{}}','--print','--input-format','stream-json','--output-format','stream-json','--verbose'],{cwd:project,stdio:['pipe','pipe','pipe']});
  const closed = new Promise(resolve => child.once('close',resolve));
  const lines = readline.createInterface({input:child.stdout});
  child.stderr.resume();
  let timer;
  try {
    const response = await new Promise((resolve,reject) => {
      timer = setTimeout(() => reject(Error('Claude discovery timed out')),30000);
      child.once('error',reject); child.stdin.once('error',reject);
      child.once('exit',code => reject(Error(`Claude initialization exited: ${code}`)));
      lines.on('line',line => {
        let message; try { message = JSON.parse(line); } catch { return; }
        if (message.type !== 'control_response' || message.response?.request_id !== 'mai-discovery') return;
        if (message.response.subtype !== 'success') reject(Error('Claude initialization failed'));
        else resolve(message.response.response);
      });
      child.stdin.write(JSON.stringify({type:'control_request',request_id:'mai-discovery',request:{subtype:'initialize'}})+'\n');
    });
    for (const name of expected) {
      const entries = response.commands.filter(command => command.name === name && command.description.endsWith('(project)'));
      assert.equal(entries.length,1,`Claude must discover exactly one project command: ${name}`);
    }
    for (const name of roles) assert.ok(response.agents.some(agent => agent.name === name),`Claude role missing: ${name}`);
    return {count:expected.length,names:[...expected].sort(),roles};
  } finally {
    clearTimeout(timer); lines.close(); child.kill();
    const killTimer = setTimeout(() => child.kill('SIGKILL'),2000);
    await closed; clearTimeout(killTimer);
  }
}
