import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { initializeFeature } from '../assets/skills/my-create-feature/scripts/init-feature.mjs';
import { acquireWorkspaceLock, lockPath, readWorkspace, renderFeature, reserveFeature, table } from '../src/migrations/workspace.mjs';

// 迁移自带一份编号、ROADMAP 与锁规则；init-feature.mjs 保持不变。本文件逐例比对二者，防止漂移。
const roadmapRow = number => `# 需求路线图\n\n## 规划中\n\n| 需求 | 标题 | 规格 | 优先级 | 说明 |\n|---|---|---|---|---|\n| ${number} | 旧需求 | standard | P1 | 说明 |\n`;
const scenarios = {
  '空工作区': {},
  '连续占用': { dirs: ['999-a', '998-b'] },
  '存在空缺': { dirs: ['999-a', '997-c'] },
  '回绕到 999': { dirs: ['000-z'] },
  '仅 ROADMAP 占号': { roadmap: roadmapRow('999') },
  '目录与 ROADMAP 混合': { dirs: ['999-a'], roadmap: roadmapRow('998') },
  '旧 Feature- 编号': { dirs: ['Feature-1-old'], fails: /Legacy Feature-/ },
  '重复编号': { dirs: ['999-a', '999-b'], fails: /Multiple/ },
  '同名 slug': { dirs: ['999-same'], slug: 'same', fails: /already exists/ },
};

async function project(t, setup) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'mai-parity-')));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  for (const dir of setup.dirs || []) await fs.mkdir(path.join(root, 'mai-specs', dir), { recursive: true });
  if (setup.roadmap) { await fs.mkdir(path.join(root, 'mai-specs'), { recursive: true }); await fs.writeFile(path.join(root, 'mai-specs/ROADMAP.md'), setup.roadmap); }
  return root;
}

for (const [name, setup] of Object.entries(scenarios)) {
  test(`编号与 ROADMAP 与 init-feature 一致：${name}`, async t => {
    const slug = setup.slug || 'next-item', title = '示例标题', summary = '示例说明';
    const reference = await project(t, setup), migrated = await project(t, setup);
    const workspace = await readWorkspace(migrated);
    const snapshot = { names: workspace.names, reserved: [], roadmap: workspace.roadmap };
    const attempt = () => reserveFeature(snapshot, slug, { title, priority: 'P1', profile: workspace.profile, summary });
    if (setup.fails) {
      await assert.rejects(initializeFeature({ project: reference, slug, title, summary, owner: '待填' }), setup.fails);
      assert.throws(attempt, setup.fails);
      return;
    }
    const created = await initializeFeature({ project: reference, slug, title, summary, owner: '待填' });
    const reserved = attempt();
    assert.equal(reserved.name, path.basename(created.path));
    assert.equal(snapshot.roadmap, await fs.readFile(path.join(reference, 'mai-specs/ROADMAP.md'), 'utf8'));
    const brief = await fs.readFile(path.join(created.path, 'BRIEF.md'), 'utf8');
    const rendered = await renderFeature({
      FEATURE_ID: reserved.id, TITLE: title, PRIORITY: 'P1', PROFILE: workspace.profile, OWNER: table('待填'), TARGET_DATE: table('待填'),
      MODULES: table('待补充'), SUMMARY: summary, BACKGROUND: '待补充。', MATERIAL_ROWS: '', FINDINGS: '', QUESTIONS: '',
    });
    assert.equal(rendered.find(([file]) => file === 'BRIEF.md')[1], brief);
  });
}

test('迁移锁与 init-feature 使用同一把锁并互斥', async t => {
  const root = await project(t, { dirs: ['999-a'] });
  assert.equal(lockPath(root), path.join(root, 'mai-specs', '.feature-init.lock'));
  const held = await acquireWorkspaceLock(root);
  await assert.rejects(initializeFeature({ project: root, slug: 'blocked', title: '被锁', owner: '待填' }), /Another initializer/);
  await held.release();
  await assert.rejects(fs.access(lockPath(root)));
  await initializeFeature({ project: root, slug: 'after-release', title: '释放后', owner: '待填' });
});
