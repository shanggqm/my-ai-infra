import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { metadata, importAsset, catalog, saveAsset } from '../src/store.mjs';

test('frontmatter accepts double/single quoted scalars and legacy plain/folded descriptions', () => {
  for (const name of ['my-example', '"my-example"', "'my-example'"]) {
    assert.equal(metadata(`---\nname: ${name}\ndescription: "中文说明包含 \\"引号\\" 和冒号: 值"\nmetadata:\n  author: "andy"\n---\n`, 'my-example'), '中文说明包含 "引号" 和冒号: 值');
  }
  assert.equal(metadata("---\nname: my-example\ndescription: >-\n  第一行\n  第二行\nmetadata:\n  author: other\n---\n", 'my-example'), '第一行 第二行');
  assert.equal(metadata("---\nname: 'my-example'\ndescription: '用户的 ''引用'' 文本'\n---\n", 'my-example'), "用户的 '引用' 文本");
  for (const header of ['name: "other"\ndescription: "中文"', 'name: "my-example"\ndescription: ""', 'name: "my-example\ndescription: "中文"']) {
    assert.throws(() => metadata(`---\n${header}\n---\n`, 'my-example'), /Invalid Skill metadata/);
  }
});

test('quoted personal Skill import and edit preserve metadata and third-party attribution', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'my-ai-metadata-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const source = path.join(root, 'my-example'), home = path.join(root, 'personal');
  await fs.mkdir(source);
  const original = '---\nname: "my-example"\ndescription: "中文导入场景"\ncompatibility: "需要测试输入。"\nmetadata:\n  author: "original-author"\n  source: "assets/skills/my-example/SKILL.md"\n---\n\n保留正文。\n';
  await fs.writeFile(path.join(source, 'SKILL.md'), original);
  await importAsset(home, source);
  const asset = (await catalog(home)).find(a => a.name === 'my-example');
  assert.equal(asset.description, '中文导入场景');
  assert.equal(asset.content, original);
  await saveAsset(home, asset.name, original + '\n补充说明。\n', asset.revision);
  const changed = (await catalog(home)).find(a => a.name === asset.name);
  assert.match(changed.content, /author: "original-author"/);
  assert.match(changed.content, /补充说明/);
});
