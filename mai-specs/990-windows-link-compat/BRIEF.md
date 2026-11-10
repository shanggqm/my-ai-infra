# 990: Windows 链接与共享规则兼容

| 项 | 值 |
|---|---|
| Phase | review |
| Profile | simple |
| 优先级 | P1 |
| 负责人 | Zhong Virgil |
| 目标日期 | 待填 |
| 涉及子系统 | src/fs.mjs,src/entries.mjs,src/conflicts.mjs,src/rules.mjs,test |

## 一句话描述

Windows 上 init/doctor 正确识别 mai 自建链接与已有 CLAUDE.md→AGENTS.md 共享关系

## 背景

在 Windows 上给 DSH 仓库执行 0.0.14 的 `mai init` 时发现两个缺陷：

- Windows 上 `fs.readlink` 返回 `\` 分隔的目标，与安装器写入和记录的 POSIX 目标直接比较时总是不等。mai 自己创建的链接会被判为“链接目标与预期不符”，`doctor` 无法报告健康。本仓库在 Windows 上的全量测试 276 个中失败 109 个，主要就是这个原因。
- 已有 `CLAUDE.md → AGENTS.md` 的项目（Claude Code 的常见共享写法）被当成未知链接。`merge` 之后，`CLAUDE.md` 指向新建的空文件 `.agents/rules/CLAUDE.md`，Claude Code 从此读不到原有规则。

## 关键决策

- 读链接统一经过 `readLink`（`src/fs.mjs`）：只在 `win32` 上把 `\` 换成 `/`。POSIX 上 `\` 是合法的文件名字符，不做转换。`state.json` 格式不变。
- 当 `AGENTS.md` 是普通文件，或是指向 `.agents/rules/AGENTS.md` 的受管链接时，把 `CLAUDE.md → AGENTS.md` 识别为共享关系，两个入口都链接 `.agents/rules/AGENTS.md`。其他目标仍按未知链接处理并报冲突，不跟随。
- `.gitignore` 受管区块忽略整个 `/.agents/rules/`，而根入口链接会被提交，导致其他人克隆后断链。用户确认本次不改，留作后续单独讨论，见 [对齐卡](alignment.md)。
- 样例与验收依据见 [对齐卡](alignment.md)（已确认）。

## 验证记录（Windows 11，Node 24.15.0）

2026-11-10 在 0.0.14 上完成首轮验证；2026-11-18 变基到 0.0.15（含 MiniMax Code 适配）后，重跑全量回归、新用例和静态检查。

| 样例 | 检查 | 结果 |
|---|---|---|
| S-001 | 本地 CLI 在隔离的临时项目和个人库中执行 `init --tools codex,claudecode`，再执行 `doctor` 和 `sync --dry-run`（0.0.14） | pass：`healthy: true`，0 个问题；sync 为 125 noop、6 preserve，0 冲突 |
| S-001 | Windows 全量 `node --test test/*.test.mjs` 与同一基线的 main 对比 | pass：0.0.14 上失败数 109 → 27；0.0.15 上 111 → 29，没有稳定的新增失败；“链接目标与预期不符”从 816 次降到 0 次 |
| S-002 | 新用例 `an existing CLAUDE alias of a root AGENTS file joins the shared source…` | pass（修复前 fail） |
| S-003 | 新用例 `a CLAUDE alias of an AGENTS link to an unknown target stays a conflict…`；POSIX 不转换由 `win32` 判断保证 | pass（修复前即通过，作为防回归）；Linux/macOS 上 not_run |
| 复核 | 本地 CLI 对 DSH 执行只读 `doctor` / `plan` | pass：原有 8 处冲突清零；只剩 `.my-ai-infra/state.json` 一项更新，原因是安装记录由 0.0.14 写入 |

- `npm run build:skill`、`npm run lint`、`npm run validate` 均通过。完整的 `npm run verify` 在 Windows 上会因为剩余失败退出非零。
- 0.0.15 上剩余 29 个失败：28 个在 main 上同样失败，其中 15 个因为用例启动 `/bin/bash` 或 `/bin/sh`（worktree、format hook、CLI 脚本），其余 13 个未逐个归因，0.0.14 时其中 4 个已确认是测试代码直接比较 `fs.readlink` 的原始值；另 1 个是 `refreshRuntimeAssets` 重命名目录时偶发的 `EPERM`，单独重跑 2 次均通过。这些都不在本次范围内。
- 未验证：Linux/macOS 全量回归、`npm run test:web`、`npm run release:check`，以及独立代码评审。

## 上下文索引

- [对齐卡](alignment.md)
- [素材索引](context/_INDEX.md)
