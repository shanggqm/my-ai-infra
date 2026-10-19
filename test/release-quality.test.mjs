import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { apply, doctor, plan } from '../src/project.mjs';
import { PACKAGE, seed } from '../src/store.mjs';
import { hash, json, read, readJSON, write } from '../src/fs.mjs';

const run = promisify(execFile), cli = path.join(PACKAGE, 'bin/my-ai-infra.mjs');
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'my-ai-release-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const project = path.join(root, 'project with spaces'), home = path.join(root, 'personal');
  await fs.mkdir(project); return { root, project, home };
}
test('version/help are read-only and invalid command arguments cannot trigger installation', async t => {
  const { home, project } = await fixture(t);
  const expected = (await readJSON(PACKAGE, 'package.json')).version;
  for (const option of ['--version', '-v']) {
    const result = await run(process.execPath, [cli, option, '--home', home]);
    assert.equal(result.stdout.trim(), expected);
  }
  assert.match((await run(process.execPath, [cli, '-h'])).stdout, /upgrade/);
  for (const args of [['setup','--dry-run'],['init','extra'],['doctor','--tools','codex'],['asset','list','extra'],['web','--yes']]) {
    await assert.rejects(run(process.execPath, [cli, ...args, '--home', home], { cwd: project }));
  }
  await assert.rejects(fs.stat(home), { code: 'ENOENT' });
  assert.deepEqual(await fs.readdir(project), []);
});
test('equals options and tool aliases work with spaces in paths', async t => {
  const { home, project } = await fixture(t);
  await run(process.execPath, [cli, 'init', `--home=${home}`, `--project=${project}`, '--tools=claude,github-copilot', '--skills=my-create-feature', '--yes']);
  const config = await readJSON(project, '.my-ai-infra.json');
  assert.deepEqual(config.tools, ['claudecode','copilot']);
  assert.deepEqual(config.skills, ['my-create-feature']);
  assert.equal((await doctor(home, project)).healthy, true);
});
test('upgrade backs up tracked legacy builtin edits and leaves project copies unchanged', async t => {
  const { home, project } = await fixture(t);
  await apply(home, project);
  const original = await read(PACKAGE, 'assets/skills/my-create-prd/SKILL.md');
  const edited = original + '\nPersonal rule.\n';
  await write(home, 'assets/skills/my-create-prd/SKILL.md', edited);
  const baseline = await readJSON(home, 'bundle-state.json');
  baseline.files['assets/skills/my-create-prd/SKILL.md'] = hash(original);
  await write(home, 'bundle-state.json', json(baseline));
  await write(project, '.agents/skills/my-create-prd/SKILL.md', 'Project edit');
  const upgraded = JSON.parse((await run(process.execPath, [cli, 'upgrade', '--home', home])).stdout);
  assert.equal(upgraded.skillMigrations.length, 1);
  assert.equal(await read(upgraded.skillMigrations[0].backup, 'SKILL.md'), edited);
  assert.equal(await read(home, 'assets/skills/my-create-prd/SKILL.md'), null);
  assert.equal(await read(project, '.agents/skills/my-create-prd/SKILL.md'), 'Project edit');
});
test('upgrade rejects unknown builtin namesakes without changing personal data', async t => {
  const { home } = await fixture(t);
  const body = '---\nname: my-create-prd\ndescription: Unknown source\n---\nKeep this custom content.\n';
  await write(home, 'assets/skills/my-create-prd/SKILL.md', body);
  await assert.rejects(seed(home, { updateBuiltins: true }), /conflicts with builtin/);
  assert.equal(await read(home, 'assets/skills/my-create-prd/SKILL.md'), body);
  assert.equal(await read(home, 'bundle-state.json'), null);
});

test('Feature CLIs run through a directory alias instead of silently skipping main', async t => {
  const { root, project } = await fixture(t);
  const alias = path.join(root, 'script alias');
  await fs.symlink(path.join(PACKAGE, 'assets/skills/my-create-feature/scripts'), alias, 'dir');
  const initialized = JSON.parse((await run(process.execPath, [path.join(alias, 'init-feature.mjs'), '--project', project, '--slug', 'alias-smoke', '--title', '路径别名'])).stdout);
  assert.equal(initialized.created, true);
  const verified = JSON.parse((await run(process.execPath, [path.join(alias, 'validate-feature.mjs'), '--feature', initialized.path])).stdout);
  assert.equal(verified.valid, true);
});

test('validation rejects resource entries placed after the manifest deliverables section', async t => {
  const { root } = await fixture(t);
  const copy = path.join(root, 'package'); await fs.mkdir(copy);
  const pkg = await readJSON(PACKAGE, 'package.json');
  const entries = new Set([...pkg.files, 'scripts', 'package.json', 'manifest.yml', 'skill-inventory.md']);
  for (const relative of entries) {
    const target = path.join(copy, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.cp(path.join(PACKAGE, relative), target, { recursive: true });
  }
  const validator = path.join(copy, 'scripts/validate.mjs');
  await run(process.execPath, [validator]);
  const manifest = path.join(copy, 'manifest.yml');
  const original = await fs.readFile(manifest, 'utf8');
  const resource = '- assets/prompts/my-simple-feature.md\n';
  await fs.writeFile(manifest, original.replace(resource, '') + resource);
  await assert.rejects(run(process.execPath, [validator]), error => {
    assert.match(error.stderr, /Top-level resource list outside deliverables/);
    assert.match(error.stderr, /Missing extension deliverable: prompts\/my-simple-feature.md/);
    return error.code === 1;
  });
});
