import { emitKeypressEvents, cursorTo, moveCursor, clearScreenDown } from 'node:readline';
import { stdin, stdout } from 'node:process';
import { palette } from './terminal.mjs';

// Keep each row within the terminal width so cursor-based redraws do not wrap.
function fit(text, columns) {
  let result = '', width = 0;
  for (const char of text.replace(/[\r\n\x00-\x1f\x7f]/g, ' ')) {
    const size = /\p{Mark}/u.test(char) ? 0 : char.codePointAt(0) > 255 ? 2 : 1;
    if (width + size > columns - 2) return result + '…';
    result += char; width += size;
  }
  return result;
}

export function selectMany({ title, choices, selected = [], input = stdin, output = stdout, multiple = true }) {
  if (!input.isTTY || !output.isTTY || typeof input.setRawMode !== 'function') throw Error('交互选择需要终端，请使用 --tools / --skills 或 --yes。');
  if (!choices.length) throw Error('没有可选项。');
  const values = new Set(choices.map(choice => choice.value));
  const checked = new Set(selected.filter(value => values.has(value)));
  const raw = Boolean(input.isRaw), flowing = input.readableFlowing;
  const color = palette(output);
  let current = 0, start = 0, lines = 0, warning = '', finished = false;
  if (!multiple) { current = Math.max(0, choices.findIndex(choice => checked.has(choice.value))); checked.clear(); checked.add(choices[current].value); }
  return new Promise((resolve, reject) => {
    function clear() {
      if (lines) moveCursor(output, 0, -lines);
      cursorTo(output, 0); clearScreenDown(output); lines = 0;
    }
    function render() {
      const count = Math.max(1, Math.min(choices.length, (output.rows || 24) - 6));
      if (current < start) start = current;
      if (current >= start + count) start = current - count + 1;
      const rows = [title, multiple ? '↑/↓ 移动 · 空格选择 · a 全选/清空 · Enter 确认 · Esc 取消' : '↑/↓ 选择 · Enter 确认 · Esc 终止'];
      for (let index = start; index < Math.min(start + count, choices.length); index++) {
        const choice = choices[index];
        rows.push(`${index === current ? '›' : ' '} ${checked.has(choice.value) ? '◉' : '○'} ${choice.label}`);
      }
      rows.push(warning || `已选 ${checked.size} 项${count < choices.length ? ` · ${current + 1}/${choices.length}` : ''}`);
      clear(); output.write(rows.map((row, index) => {
        const text = fit(row, output.columns || 80);
        if (index === 0) return color.bold(text);
        if (index === 1) return color.muted(text);
        if (index === rows.length - 1) return warning ? color.warn(text) : color.muted(text);
        return index - 2 + start === current ? color.accent(text) : text;
      }).join('\n') + '\n'); lines = rows.length;
    }
    function finish(error) {
      if (finished) return;
      finished = true;
      input.removeListener('keypress', keypress); input.removeListener('end', ended); input.removeListener('error', failed);
      output.removeListener('resize', render); process.removeListener('SIGINT', interrupted); process.removeListener('SIGTERM', terminated);
      input.setRawMode(raw); if (flowing !== true) input.pause();
      clear();
      const result = choices.filter(choice => checked.has(choice.value));
      output.write(error ? color.warn('已取消，未应用配置。') + '\n' : `${color.good('✓')} ${title}：${result.map(choice => choice.label).join('、')}\n`);
      if (error) reject(error); else resolve(result.map(choice => choice.value));
    }
    const cancelled = code => Object.assign(Error('已取消交互选择。'), { exitCode: code });
    const ended = () => finish(cancelled(130));
    const failed = error => finish(error);
    const interrupted = () => finish(cancelled(130));
    const terminated = () => finish(cancelled(143));
    function keypress(text, key = {}) {
      if (finished) return;
      if (key.name === 'escape' || (key.ctrl && ['c', 'd'].includes(key.name))) return interrupted();
      if (key.ctrl || key.meta) return;
      if (key.name === 'up') current = (current - 1 + choices.length) % choices.length;
      else if (key.name === 'down') current = (current + 1) % choices.length;
      else if (key.name === 'space' || text === ' ') {
        const value = choices[current].value; if (!multiple) { checked.clear(); checked.add(value); } else if (checked.has(value)) checked.delete(value); else checked.add(value); warning = '';
      } else if (multiple && text?.toLowerCase() === 'a') {
        if (checked.size === choices.length) checked.clear(); else choices.forEach(choice => checked.add(choice.value)); warning = '';
      } else if (['return', 'enter'].includes(key.name)) {
        if (checked.size) return finish();
        warning = '请至少选择一项，再按 Enter 确认。';
      } else return;
      if (!multiple) { checked.clear(); checked.add(choices[current].value); }
      render();
    }
    emitKeypressEvents(input); input.on('keypress', keypress); input.once('end', ended); input.once('error', failed);
    output.on('resize', render); process.once('SIGINT', interrupted); process.once('SIGTERM', terminated);
    input.setRawMode(true); input.resume(); render();
  });
}
export async function selectOne(options) { return (await selectMany({ ...options, selected: [options.selected || options.choices[0].value], multiple: false }))[0]; }
