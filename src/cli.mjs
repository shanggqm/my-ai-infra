import fs from 'node:fs/promises';
import path from 'node:path';
import { stdin, stdout } from 'node:process';
import { allAssets, catalog, config, defaultConfig, importAsset, personalHome, saveAsset, seed, setup, TOOLS, PACKAGE } from './store.mjs';
import { json, locked, readJSON, write } from './fs.mjs';
import { apply, doctor, plan, projectConfig, projectRoot, publicPlan } from './project.mjs';
import { startWeb } from './web.mjs';
import { canonicalName } from './names.mjs';
import { selectMany, selectOne } from './select.mjs';
import { conflictPolicy } from './conflicts.mjs';
import { agentCatalog } from './agents.mjs';
import { bindMemoryProject, readMemory, recallMemory, saveMemory, putMemory, deleteMemory } from './memory.mjs';
import { terminalUI } from './terminal.mjs';

const HELP = `my-ai-infra · 个人 AI Coding / SDD 工具

mai setup [--tools codex,claudecode,cursor,copilot]
mai init [--project PATH] [--tools ...] [--dry-run]
mai plan [--project PATH] [--tools ...]
mai sync [--project PATH] [--tools ...] [--dry-run]
mai doctor [--project PATH]
mai config [--project PATH]
mai defaults [--tools ...]
mai upgrade [--home PATH]
mai catalog
mai agents
mai asset list
mai asset import PATH [--type skills|agents|prompts|hooks|mcp|TYPE]
mai asset edit NAME --file PATH [--type TYPE]
mai web [--project PATH] [--port 4317]
mai memory bind [--project PATH] [--project-id ID|new]
mai memory get [--project PATH] [--scope project|global]
mai memory recall --scene SCENE [--project PATH] [--query TEXT] [--budget 2400]
mai memory put --file entry.md --revision HASH [--project PATH] [--scope project|global]
mai memory save --file memory.md --revision HASH [--project PATH] [--scope project|global]
mai memory delete ID --revision HASH [--project PATH] [--scope project|global]

mai 与 my-ai-infra 共用全部命令和选项。
--home PATH   指定个人资产库（或 MY_AI_INFRA_HOME）
--yes         使用已保存偏好，跳过交互选择
--conflict merge|replace|abort  项目冲突策略，默认 merge；replace 先备份，abort 遇冲突终止
--help        显示帮助
--version     显示版本（或 -v）
项目路径必须已存在。未指定路径时使用当前目录。
交互初始化使用 ↑/↓ 移动、空格多选、Enter 确认工具；Skill 默认全部安装。
非交互环境沿用已保存工具偏好（初始为 Codex）。
upgrade 更新个人库与本地 runtime；同步项目仍需显式执行 sync。
Web 必须通过本地命令启动，不能直接打开 HTML 文件。`;

function parse(args) {
  const positionals = [], options = {};
  for (let i = 0; i < args.length; i++) {
    const arg = ({ '-h': '--help', '-v': '--version' })[args[i]] || args[i];
    if (!arg.startsWith('--')) { positionals.push(arg); continue; }
    const equal = arg.indexOf('='), name = arg.slice(2, equal < 0 ? undefined : equal);
    if (['yes', 'dry-run', 'help', 'version'].includes(name)) {
      if (equal >= 0) throw Error(`Flag does not accept a value: --${name}`);
      options[name] = true; continue;
    }
    if (!['project', 'tools', 'skills', 'port', 'home', 'file', 'conflict', 'type', 'scope', 'scene', 'query', 'budget', 'revision', 'project-id'].includes(name)) throw Error(`Unknown option: ${arg}`);
    if (equal >= 0) { if (!arg.slice(equal + 1)) throw Error(`Missing value for --${name}`); options[name] = arg.slice(equal + 1); continue; }
    if (!args[i + 1] || args[i + 1].startsWith('--')) throw Error(`Missing value for ${arg}`);
    options[name] = args[++i];
  }
  return { positionals, options };
}
const csv = text => text.split(',').map(t => t.trim()).filter(Boolean);
const aliases = tools => tools.map(t => ({ claude: 'claudecode', 'claude-code': 'claudecode', 'github-copilot': 'copilot' })[t] || t);

async function preferences(base, options, interactive, home) {
  const result = { ...base };
  if (interactive && !options.skills) result.skills = (await catalog(home)).map(asset => asset.name);
  if (options.tools) result.tools = aliases(csv(options.tools));
  if (interactive && !options.yes && stdin.isTTY && stdout.isTTY) {
    if (!options.tools) {
      const labels = { codex: 'Codex', claudecode: 'Claude Code', cursor: 'Cursor', copilot: 'GitHub Copilot' };
      result.tools = await selectMany({ title: '选择 AI Coding 工具（可多选）', choices: Object.keys(TOOLS).map(value => ({ value, label: labels[value] })), selected: aliases(base.tools) });
    }
  }
  if (options.skills) result.skills = csv(options.skills);
  return result;
}
export async function main(args = process.argv.slice(2)) {
  const { positionals, options } = parse(args);
  const [command = 'help', sub, name] = positionals;
  if (options.help) { console.log(HELP); return; }
  if (command === 'version' || options.version) { console.log((await readJSON(PACKAGE, 'package.json')).version); return; }
  if (command === 'help') { console.log(HELP); return; }
  const allowed = {
    setup: ['tools', 'skills', 'yes'], upgrade: [], init: ['project', 'tools', 'skills', 'yes', 'dry-run', 'conflict'],
    plan: ['project', 'tools', 'skills', 'dry-run', 'conflict'], sync: ['project', 'tools', 'skills', 'yes', 'dry-run', 'conflict'],
    doctor: ['project'], config: ['project'], defaults: ['tools', 'skills'], catalog: [], agents: [],
    asset: sub === 'edit' ? ['file','type'] : ['type'], web: ['project', 'port'],
    memory: { bind: ['project','project-id'], get: ['project','scope'], recall: ['project','scene','query','budget'], put: ['project','scope','file','revision'], save: ['project','scope','file','revision'], delete: ['project','scope','revision'] }[sub],
  }[command];
  if (!allowed) throw Error(`Unknown command: ${command}`);
  const expected = command === 'memory' ? (sub === 'delete' ? 3 : 2) : command !== 'asset' ? 1 : ['import', 'edit'].includes(sub) ? 3 : sub === 'list' ? 2 : -1;
  if (positionals.length !== expected) throw Error(`Unexpected arguments: ${positionals.join(' ')}; use --help`);
  for (const key of Object.keys(options)) if (!['home', ...allowed].includes(key)) throw Error(`Option --${key} is not supported by ${command}`);
  if (options.conflict) conflictPolicy(options.conflict);
  const home = path.resolve(options.home || personalHome());
  if (command === 'memory') {
    const target = { project: options.project || process.cwd(), scope: options.scope || 'project' };
    let result;
    if (sub === 'bind') result = await bindMemoryProject(home, target.project, options['project-id']);
    if (sub === 'get') result = await readMemory(home, target);
    if (sub === 'recall') result = await recallMemory(home, { project: target.project, scene: options.scene, query: options.query, ...(options.budget ? { budget: Number(options.budget) } : {}) });
    if (sub === 'put' || sub === 'save') {
      if (!options.file || !options.revision) throw Error('需要 --file Markdown 文件和 --revision');
      result = await (sub === 'put' ? putMemory : saveMemory)(home, target, await fs.readFile(options.file, 'utf8'), options.revision);
    }
    if (sub === 'delete') result = await deleteMemory(home, target, name, options.revision);
    console.log(json(result)); return;
  }
  if (command === 'agents') { console.log(json((await agentCatalog(home)).map(({ body, content, ...item }) => item))); return; }
  if (command === 'upgrade') {
    const result = await locked(home, () => seed(home, { updateBuiltins: true }));
    console.log(json({ version: (await readJSON(PACKAGE, 'package.json')).version, home, ...result, next: '使用 plan / sync 显式更新目标项目' })); return;
  }
  if (command === 'web') {
    const port = options.port === undefined ? 4317 : Number(options.port);
    let web;
    try { web = await startWeb({ home, project: options.project || process.cwd(), port }); }
    catch (error) { if (error.code === 'EADDRINUSE') throw Error(`端口 ${port} 已被占用，请使用 --port 0 自动选择空闲端口。`); throw error; }
    console.log(`打开本地配置器：${web.url}\n按 Ctrl+C 退出。`);
    const stop = () => web.server.close();
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
    return;
  }
  if (command === 'catalog' || (command === 'asset' && sub === 'list')) { const list = command === 'catalog' ? await catalog(home) : await allAssets(home); console.log(json(list.filter(a=>!options.type || a.type===options.type).map(({content,contents,body,...item})=>item))); return; }
  if (command === 'setup') {
    const defaults = await readJSON(home, 'defaults.json', defaultConfig());
    const chosen = await config(await preferences(defaults, options, true, home), home);
    console.log(json(await setup(home, chosen.tools, undefined, chosen.skills)));
    await locked(home, () => write(home, 'defaults.json', json(chosen)));
    return;
  }
  if (command === 'defaults') {
    const current = await readJSON(home, 'defaults.json', defaultConfig());
    if (!options.tools && !options.skills) { console.log(json(await config(current, home, { allowProjectId: false }))); return; }
    const chosen = await config(await preferences(current, options, false, home), home, { allowProjectId: false });
    await locked(home, async () => { await seed(home); await write(home, 'defaults.json', json(chosen)); });
    console.log(json(chosen)); return;
  }
  if (command === 'asset') {
    if (sub === 'import' && name) { console.log(json(await importAsset(home, name, options.type || 'skills'))); return; }
    if (sub === 'edit' && name && options.file) {
      const old = (await allAssets(home)).find(s => s.name === (!options.type || options.type === 'skills' ? canonicalName(name) : name) && s.type === (options.type || 'skills'));
      if (!old) throw Error('Unknown asset');
      console.log(json(await saveAsset(home, name, await fs.readFile(options.file, 'utf8'), old.revision, options.type || 'skills'))); return;
    }
    throw Error('Use asset import PATH, asset list, or asset edit NAME --file PATH');
  }
  if (!['init', 'plan', 'sync', 'doctor', 'config'].includes(command)) throw Error(`Unknown command: ${command}`);
  const root = await projectRoot(options.project || process.cwd());
  if (command === 'doctor') {
    const result = await doctor(home, root); console.log(json(result)); if (!result.healthy) process.exitCode = 1; return;
  }
  const base = await projectConfig(home, root, { recover: command !== 'config' });
  if (command === 'config') { console.log(json(base)); return; }
  const ui = terminalUI();
  const writing = command !== 'plan' && !options['dry-run'];
  if (writing) ui.header(command, root, home);
  const chosen = await preferences(base, options, command === 'init', home);
  let policy = conflictPolicy(options.conflict || 'merge');
  if (command === 'plan' || options['dry-run']) console.log(json(publicPlan(await plan(home, root, chosen, { conflict: policy }))));
  else {
    ui.selection(chosen);
    const checked = await ui.task('2/3 检查项目与文件冲突', () => plan(home, root, chosen, { conflict: policy }));
    if (checked.conflicts.length && !options.conflict && !options.yes && stdin.isTTY && stdout.isTTY) {
      ui.conflicts(checked.conflicts);
      policy = await selectOne({ title: '选择冲突处理方式', selected: 'merge', choices: [{value:'merge',label:'merge（默认）：保留本地内容、补缺，保存待合并候选'}, {value:'replace',label:'replace：备份后使用待安装资产'}, {value:'abort',label:'终止：保留现场，不应用任何配置'}] });
      if (policy === 'abort') { ui.cancelled(); process.exitCode = 130; return; }
    }
    const result = await ui.task('3/3 备份并应用项目配置', async () => {
      const preview = await plan(home, root, chosen, { conflict: policy });
      return apply(home, root, chosen, preview.revision, { conflict: policy });
    });
    if (!result.complete) process.exitCode = 2;
    if (ui.active) { ui.result(result, policy); return; }
    console.log(json(result));
    if (result.review.length) console.error(`已按 ${policy} 处理 ${result.review.length} 处冲突；原文件、候选与恢复记录：${result.recovery || '本次无恢复记录'}`);
    if (!result.complete) { console.error(`部分路径已保留并跳过，请检查 skipped 后重试，或明确选择 replace。恢复记录：${result.recovery}`); process.exitCode = 2; }
    if (result.nextSteps.length) console.error('\n项目规则文件尚为空，请完成所选工具的初始化：\n' + result.nextSteps.map(step => `${step.tool} · ${step.file}\n${step.message}`).join('\n\n'));
  }
}
