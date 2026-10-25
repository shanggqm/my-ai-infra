import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { detectFormatting, runFormatting } from '../assets/hooks/my-format/run.mjs';
import { apply, plan, publicPlan, doctor } from '../src/project.mjs';
import { FORMAT_CONFIGS, FORMAT_SOURCE } from '../src/format-hook.mjs';
import { PACKAGE, setup } from '../src/store.mjs';
import { json, readJSON, write } from '../src/fs.mjs';

const exec = promisify(execFile);
const chosen = { version: 1, tools: ['codex', 'claudecode', 'cursor', 'copilot'], skills: ['my-review-code'] };
async function fixture(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'mai-format-')));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const project = path.join(root, "中文 project's $literal"), home = path.join(root, 'home');
  await fs.mkdir(project);
  return { root, project, home };
}
async function script(project, body = "import fs from 'node:fs'; fs.writeFileSync('formatted.txt', process.cwd());\n") {
  await write(project, '.prettierrc.json', '{}\n');
  await write(project, 'scripts/format.mjs', body);
}
function hook(command, cwd, event = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('/bin/sh', ['-c', command], { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', data => { stdout += data; }); child.stderr.on('data', data => { stderr += data; });
    child.once('error', reject); child.once('close', code => resolve({ code, stdout, stderr }));
    child.stdin.end(JSON.stringify(event));
  });
}
const handlers = (data, spec) => (data.hooks?.[spec.event] || []).flatMap(item => spec.grouped ? item.hooks : [item]);

test('format detection is root-only, read-only and needs explicit formatting configuration', async t => {
  const { project } = await fixture(t);
  await write(project, 'packages/web/.prettierrc', '{}');
  await write(project, 'pyproject.toml', '[project]\nname = "demo"\n');
  await write(project, 'scripts/format.sh', 'exit 99\n');
  const before = await fs.readdir(project);
  assert.equal((await detectFormatting(project)).status, 'no-config');
  assert.deepEqual(await fs.readdir(project), before);
  await write(project, 'pyproject.toml', '[tool.black]\nline-length = 88\n');
  const detected = await detectFormatting(project);
  assert.equal(detected.status, 'ready');
  assert.deepEqual(detected.configurations, [{ tool: 'black', file: 'pyproject.toml' }]);
  assert.equal(detected.command.source, 'scripts/format.sh');
});

for (const [file, content] of [
  ['prettier.config.mjs', 'throw new Error("never import configs")'], ['biome.jsonc', '{}'],
  ['ruff.toml', 'line-length = 88'], ['pyproject.toml', '[tool.ruff.format]\nquote-style = "single"'],
  ['.style.yapf', '[style]'], ['rustfmt.toml', 'edition = "2024"'], ['.clang-format', 'BasedOnStyle: LLVM'],
  ['.editorconfig', 'root = true'], ['.swiftformat', '--indent 4'], ['.scalafmt.conf', 'version = "3"'],
  ['stylua.toml', 'column_width = 80'], ['dprint.json', '{}'],
  ['pom.xml', '<artifactId>spotless-maven-plugin</artifactId>'], ['build.gradle.kts', 'plugins { id("com.diffplug.spotless") }'],
  ['.golangci.yml', 'formatters:\n  enable: [gofumpt]'],
]) test(`existing ${file} enables detection without executing configuration`, async t => {
  const { project } = await fixture(t);
  await write(project, file, content);
  const result = await detectFormatting(project);
  assert.equal(result.status, 'no-script');
  assert.equal(result.configurations[0].file, file);
  assert.equal(await fs.readFile(path.join(project, file), 'utf8'), content);
});

test('script selection preserves package manager choice and supports Make and Just', async t => {
  const { project } = await fixture(t);
  await write(project, 'package.json', json({ prettier: {}, packageManager: 'pnpm@10.0.0', scripts: { format: 'prettier --write .' } }));
  assert.deepEqual((await detectFormatting(project)).command, { executable: 'pnpm', args: ['run', 'format'], source: 'package.json#scripts.format' });
  await write(project, 'package.json', json({ scripts: { 'format:check': 'check only' } }));
  await write(project, 'Makefile', '.PHONY: fmt\nfmt:\n\ttrue\n');
  assert.deepEqual((await detectFormatting(project)).command.args, ['-f', 'Makefile', 'fmt']);
  await fs.unlink(path.join(project, 'Makefile'));
  await write(project, 'justfile', 'format := "a variable, not a recipe"\n');
  assert.equal((await detectFormatting(project)).command, null);
  await write(project, 'justfile', 'format:\n    true\n');
  assert.deepEqual((await detectFormatting(project)).command.args, ['--justfile', 'justfile', 'format']);
});

test('no configuration leaves every host Hook configuration absent during init and dry-run', async t => {
  const { home, project } = await fixture(t);
  const args = [path.join(PACKAGE, 'bin/my-ai-infra.mjs'), 'init', '--home', home, '--project', project, '--tools', chosen.tools.join(','), '--skills', 'my-review-code', '--yes'];
  const preview = JSON.parse((await exec(process.execPath, [...args, '--dry-run'])).stdout);
  assert.equal(preview.formatting.status, 'no-config');
  assert.deepEqual(await fs.readdir(project), []);
  const installed = JSON.parse((await exec(process.execPath, args)).stdout);
  assert.equal(installed.complete, true);
  for (const spec of Object.values(FORMAT_CONFIGS)) await assert.rejects(fs.lstat(path.join(project, spec.path)), { code: 'ENOENT' });
  await assert.rejects(fs.lstat(path.join(project, FORMAT_SOURCE)), { code: 'ENOENT' });
});

test('init registers four hosts, keeps user settings, executes from the real root and sync is idempotent', async t => {
  const { root, home, project } = await fixture(t);
  await script(project);
  const originals = {};
  for (const [tool, spec] of Object.entries(FORMAT_CONFIGS)) {
    const user = { type: 'command', command: 'echo user-owned' };
    originals[tool] = { customSetting: tool, hooks: { [spec.event]: [spec.grouped ? { hooks: [user] } : user] }, ...(spec.version ? { version: 1 } : {}) };
    await write(project, spec.path, json(originals[tool]));
  }
  const preview = publicPlan(await plan(home, project, chosen));
  assert.equal(preview.formatting.status, 'ready');
  assert.ok(preview.discovery.filter(item => item.name === 'my-format').every(item => item.status === 'planned'));
  await assert.rejects(fs.stat(path.join(project, 'formatted.txt')), { code: 'ENOENT' });
  const result = await apply(home, project, chosen, preview.revision);
  assert.equal(result.complete, true);
  assert.equal(result.discovery.filter(item => item.name === 'my-format' && item.status === 'ready').length, 4);
  assert.ok(result.discovery.every(item => !item.hostVerified));
  for (const [tool, spec] of Object.entries(FORMAT_CONFIGS)) {
    const settings = await readJSON(project, spec.path);
    assert.equal(settings.customSetting, tool);
    assert.equal(handlers(settings, spec).filter(item => item.command === 'echo user-owned').length, 1);
    const entry = handlers(settings, spec).find(item => item.command.endsWith(' --my-ai-infra-format'));
    const execution = await hook(entry.command, root, { cwd: '/untrusted-payload-path' });
    assert.deepEqual(execution, { code: 0, stdout: '{}\n', stderr: '' });
    assert.equal(await fs.readFile(path.join(project, 'formatted.txt'), 'utf8'), project);
  }
  assert.equal(await fs.readFile(path.join(project, '.prettierrc.json'), 'utf8'), '{}\n');
  const again = await apply(home, project);
  assert.equal(again.recovery, null);
  assert.equal((await doctor(home, project)).healthy, true);
  const spec = FORMAT_CONFIGS.claudecode, settings = await readJSON(project, spec.path);
  settings.permissions = { allow: ['Read'] };
  await write(project, spec.path, json(settings));
  assert.equal((await apply(home, project)).complete, true);
  assert.deepEqual((await readJSON(project, spec.path)).permissions, settings.permissions);
  await fs.unlink(path.join(project, '.prettierrc.json'));
  assert.equal((await runFormatting(project)).reason, 'no-config');
  await apply(home, project);
  for (const [tool, current] of Object.entries(FORMAT_CONFIGS)) {
    const remaining = await readJSON(project, current.path);
    assert.equal(remaining.customSetting, tool);
    assert.equal(handlers(remaining, current).length, 1);
  }
});

test('a missing script installs a dormant hook that skips successfully and re-detects later scripts', async t => {
  const { root, home, project } = await fixture(t);
  await write(project, '.prettierrc', '{}');
  const installed = await apply(home, project, chosen);
  assert.equal(installed.formatting.status, 'no-script');
  const entry = handlers(await readJSON(project, FORMAT_CONFIGS.codex.path), FORMAT_CONFIGS.codex)[0];
  assert.deepEqual(await hook(entry.command, root), { code: 0, stdout: '{}\n', stderr: '' });
  assert.equal(await fs.readFile(path.join(project, '.prettierrc'), 'utf8'), '{}');
  await write(project, 'scripts/format.mjs', "import fs from 'node:fs'; fs.writeFileSync('ran', 'yes');\n");
  assert.equal((await hook(entry.command, root)).code, 0);
  assert.equal(await fs.readFile(path.join(project, 'ran'), 'utf8'), 'yes');
});

test('format config and script edits invalidate a preview before writes', async t => {
  const { home, project } = await fixture(t);
  await script(project);
  for (const file of ['.prettierrc.json', 'scripts/format.mjs']) {
    const preview = await plan(home, project, chosen);
    await fs.appendFile(path.join(project, file), '\n');
    await assert.rejects(apply(home, project, chosen, preview.revision), /changed since preview/);
    await assert.rejects(fs.stat(path.join(project, '.my-ai-infra.json')), { code: 'ENOENT' });
  }
});

test('malformed and customized native Hook configurations stay intact and report incomplete installation', async t => {
  const { home, project } = await fixture(t);
  await script(project);
  await write(project, FORMAT_CONFIGS.claudecode.path, '{ bad JSON');
  for (const conflict of ['merge', 'replace']) {
    const result = await apply(home, project, chosen, undefined, { conflict });
    assert.equal(result.complete, false);
    assert.equal(await fs.readFile(path.join(project, FORMAT_CONFIGS.claudecode.path), 'utf8'), '{ bad JSON');
    assert.equal(result.discovery.find(item => item.tool === 'claudecode' && item.name === 'my-format').status, 'needs-sync');
  }
  await write(project, FORMAT_CONFIGS.claudecode.path, '{"hooks":{"Stop":null}}');
  assert.equal((await apply(home, project, chosen, undefined, { conflict: 'merge' })).complete, false);
  assert.equal(await fs.readFile(path.join(project, FORMAT_CONFIGS.claudecode.path), 'utf8'), '{"hooks":{"Stop":null}}');
  await write(project, FORMAT_CONFIGS.claudecode.path, '{}');
  await apply(home, project, chosen);
  const data = await readJSON(project, FORMAT_CONFIGS.claudecode.path);
  data.hooks.Stop[0].hooks[0].timeout = 99;
  await write(project, FORMAT_CONFIGS.claudecode.path, json(data));
  assert.equal((await apply(home, project, chosen, undefined, { conflict: 'merge' })).complete, false);
  assert.deepEqual(await readJSON(project, FORMAT_CONFIGS.claudecode.path), data);
});

test('detector skips external config and script links; shared config symlinks never write to their targets', async t => {
  const { root, home, project } = await fixture(t);
  await write(root, 'outside', '{}');
  await fs.symlink(path.join(root, 'outside'), path.join(project, '.prettierrc'));
  assert.equal((await detectFormatting(project)).status, 'no-config');
  await write(project, 'rustfmt.toml', '');
  await fs.mkdir(path.join(project, 'scripts'));
  await fs.symlink(path.join(root, 'outside'), path.join(project, 'scripts/format.sh'));
  assert.equal((await detectFormatting(project)).status, 'no-script');
  await fs.mkdir(path.join(project, '.codex'));
  await fs.symlink(path.join(root, 'outside'), path.join(project, '.codex/hooks.json'));
  const result = await apply(home, project, chosen, undefined, { conflict: 'merge' });
  assert.equal(result.complete, false);
  assert.ok((await fs.lstat(path.join(project, '.codex/hooks.json'))).isSymbolicLink());
  assert.equal(await fs.readFile(path.join(root, 'outside'), 'utf8'), '{}');
});

test('runtime skips absent tools, recursive events and concurrent executions, and releases locks on failure', async t => {
  const { project } = await fixture(t);
  await fs.mkdir(path.join(project, '.my-ai-infra'));
  await write(project, '.prettierrc', '{}');
  await write(project, 'scripts/format.sh', 'exit 0');
  assert.equal((await runFormatting(project, { env: { PATH: '' } })).status, 'skipped');
  for (const event of [{ permission_mode: 'plan' }, { stop_hook_active: true }, { loop_count: 1 }, { agent_id: 'subagent' }, { status: 'error' }]) assert.equal((await runFormatting(project, { event })).status, 'skipped');
  await script(project, 'setTimeout(() => {}, 500);\n');
  const pending = runFormatting(project);
  for (let i = 0; i < 100; i++) {
    if (await fs.stat(path.join(project, '.my-ai-infra/format.lock')).catch(() => null)) break;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.equal((await runFormatting(project)).status, 'skipped');
  assert.equal((await pending).status, 'formatted');
  await script(project, 'console.error("formatter failure"); process.exit(2);\n');
  const failed = await runFormatting(project);
  assert.equal(failed.status, 'failed'); assert.match(failed.output, /formatter failure/);
  await assert.rejects(fs.stat(path.join(project, '.my-ai-infra/format.lock')), { code: 'ENOENT' });
  await script(project, 'setInterval(() => {}, 1000);\n');
  assert.equal((await runFormatting(project, { timeout: 50 })).status, 'timeout');
  await assert.rejects(fs.stat(path.join(project, '.my-ai-infra/format.lock')), { code: 'ENOENT' });
});

test('deselecting Copilot removes only its format registration from shared GitHub files', async t => {
  const { home, project } = await fixture(t);
  await script(project);
  await apply(home, project, chosen);
  await write(project, '.github/hooks/team.json', '{"hooks":{}}\n');
  await write(project, '.github/workflows/test.yml', 'name: keep\n');
  await apply(home, project, { ...chosen, tools: ['codex'] });
  const remaining = await readJSON(project, FORMAT_CONFIGS.copilot.path);
  assert.equal(remaining.hooks, undefined);
  assert.equal(await fs.readFile(path.join(project, '.github/hooks/team.json'), 'utf8'), '{"hooks":{}}\n');
  assert.equal(await fs.readFile(path.join(project, '.github/workflows/test.yml'), 'utf8'), 'name: keep\n');
  assert.equal((await doctor(home, project)).healthy, true);
});

test('an existing npm format script executes without altering package metadata or running install', async t => {
  const { project } = await fixture(t);
  await fs.mkdir(path.join(project, '.my-ai-infra'));
  const pkg = json({ private: true, prettier: {}, scripts: { format: 'node task.mjs' } });
  await write(project, 'package.json', pkg);
  await write(project, 'task.mjs', "import fs from 'node:fs'; fs.writeFileSync('result.txt', process.cwd());\n");
  const result = await runFormatting(project);
  assert.equal(result.status, 'formatted', result.output);
  assert.equal(await fs.readFile(path.join(project, 'result.txt'), 'utf8'), project);
  assert.equal(await fs.readFile(path.join(project, 'package.json'), 'utf8'), pkg);
  await assert.rejects(fs.stat(path.join(project, 'node_modules')), { code: 'ENOENT' });
  await assert.rejects(fs.stat(path.join(project, 'package-lock.json')), { code: 'ENOENT' });
});

test('global setup never registers the project format hook', async t => {
  const { root, home } = await fixture(t), toolHome = path.join(root, 'tools');
  await fs.mkdir(toolHome);
  await setup(home, chosen.tools, toolHome, chosen.skills);
  for (const spec of Object.values(FORMAT_CONFIGS)) await assert.rejects(fs.lstat(path.join(toolHome, spec.path)), { code: 'ENOENT' });
  await assert.rejects(fs.lstat(path.join(toolHome, FORMAT_SOURCE)), { code: 'ENOENT' });
});

test('an installation failure rolls shared host configuration back to its exact original bytes', async t => {
  const { home, project } = await fixture(t);
  await script(project);
  const original = '{ "permissions": {"allow": ["Read"]} }\n';
  await write(project, FORMAT_CONFIGS.claudecode.path, original);
  const rename = fs.rename;
  let injected = false;
  fs.rename = async (from, to) => {
    if (!injected && to === path.join(project, '.my-ai-infra.json')) { injected = true; throw Error('injected install failure'); }
    return rename(from, to);
  };
  try { await assert.rejects(apply(home, project, chosen), /injected install failure/); }
  finally { fs.rename = rename; }
  assert.equal(injected, true);
  assert.equal(await fs.readFile(path.join(project, FORMAT_CONFIGS.claudecode.path), 'utf8'), original);
  await assert.rejects(fs.stat(path.join(project, FORMAT_CONFIGS.codex.path)), { code: 'ENOENT' });
  await assert.rejects(fs.stat(path.join(project, FORMAT_SOURCE)), { code: 'ENOENT' });
});
