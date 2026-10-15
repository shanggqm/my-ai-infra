import test from 'node:test';
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';
import { fitLine, palette, terminalUI } from '../src/terminal.mjs';

function terminal(isTTY = true, env = {}) {
  let text = '';
  const output = new Writable({ write(chunk, encoding, done) { text += chunk; done(); } });
  output.isTTY = isTTY; output.columns = 36;
  return { ui: terminalUI({ output, env }), output, text: () => text };
}

test('redirected output stays free of presentation text and ANSI sequences', async () => {
  const io = terminal(false);
  io.ui.header('init', '/project', '/personal');
  io.ui.selection({ tools: ['codex'], skills: ['example'] });
  assert.equal(await io.ui.task('检查配置', async () => 42), 42);
  io.ui.error(Error('failed'));
  assert.equal(io.text(), '');
  assert.equal(palette(io.output).accent('text'), 'text');
});

test('NO_COLOR disables color and dumb terminals use static progress', async () => {
  const io = terminal(true, { TERM: 'dumb', NO_COLOR: '' });
  io.ui.header('init', '/project', '/personal');
  await io.ui.task('检查配置', async () => {});
  assert.match(io.text(), /检查配置/);
  assert.doesNotMatch(io.text(), /\x1b/);
  assert.equal(palette(io.output, { NO_COLOR: '' }).good('ok'), 'ok');
});

test('animated progress stops after success and failure without swallowing errors', async () => {
  for (const fail of [false, true]) {
    const io = terminal();
    const error = Error('test failure');
    const action = io.ui.task('检查配置', async () => { await delay(100); if (fail) throw error; return 'done'; });
    if (fail) await assert.rejects(action, value => value === error);
    else assert.equal(await action, 'done');
    const final = io.text();
    assert.match(final, /\x1b\[2K/);
    assert.ok(final.includes(fail ? '✗' : '✓'));
    await delay(100);
    assert.equal(io.text(), final);
  }
});

test('partial completion separates skipped files, recovery and next steps', () => {
  const io = terminal(true, { NO_COLOR: '1' });
  io.ui.result({ root: '/project', complete: false, summary: { create: 4, update: 2, noop: 3 }, skipped: [{ path: 'custom.md', reason: 'local edit' }], review: [{}], recovery: '/personal/projects/id/backups/test', nextSteps: [{ tool: 'codex', file: 'AGENTS.md', message: '执行 /init\n补全项目规则' }] }, 'merge');
  for (const text of ['配置部分完成', '新增 4 · 更新 2', '跳过 1', '恢复记录', '/personal/projects/id/backups/test', 'custom.md', '下一步', 'Codex', 'mai web']) assert.ok(io.text().includes(text), text);
  assert.doesNotMatch(io.text(), /\x1b/);
});

test('animated lines fit narrow terminals and strip terminal controls', () => {
  assert.equal(fitLine('abc\x1b[2J\nxyz', 80).includes('\x1b'), false);
  assert.equal(fitLine('中文测试很长', 10), '中文测试…');
});

test('asset entry guidance separates native invocation and configuration from host verification', () => {
  const io = terminal(true, { NO_COLOR: '1' });
  io.ui.result({root:'/project',complete:true,summary:{},skipped:[],review:[],nextSteps:[],discovery:[{tool:'codex',name:'my-auto-feature',invocation:'ChatGPT: @my-auto-feature；Codex CLI/IDE: $my-auto-feature',status:'ready'},{tool:'claudecode',name:'demo-hook',invocation:'由宿主事件触发',status:'configuration-required',limitation:'需要配置'}]},'merge');
  for (const text of ['资产入口','@my-auto-feature','$my-auto-feature','文件就绪','需配置','宿主菜单与实际调用需在对应客户端验证']) assert.ok(io.text().includes(text),text);
});
