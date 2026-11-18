---
document: alignment-card
task: "989-rules-source-tracking"
status: confirmed
mode: 先看样品
updated: "2026-11-18"
---

# 对齐卡：项目规则正文纳入版本管理

出卡原因：改变用户可见产出（`mai init` / `mai sync` 写入的 `.gitignore`），且影响所有已装配项目的 Git 跟踪范围。

目标：根目录 `AGENTS.md`、`CLAUDE.md`、`.github/copilot-instructions.md` 是提交进仓库的相对软链接，它们指向的 `.agents/rules/` 正文也要进 Git，其他人克隆后链接不再断开。
方案：`src/project.mjs` 生成受管区块时去掉 `/.agents/rules/`；已有项目同步时，从受管区块中移除这一行旧规则（只动区块内这一行）。
产出：一个英文 Conventional Commit（`src/project.mjs`、测试、`docs/usage.md`、`CHANGELOG.md` 未发布段、本 Feature 记录）。
预计时间：<1h

## 输入 → 输出

- 输入：目标项目现有 `.gitignore`（可能无文件、有旧版区块、有用户在区块外写的规避规则）。
- 输出：受管区块不含 `/.agents/rules/`；区块内其余行、区块外全部内容按字节保留；`.agents/.generated/`、`.my-ai-infra/`、安装的 Skill 副本等派生内容仍被忽略。

## 样例

| 样例 ID | 输入 | 应该得到 | 为什么 | 怎么检查 |
|---|---|---|---|---|
| S-001 | 空目录 `git init` 后 `mai init`（四种工具 + `my-create-feature`） | `git check-ignore .agents/rules/AGENTS.md`、`.agents/rules/copilot-instructions.md` 均不命中；`git add -A` 后正文与根链接同时进入暂存区 | 本次缺陷的原始症状：根链接已提交、目标被忽略 | 新增 `node --test` 用例，在临时仓库里调用 `git check-ignore` |
| S-002 | 已有项目：`.gitignore` 受管区块含 `/.agents/rules/` 与用户手加的 `/private/`，区块之后有用户规避三行 `!/.agents/rules/`、`/.agents/rules/*`、`!/.agents/rules/AGENTS.md`，CRLF 换行 | 同步后区块内 `/.agents/rules/` 被移除，`/private/` 保留；区块外三行与换行风格按字节不变；再次同步为 noop，`doctor` 健康 | 迁移只撤回 mai 自己写过的那一行，不替用户清理区块外规则（边界情况） | 同上，断言文本与二次同步结果 |
| S-003 | S-001 与 S-002 的结果 | `git check-ignore` 仍命中 `.agents/.generated/codex/agents/x.toml`、`.my-ai-infra/state.json`、`.agents/skills/my-create-feature/SKILL.md` | 派生目录和安装副本由 `mai sync` 重建，仍不进 Git | 同上 |

## 需要你决定

- 迁移时，区块外用户写的规避三行要不要顺手清理？我建议**不动**：它们在区块外、属于用户内容，`docs/usage.md` 承诺保留；修复后它们只是冗余（`/.agents/rules/*` 仍会忽略 `AGENTS.md` 之外的规则文件，如 `copilot-instructions.md`），在文档里说明可自行删除即可。
- 本仓库自己的 `.gitignore` 里同样有这三行规避与旧区块，要不要一起更新？我建议**不动**：本次只改分发逻辑，改本仓库装配状态需要在本仓库跑 `mai sync`，会顺带改动其他受管行，单独处理更清楚。

## 我替你做的假设

- Feature 编号用 989：脚本按 main 计算得到 990，但 990 已被 PR #16（`fix/windows-link-compat`）占用，手动改为 989 避免两个 PR 合并后撞号。
- 受管区块内的 `/.agents/rules/` 一律视为 mai 写入的旧规则并移除；想继续忽略规则正文的用户需把规则写在区块外（文档说明）。
- 升级 mai 后、执行 `sync` 前，`doctor` 会把 `.gitignore` 列为待更新，与其他资产升级的表现一致，不另做处理。
- 用户在区块外写了 `!/.agents/rules/` 等反向规则时，新区块本来就不再写 `/.agents/rules/`，无需额外判断。

## 不做

- 不改 `.agents/assets/` 等其他历史遗留忽略行，不改 Windows 下 `core.symlinks=false` 的检出行为。
- 不在本仓库运行 `mai sync`，不改本仓库 `.gitignore`。
- 不发布 npm 包；推送 Fork 与向 upstream 开 PR 前另行征得同意。

## 运行方式

- 档位：先看样品（默认）
- 首份成品即全部改动（只有一个组件）：S-001～S-003 先写成失败用例 → 修复 → 用例通过，跑 `build:skill`、`lint`、`validate` 与相关 `node --test`，本地提交后停下，等你同意再推送 Fork 并向 upstream 开 PR。

## 确认记录

- 2026-11-18，用户原话：“继续修复”（此前已说明两项待决定事项均建议不动，按建议执行）
- 变更：旧 → 新 → 原因
