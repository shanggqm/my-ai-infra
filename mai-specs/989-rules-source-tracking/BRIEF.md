# 989: 项目规则正文纳入版本管理

| 项 | 值 |
|---|---|
| Phase | review |
| Profile | standard |
| 优先级 | P1 |
| 负责人 | Zhong Virgil |
| 目标日期 | 待填 |
| 涉及子系统 | project、文档、测试 |

## 一句话描述

装配的 .gitignore 受管区块不再忽略 .agents/rules/，已有项目同步时移除旧规则

## 背景

0.0.9 起，`mai init` / `mai sync` 写入的 `.gitignore` 受管区块包含 `/.agents/rules/`。根目录 `AGENTS.md`、`CLAUDE.md` 与 `.github/copilot-instructions.md` 是指向 `.agents/rules/` 的相对软链接并提交进仓库，正文却被忽略，其他人克隆后这些入口全部断开。用户只能在区块外追加 `!/.agents/rules/`、`/.agents/rules/*`、`!/.agents/rules/AGENTS.md` 规避，本仓库自己的 `.gitignore` 也是这样做的。项目规则正文由项目维护，属于项目源码，应当和入口一起进入 Git。

## 关键决策

- 受管区块不再生成 `/.agents/rules/`；`.agents/.generated/`、`.my-ai-infra/`、恢复目录与已安装 Skill 副本等派生内容继续忽略。
- 已有项目同步时，`.gitignore` 增量合并只额外移除受管区块内的 `/.agents/rules/` 这一行旧规则；区块内其余行、区块外全部内容与换行风格保持原样。区块外用户写的同名规则或反向规则不做清理，需要继续忽略规则正文时写在区块外。
- 升级后、同步前，`doctor` 把 `.gitignore` 列为待更新，与其他资产升级一致。
- 编号取 989：脚本按 main 计算为 990，但 990 已由 `fix/windows-link-compat`（Windows 链接兼容）占用。
- 本仓库自身的 `.gitignore` 不在本次改动内。

## 验证

`test/existing-project.test.mjs` 新增两项，在临时 Git 仓库中用 `git check-ignore` 核对：新项目初始化后 `.agents/rules/AGENTS.md`、`.agents/rules/copilot-instructions.md` 不被忽略，派生文件仍被忽略（S-001、S-003）；带 CRLF、区块内用户行与区块外规避三行的旧区块同步后只移除旧规则，区块外按字节保留，再次 plan 为 noop、doctor 不报 `.gitignore`（S-002、S-003）。两项在修复前失败、修复后通过。

## 上下文索引

- [素材索引](context/_INDEX.md)
