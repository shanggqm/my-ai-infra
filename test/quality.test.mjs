import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { seed, setup } from '../src/store.mjs';
import { checkSkillResources } from '../scripts/check-skill-resources.mjs';

const exec = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
const wrapper = path.join(root, 'assets/skills/my-ai-infra/scripts/my-ai-infra.mjs');
async function fixture(t) {
  const dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'my-ai-quality-')));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return dir;
}
async function run(filename, args, cwd, env) {
  try { return { ...await exec(process.execPath, [filename, ...args], { cwd, env, timeout: 15000 }), code: 0 }; }
  catch (error) { if (typeof error.code !== 'number') throw error; return error; }
}

test('wrapper resolves explicit home before runtime import and leaves the environment store untouched', async t => {
  const dir = await fixture(t), home = path.join(dir, 'custom store'), wrong = path.join(dir, 'uninitialized');
  await seed(home);
  const env = { ...process.env, MY_AI_INFRA_HOME: wrong };
  const r = await run(wrapper, ['catalog', '--home', 'custom store'], dir, env);
  assert.equal(r.code, 0, r.stderr);
  assert.ok(JSON.parse(r.stdout).some(s => s.name === 'my-create-prd'));
  await assert.rejects(fs.stat(wrong), { code: 'ENOENT' });
  const repeated = await run(wrapper, ['--home', wrong, 'catalog', '--home', home], dir, env);
  assert.equal(repeated.code, 0, repeated.stderr);
  const equals = await run(wrapper, ['catalog', `--home=${home}`], dir, env);
  assert.equal(equals.code, 0, equals.stderr);
  const missing = await run(wrapper, ['catalog', '--home'], dir, env);
  assert.equal(missing.code, 1);
  assert.match(missing.stderr, /Missing value for --home/);
  assert.doesNotMatch(missing.stderr, /runtime/);
});

test('environment home works and a setup-bound wrapper retains its runtime binding', async t => {
  const dir = await fixture(t), home = path.join(dir, 'personal'), toolHome = path.join(dir, 'tools');
  await setup(home, ['codex'], toolHome);
  const direct = await run(wrapper, ['catalog'], dir, { ...process.env, MY_AI_INFRA_HOME: home });
  assert.equal(direct.code, 0, direct.stderr);
  const global = path.join(toolHome, '.agents/assets/skills/my-ai-infra/scripts/my-ai-infra.mjs');
  const result = await run(global, ['catalog'], dir, { ...process.env, MY_AI_INFRA_HOME: path.join(dir, 'wrong') });
  assert.equal(result.code, 0, result.stderr);
  assert.ok(JSON.parse(result.stdout).some(s => s.name === 'my-ai-infra'));
  const absent = await run(wrapper, ['catalog', '--home', path.join(dir, 'missing')], dir, process.env);
  assert.equal(absent.code, 1);
  assert.match(absent.stderr, /my-ai-infra.*setup/);
});

test('validator fails after deleting a required entry, referenced document, or script from a package copy', async t => {
  const dir = await fixture(t), copy = path.join(dir, 'package');
  await fs.cp(root, copy, { recursive: true, filter: p => !p.split(path.sep).some(part => ['node_modules', '.git', 'dist'].includes(part)) });
  const validate = path.join(copy, 'scripts/validate.mjs');
  const baseline = await run(validate, [], copy, process.env);
  assert.equal(baseline.code, 0, baseline.stderr);
  for (const relative of [
    'assets/skills/my-create-feature/SKILL.md',
    'assets/skills/my-ai-infra/scripts/my-ai-infra.mjs',
    'assets/skills/my-create-prd/references/interaction-and-copy.md',
  ]) {
    const target = path.join(copy, relative), saved = path.join(dir, 'saved');
    await fs.rename(target, saved);
    const r = await run(validate, [], copy, process.env);
    assert.equal(r.code, 1, relative + r.stdout);
    assert.match(r.stderr, /Skill resource/);
    await fs.rename(saved, target);
  }
});

test('resource checking distinguishes declared files from target-project template paths', async t => {
  const dir = await fixture(t), skill = path.join(dir, 'assets/skills/my-example');
  await fs.mkdir(path.join(skill, 'references'), { recursive: true });
  await fs.writeFile(path.join(skill, 'references/file with spaces.md'), 'resource\n');
  await fs.writeFile(path.join(skill, 'SKILL.md'), '[resource](<references/file with spaces.md>)\n`spec/output.md`\n```text\n[example](missing-template.md)\n```\n[external](https://example.invalid/)\n');
  await fs.writeFile(path.join(skill, 'references/guide.md'), '[reference][input]\n\n[input]: file%20with%20spaces.md\n');
  assert.deepEqual(await checkSkillResources(dir, ['my-example']), []);
  await fs.rm(path.join(skill, 'references/file with spaces.md'));
  const errors = await checkSkillResources(dir, ['my-example']);
  assert.equal(errors.length, 2);
  assert.ok(errors.every(e => e.includes('Broken Skill resource')));
  assert.ok(errors.some(e => e.includes('references/guide.md')));
});

test('Skill checks use only repository assets even when stale parent-course copies exist', async t => {
  const dir = await fixture(t), course = path.join(dir, 'course');
  const copy = path.join(course, 'learner-kit/code/my-ai-infra');
  await fs.cp(root, copy, { recursive: true, filter: p => !p.split(path.sep).some(part => ['node_modules', '.git', 'dist'].includes(part)) });
  for (const name of ['my-ai-infra', 'my-review-design', 'my-create-memory']) {
    const external = path.join(course, '.agents/skills', name);
    await fs.mkdir(external, { recursive: true });
    await fs.writeFile(path.join(external, 'SKILL.md'), `Stale external ${name}\n`);
    await fs.writeFile(path.join(external, 'external-only.md'), 'Must not be copied\n');
  }
  const build = await run(path.join(copy, 'scripts/build-skill.mjs'), [], copy, process.env);
  assert.equal(build.code, 0, build.stderr);
  for (const name of ['my-ai-infra', 'my-review-design', 'my-create-memory']) {
    const relative = `assets/skills/${name}/SKILL.md`;
    assert.equal(await fs.readFile(path.join(copy, relative), 'utf8'), await fs.readFile(path.join(root, relative), 'utf8'));
    await assert.rejects(fs.stat(path.join(copy, 'assets/skills', name, 'external-only.md')), { code: 'ENOENT' });
  }
  const checked = await run(path.join(copy, 'scripts/validate.mjs'), [], copy, process.env);
  assert.equal(checked.code, 0, checked.stderr);
});
