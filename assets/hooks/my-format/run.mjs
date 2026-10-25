import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';

// This module is also imported by the installer's read-only preview.
const CONFIGS = {
  prettier: ['.prettierrc', ...['json', 'json5', 'yml', 'yaml', 'toml', 'js', 'cjs', 'mjs', 'ts', 'cts', 'mts'].map(ext => `.prettierrc.${ext}`), ...['js', 'cjs', 'mjs', 'ts', 'cts', 'mts'].map(ext => `prettier.config.${ext}`)],
  biome: ['biome.json', 'biome.jsonc'],
  ruff: ['ruff.toml', '.ruff.toml'],
  yapf: ['.style.yapf'],
  rustfmt: ['rustfmt.toml', '.rustfmt.toml'],
  'clang-format': ['.clang-format', '_clang-format'],
  swiftformat: ['.swiftformat'],
  scalafmt: ['.scalafmt.conf'],
  stylua: ['stylua.toml', '.stylua.toml'],
  dprint: ['dprint.json', 'dprint.jsonc', '.dprint.json', '.dprint.jsonc'],
  editorconfig: ['.editorconfig'],
};
const SECTIONS = {
  'pyproject.toml': /^\s*\[tool\.(black|ruff|yapf|autopep8)(?:\.[^\]]+)?\]\s*(?:#.*)?$/m,
  'setup.cfg': /^\s*\[(yapf|tool:autopep8)\]\s*$/m,
  'pom.xml': /<artifactId>\s*(spotless-maven-plugin|fmt-maven-plugin|formatter-maven-plugin)\s*<\/artifactId>/,
  'build.gradle': /(?:com\.diffplug\.spotless|com\.github\.sherter\.google-java-format)/,
  'build.gradle.kts': /(?:com\.diffplug\.spotless|com\.github\.sherter\.google-java-format)/,
  '.golangci.yml': /^formatters\s*:/m,
  '.golangci.yaml': /^formatters\s*:/m,
};
const SCRIPT_NAMES = ['format', 'fmt', 'format:write'];
const SCRIPT_FILES = ['scripts/format.mjs', 'scripts/format.js', 'scripts/format.cjs', 'scripts/format.sh', 'scripts/format.py', 'scripts/fmt.mjs', 'scripts/fmt.sh', 'format.sh', 'fmt.sh'];
const digest = text => createHash('sha256').update(text).digest('hex');
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

async function regularPath(root, relative) {
  const target = path.resolve(root, relative);
  if (!target.startsWith(root + path.sep)) return null;
  let current = root;
  for (const part of path.relative(root, target).split(path.sep)) {
    current = path.join(current, part);
    let info;
    try { info = await fs.lstat(current); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    if (info.isSymbolicLink() || (current === target ? !info.isFile() : !info.isDirectory())) return null;
  }
  return target;
}

export async function detectFormatting(project) {
  const root = await fs.realpath(project), inputs = {}, warnings = [], cache = new Map();
  const names = new Set(await fs.readdir(root));
  async function read(relative) {
    if (cache.has(relative)) return cache.get(relative);
    let text = null;
    try {
      const file = names.has(relative.split('/')[0]) ? await regularPath(root, relative) : null;
      if (file) {
        if ((await fs.stat(file)).size > 1024 * 1024) throw Error('文件超过 1 MiB');
        text = await fs.readFile(file, 'utf8');
      }
    } catch (error) { warnings.push(`${relative}: ${error.message}`); }
    inputs[relative] = text === null ? null : digest(text);
    cache.set(relative, text);
    return text;
  }
  const configurations = [];
  for (const [tool, names] of Object.entries(CONFIGS)) for (const file of names) {
    if (await read(file) !== null) configurations.push({ tool, file });
  }
  for (const [file, pattern] of Object.entries(SECTIONS)) {
    const text = await read(file);
    if (text !== null && pattern.test(text)) configurations.push({ tool: file === 'pyproject.toml' ? text.match(pattern)[1] : 'project-formatter', file });
  }
  let pkg = {};
  const packageText = await read('package.json');
  if (packageText !== null) try { const parsed = JSON.parse(packageText); if (object(parsed)) pkg = parsed; }
  catch { warnings.push('package.json: 无法解析，跳过 package scripts'); }
  if (Object.hasOwn(pkg, 'prettier') && (object(pkg.prettier) || typeof pkg.prettier === 'string')) configurations.push({ tool: 'prettier', file: 'package.json' });
  // Inspect only known entries. Never run build tools to enumerate their tasks.
  let command = null;
  const script = SCRIPT_NAMES.find(name => typeof pkg.scripts?.[name] === 'string' && pkg.scripts[name].trim());
  if (script) {
    let manager = typeof pkg.packageManager === 'string' ? pkg.packageManager.split('@')[0] : null;
    if (!manager) {
      for (const [file, candidate] of [['pnpm-lock.yaml', 'pnpm'], ['yarn.lock', 'yarn'], ['bun.lock', 'bun'], ['bun.lockb', 'bun']]) if (await read(file) !== null) { manager = candidate; break; }
    }
    manager ||= 'npm';
    if (['npm', 'pnpm', 'yarn', 'bun'].includes(manager)) command = { executable: manager, args: ['run', script], source: `package.json#scripts.${script}` };
  }
  for (const file of SCRIPT_FILES) {
    if (command) break;
    if (await read(file) !== null) command = { executable: /\.[cm]?js$/.test(file) ? process.execPath : file.endsWith('.py') ? 'python3' : 'bash', args: [file], source: file };
  }
  for (const file of ['GNUmakefile', 'makefile', 'Makefile']) {
    if (command) break;
    const text = await read(file);
    const target = ['format', 'fmt'].find(name => new RegExp(`^${name}\\s*:(?!=)`, 'm').test(text || ''));
    if (target) command = { executable: 'make', args: ['-f', file, target], source: `${file}#${target}` };
  }
  for (const file of ['justfile', 'Justfile', '.justfile']) {
    if (command) break;
    const text = await read(file);
    const target = ['format', 'fmt'].find(name => new RegExp(`^${name}\\s*:(?!=)`, 'm').test(text || ''));
    if (target) command = { executable: 'just', args: ['--justfile', file, target], source: `${file}#${target}` };
  }
  return { status: !configurations.length ? 'no-config' : command ? 'ready' : 'no-script', configurations, command, warnings, inputs };
}

async function executablePath(command, env) {
  if (path.isAbsolute(command)) return command;
  for (const directory of (env.PATH || '').split(path.delimiter).filter(Boolean)) {
    const file = path.resolve(directory, command);
    try { await fs.access(file, fs.constants.X_OK); if ((await fs.stat(file)).isFile()) return file; } catch { /* Try the next existing executable. */ }
  }
  return null;
}

function execute(executable, args, root, env, timeout) {
  return new Promise(resolve => {
    const child = spawn(executable, args, { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
    let output = '', expired = false, force;
    const collect = data => { output = (output + data.toString()).slice(-4000); };
    child.stdout.on('data', collect); child.stderr.on('data', collect);
    const kill = signal => {
      try { if (process.platform !== 'win32') process.kill(-child.pid, signal); else child.kill(signal); } catch { /* Already exited. */ }
    };
    const timer = setTimeout(() => { expired = true; kill('SIGTERM'); force = setTimeout(() => kill('SIGKILL'), 500); }, timeout);
    const finish = result => { clearTimeout(timer); clearTimeout(force); resolve(result); };
    child.once('error', error => finish({ status: 'failed', reason: error.message }));
    child.once('close', code => finish({ status: expired ? 'timeout' : code === 0 ? 'formatted' : 'failed', code, output }));
  });
}

export async function runFormatting(project, { event = {}, env = process.env, timeout = 20000 } = {}) {
  if (env.MAI_FORMAT_RUNNING === '1' || event.permission_mode === 'plan' || event.stop_hook_active || event.loop_count > 0 || event.agent_id || event.agentId || ['error', 'aborted'].includes(event.status)) return { status: 'skipped', reason: '规划模式或非主任务首次正常结束' };
  const root = await fs.realpath(project);
  const detected = await detectFormatting(root);
  if (detected.status !== 'ready') return { status: 'skipped', reason: detected.status };
  const executable = await executablePath(detected.command.executable, env);
  if (!executable) return { status: 'skipped', reason: '运行工具未安装', command: detected.command };
  // The installer already creates this directory. Never follow a replaced link.
  const directory = path.join(root, '.my-ai-infra');
  const info = await fs.lstat(directory).catch(() => null);
  if (!info?.isDirectory() || info.isSymbolicLink()) return { status: 'skipped', reason: '项目运行目录不可用' };
  const lock = path.join(directory, 'format.lock');
  try { await fs.mkdir(lock); } catch (error) { return { status: 'skipped', reason: error.code === 'EEXIST' ? '格式化正在运行或遗留锁待处理' : error.message }; }
  try {
    return { ...await execute(executable, detected.command.args, root, { ...env, MAI_FORMAT_RUNNING: '1', COREPACK_ENABLE_NETWORK: '0', npm_config_offline: 'true', npm_config_yes: 'false' }, timeout), command: detected.command };
  } finally { await fs.rmdir(lock); }
}

// Resolve the real installed source, independently of the host's cwd or payload.
const ownFile = fileURLToPath(import.meta.url);
if (process.argv[1] && await fs.realpath(process.argv[1]).catch(() => null) === ownFile) {
  try {
    let input = '';
    for await (const chunk of process.stdin) { input += chunk; if (input.length > 1024 * 1024) throw Error('Hook 输入超过 1 MiB'); }
    const event = input.trim() ? JSON.parse(input) : {};
    if (!object(event)) throw Error('Hook 输入必须为 JSON 对象');
    const result = await runFormatting(path.resolve(path.dirname(ownFile), '../../..'), { event });
    if (['failed', 'timeout'].includes(result.status)) console.error(`[my-format] ${result.status}: ${result.command?.source || ''}\n${result.output || result.reason || ''}`);
  } catch (error) { console.error(`[my-format] 跳过：${error.message}`); }
  // Never request another model turn or expose formatter output as hook JSON.
  console.log('{}');
}
