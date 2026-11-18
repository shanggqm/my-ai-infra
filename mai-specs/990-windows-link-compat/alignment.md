---
document: alignment-card
task: "990-windows-link-compat"
status: confirmed
mode: 先看样品
updated: "2026-11-10"
---

# 对齐卡：Windows 链接与共享规则兼容

> 主卡控制在一屏；用户在对话中明确确认后把 `status` 改为 `confirmed`。

出卡原因：改变 `init` / `doctor` 在 Windows 和已有共享规则项目中的用户可见结果。

目标：在 Windows 上，`mai init` 之后 `mai doctor` 能如实报告健康；已有 `CLAUDE.md → AGENTS.md` 的项目初始化后，Claude Code 仍能读到原有规则。
方案：读链接时在 win32 上把 `\` 统一为 `/` 再比较；规则迁移把 `CLAUDE.md → AGENTS.md` 识别为与 AGENTS 共用中心源。
产出：`src/entries.mjs`、`src/conflicts.mjs`、`src/rules.mjs` 的修复，`test/existing-project.test.mjs` 的新用例，以及本目录下的 BRIEF 与验证记录。
预计时间：<1h

## 输入 → 输出

- 输入：项目中的链接入口（`fs.readlink` 原始值），以及已有的 `AGENTS.md` / `CLAUDE.md`。
- 输出：`plan` / `apply` / `doctor` 的动作和冲突判断。链接比较一律使用 POSIX 形式，`.my-ai-infra/state.json` 的格式不变。

## 样例

| 样例 ID | 输入 | 应该得到 | 为什么 | 怎么检查 |
|---|---|---|---|---|
| S-001 | Windows 新项目执行 `init --tools codex,claudecode`，再执行 `doctor` | `healthy: true`，没有任何“链接目标与预期不符”；随后 `sync` 为 noop | mai 自建的链接读回来是 `..\..\x`，但它和 `../../x` 是同一个目标 | Windows 上运行 `node --test test/agents.test.mjs test/conflicts.test.mjs test/existing-project.test.mjs`，与基线对比；另在临时项目实测 |
| S-002 | 已有非空 `AGENTS.md`（普通文件）和 `CLAUDE.md → AGENTS.md`（即 DSH 的布局），选 claudecode 执行 `init` | `AGENTS.md` 和 `CLAUDE.md` 都链接 `.agents/rules/AGENTS.md`，正文逐字等于原 `AGENTS.md`；不生成 `.agents/rules/CLAUDE.md`；没有冲突，`doctor` 健康 | 这是 Claude Code 的常见共享写法，应按 [usage.md](../../docs/usage.md) 的共享关系保留 | 新增跨平台用例 |
| S-003（边界） | `CLAUDE.md → AGENTS.md`，但 `AGENTS.md` 本身是指向项目外的链接；另一条：Linux 上目标名里本来就含 `\` | 第一条保持现有冲突，不跟随未知目标；第二条在 POSIX 上不做转换 | 不放宽“未知链接不跟随”的安全边界；`\` 在 POSIX 上是合法的文件名字符 | 新增用例覆盖第一条；第二条通过代码限定 `win32` 保证，并在 Linux 上由现有测试确认没有回归（本机无法执行） |

## 需要你决定

- `.gitignore` 受管区块忽略整个 `/.agents/rules/`，但根目录的 `AGENTS.md` 链接会被提交，其他人克隆后就是断链（DSH 已手动加取反规则绕过，本仓库也是这样做的）。要不要把它纳入本次修复？我建议**本次不改**，单独作为后续 Feature 讨论。理由：这会改变所有项目对规则文件的跟踪方式，牵涉 `usage.md` 的忽略契约，和本次两个缺陷相互独立。

## 我替你做的假设

- 只在 `process.platform === 'win32'` 时转换分隔符。
- 共享识别只接受 `CLAUDE.md → AGENTS.md`，而且 `AGENTS.md` 必须是普通文件或已登记的规则链接；其他目标仍按未知链接处理。
- 测试代码里直接比较 `fs.readlink` 原始值的断言，以及找不到 `/bin/bash` 的 13 个用例，都属于 Windows 测试环境问题，本次不修；交付时报告 Windows 全量测试的失败数相对基线（276 个用例中失败 109 个）的变化。

## 不做

- 不改 `.gitignore` 的忽略策略（见上方待决定项）。
- 不改测试基础设施，不调整 Windows 上的 bash 依赖。
- 不提交 DSH 仓库，不发布 npm 包。

## 运行方式

- 档位：先看样品。
- 首份成品：先修缺陷 1，用 S-001 检查；再修缺陷 2，用 S-002、S-003 检查。全部完成后在 DSH 里执行只读的 `mai plan` / `mai doctor` 复核。

## 确认记录

- 日期与用户原话：2026-11-10，“确认，开始”（采纳建议：`.gitignore` 忽略策略本次不改）
- 变更：
