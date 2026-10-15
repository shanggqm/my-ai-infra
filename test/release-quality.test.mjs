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
test('explicit upgrade updates tracked pristine assets, preserves edits, backs up replacements and does not sync projects', async t => {
  const { home, project } = await fixture(t);
  await seed(home);
  const prd = 'my-create-prd/SKILL.md', feature = 'my-create-feature/SKILL.md';
  const old = '---\nname: my-create-prd\ndescription: Previous bundled PRD\n---\nOld bundled workflow.\n';
  await write(home, 'assets/skills/' + prd, old);
  const baseline = await readJSON(home, 'bundle-state.json'); baseline.files['assets/skills/' + prd] = hash(old);
  await write(home, 'bundle-state.json', json(baseline));
  const edited = (await read(home, 'assets/skills/' + feature)) + '\nPersonal rule.\n';
  await write(home, 'assets/skills/' + feature, edited);
  const chosen = { version:1, tools:['codex'], skills:['my-create-prd','my-create-feature'] };
  await apply(home, project, chosen);
  const configBefore = await read(project, '.my-ai-infra.json'), defaultsBefore = await read(home, 'defaults.json');
  const upgraded = JSON.parse((await run(process.execPath, [cli, 'upgrade', '--home', home])).stdout);
  assert.ok(upgraded.updated.includes('skills/' + prd)); assert.ok(upgraded.preserved.includes('skills/' + feature));
  assert.equal(await read(home, 'assets/skills/' + prd), await read(PACKAGE, 'assets/skills/' + prd));
  assert.equal(await read(home, 'assets/skills/' + feature), edited);
  assert.equal(await read(project, '.agents/skills/' + prd), old);
  assert.equal(await read(project, '.my-ai-infra.json'), configBefore);
  assert.equal(await read(home, 'defaults.json'), defaultsBefore);
  const backup = (await fs.readdir(path.join(home, 'backups'))).find(p => p.startsWith('bundle-update-'));
  assert.equal(await read(home, `backups/${backup}/skills/${prd}`), old);
  const preview = await plan(home, project); await apply(home, project, preview.config, preview.revision);
  assert.equal((await doctor(home, project)).healthy, true);
});
test('upgrade conservatively preserves legacy assets without a known baseline', async t => {
  const { home } = await fixture(t);
  const body = '---\nname: my-create-prd\ndescription: Unknown legacy source\n---\nKeep this custom content.\n';
  await write(home, 'assets/skills/my-create-prd/SKILL.md', body);
  const result = await seed(home, { updateBuiltins: true });
  assert.ok(result.preserved.includes('skills/my-create-prd/SKILL.md'));
  assert.equal(await read(home, 'assets/skills/my-create-prd/SKILL.md'), body);
  assert.equal((await readJSON(home, 'bundle-state.json')).files['my-create-prd/SKILL.md'], undefined);
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
