import path from 'node:path';
import { stdout } from 'node:process';

export const toolLabel = tool => ({ codex: 'Codex', claudecode: 'Claude Code', cursor: 'Cursor', copilot: 'GitHub Copilot' })[tool] || tool;
const plain = value => String(value).replace(/[\x00-\x1f\x7f-\x9f]/g, ' ');

export function palette(output = stdout, env = process.env) {
  const enabled = output.isTTY && env.TERM !== 'dumb' && !Object.hasOwn(env, 'NO_COLOR');
  const paint = code => value => enabled ? `\x1b[${code}m${value}\x1b[0m` : String(value);
  return { bold: paint('1'), muted: paint('2'), accent: paint('36'), good: paint('32'), warn: paint('33'), bad: paint('31') };
}

// Leave a spare column so an animated line never wraps into the next row.
export function fitLine(value, columns = 80) {
  let result = '', width = 0;
  for (const char of plain(value)) {
    const size = /\p{Mark}/u.test(char) ? 0 : char.codePointAt(0) > 255 ? 2 : 1;
    if (width + size > Math.max(1, columns - 2)) return result + '…';
    result += char; width += size;
  }
  return result;
}

export function terminalUI({ output = stdout, env = process.env } = {}) {
  const active = Boolean(output.isTTY), color = palette(output, env);
  const line = (text = '') => { if (active) output.write(text + '\n'); };
  const field = (label, value) => line(`  ${color.muted(label)}  ${plain(value)}`);
  return {
    active,
    header(command, root, home) {
      line(); line(`  ${color.accent(color.bold('mai'))}  ${color.bold(command === 'init' ? '初始化项目' : '同步项目')}`);
      field('项目', root); field('资产库', home); line();
    },
    selection(chosen) {
      line(`  ${color.good('✓')} ${color.bold('1/3 配置已选择')}`);
      field('工具', chosen.tools.map(toolLabel).join(' · ')); field('Skill', `${chosen.skills.length} 个`); line();
    },
    async task(label, action) {
      if (!active) return action();
      const started = Date.now(), animate = env.TERM !== 'dumb';
      const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
      let index = 0, timer;
      const render = () => output.write('\r\x1b[2K' + color.accent(fitLine(`  ${frames[index++ % frames.length]} ${label}`, output.columns)));
      const finish = (symbol, paint) => {
        if (timer) clearInterval(timer);
        if (animate) output.write('\r\x1b[2K');
        line(`  ${paint(symbol)} ${plain(label)} ${color.muted(`(${((Date.now() - started) / 1000).toFixed(1)}s)`)}`);
      };
      if (animate) { render(); timer = setInterval(render, 80); timer.unref(); }
      else line(`  … ${plain(label)}`);
      try { const result = await action(); finish('✓', color.good); return result; }
      catch (error) { finish('✗', color.bad); throw error; }
    },
    conflicts(items) {
      line(); line(`  ${color.warn('!')} ${color.bold(`发现 ${items.length} 处冲突`)}`);
      for (const item of items) { field('路径', item.path); field('原因', item.reason); }
      line();
    },
    cancelled() { line(`\n  ${color.warn('!')} 已终止，未应用配置。\n`); },
    result(result, policy) {
      const { summary, complete } = result;
      line(); line(`  ${complete ? color.good('✓') : color.warn('!')} ${color.bold(complete ? '配置已完成' : '配置部分完成')}`);
      field('文件', `新增 ${summary.create || 0} · 更新 ${summary.update || 0} · 移除 ${summary.remove || 0} · 保留 ${(summary.preserve || 0) + (summary.noop || 0)} · 跳过 ${result.skipped.length}`);
      field('冲突策略', policy);
      if (result.review.length) field('冲突处理', `${result.review.length} 处，原文件与候选已保存`);
      if (result.recovery) field('恢复记录', path.join(result.root, result.recovery));
      if (!complete) {
        line(); line(`  ${color.warn('需要处理')}`);
        for (const item of result.skipped) field('跳过', typeof item === 'string' ? item : `${item.path}${item.reason ? ` · ${item.reason}` : ''}`);
        field('操作', '检查保留路径后重试；需要替换时使用 mai sync --conflict replace。');
      }
      line(); line(`  ${color.accent(color.bold('下一步'))}`);
      if (result.nextSteps.length) {
        field('规则', '项目规则文件尚为空，请完成所选工具的初始化：');
        for (const step of result.nextSteps) {
          line(`\n  ${color.bold(toolLabel(step.tool))} ${color.muted(`· ${plain(step.file)}`)}`);
          for (const text of step.message.split(/(?<=。)\s*|\n/u).filter(Boolean)) line(`    ${plain(text)}`);
        }
        line();
      }
      field('项目目录', result.root);
      field('检查安装', '在项目目录执行 mai doctor'); field('打开工作台', '在项目目录执行 mai web'); line();
    },
    error(error) {
      if (!active) return;
      line(`\n  ${color.bad('✗')} ${color.bold(error.exitCode === 130 || error.exitCode === 143 ? '操作已取消' : '操作未完成')}`);
      for (const text of error.message.split('\n')) line(`    ${plain(text)}`);
      line();
    },
  };
}
