import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough, Writable } from 'node:stream';
import { selectMany, selectOne } from '../src/select.mjs';

function terminal() {
  const input = new PassThrough(); input.isTTY = true; input.isRaw = false;
  input.setRawMode = raw => { input.isRaw = raw; };
  let text = '';
  const output = new Writable({ write(chunk, encoding, done) { text += chunk; done(); } });
  output.isTTY = true; output.columns = 80; output.rows = 24;
  return { input, output, text: () => text };
}
const choices = ['Codex', 'Claude Code', 'Cursor', 'GitHub Copilot'].map((label, value) => ({ label, value: String(value) }));
const open = (io, selected = ['0']) => selectMany({ title: '选择工具', choices, selected, ...io });
test('single conflict choice defaults to merge and arrows select exactly one policy',async()=>{
  const choices=[{value:'merge',label:'merge'},{value:'replace',label:'replace'},{value:'abort',label:'终止'}];
  for(const [keys,expected] of [['\r','merge'],['\x1b[B\r','replace'],['\x1b[B\x1b[B\r','abort']]){const io=terminal();const result=selectOne({title:'处理冲突',choices,selected:'merge',...io});io.input.write(keys);assert.equal(await result,expected);assert.equal(io.input.isRaw,false);}
});

test('arrow keys and space select multiple tools without typing names and restore terminal state', async () => {
  const io = terminal(), result = open(io);
  assert.equal(io.input.isRaw, true);
  io.input.write(' \x1b[B \x1b[B\x1b[B \r');
  assert.deepEqual(await result, ['1', '3']);
  assert.equal(io.input.isRaw, false);
  assert.equal(io.input.isPaused(), true);
  assert.equal(io.input.listenerCount('keypress'), 0);
  assert.match(io.text(), /Claude Code、GitHub Copilot/);
});
test('Enter keeps saved choices; empty selection stays open until at least one item is checked', async () => {
  const saved = terminal(), savedResult = open(saved, ['2', '3']);
  saved.input.write('\r'); assert.deepEqual(await savedResult, ['2', '3']);
  const io = terminal(), result = open(io);
  io.input.write(' \r'); assert.match(io.text(), /请至少选择一项/);
  assert.equal(io.input.isRaw, true);
  io.input.write('\x1b[A \r'); assert.deepEqual(await result, ['3']);
});
test('all-toggle, short-terminal scrolling and resize preserve choices', async () => {
  const io = terminal(); io.output.rows = 8;
  const result = open(io);
  io.input.write('aa\x1b[A ');
  io.output.columns = 35; io.output.emit('resize');
  io.input.write('\r'); assert.deepEqual(await result, ['3']);
  assert.match(io.text(), /4\/4/);
});
test('Ctrl+C and input closure cancel, restore raw mode and remove prompt listeners', async () => {
  for (const end of ['ctrl-c', 'eof']) {
    const io = terminal(), result = open(io);
    if (end === 'ctrl-c') io.input.write('\x03'); else io.input.end();
    await assert.rejects(result, error => error.exitCode === 130);
    assert.equal(io.input.isRaw, false);
    assert.equal(io.input.listenerCount('keypress'), 0);
    assert.match(io.text(), /已取消/);
  }
});
test('consecutive menus do not consume input twice and preserve an already-raw terminal', async () => {
  const io = terminal(); io.input.isRaw = true;
  const first = open(io); io.input.write('\r'); await first;
  const second = open(io); io.input.write('\x1b[B \r');
  assert.deepEqual(await second, ['0', '1']); assert.equal(io.input.isRaw, true);
  io.input.pause();
});
