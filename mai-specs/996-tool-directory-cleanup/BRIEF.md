# 996: 取消 Coding 工具时清理专属目录

| 项 | 值 |
|---|---|
| Phase | completed |
| 优先级 | P1 |
| 负责人 | andy |
| 目标日期 | 待填 |
| 涉及子系统 | project、CLI、Web、备份回滚 |

## 一句话描述

CLI 与 Web 取消工具后整体备份并清理专属目录，保留 .agents 真源和共享仓库设施

## 背景

0.0.10 逐文件移除只清理空的父目录，工具根目录和旧残留仍保留。用户要求取消工具后默认清理专属目录。

## 关键决策

- 已初始化项目对未选工具执行目录级移除，兼容旧版本已从安装记录移除文件但仍留下目录的情况；首次安装保留未选工具目录。
- `.codex`、`.claude`、`.cursor` 整体备份后移除，包含本地配置、未知文件与空目录；不跟随外部软链接。
- `.github` 保留，只移除 Copilot 的 skills、agents、prompts、instructions 目录和专属规则入口；`.copilot` 为独占目录。
- `.agents` 保留仍选用的 Skill、中立 Agent、项目规则和停用工具的扩展源；工具派生 Agent 格式仍按配置重建。
- 复用 plan/apply 事务：目录内容摘要参与预览 revision；完整归档、写入前检查和失败回滚覆盖目录清理。
- 写入失败时按逆序移除本次新建的空父目录，避免回滚后留下停用工具残余；共享 `.github` 为未知链接时，各策略均保留路径。
- CLI 与 Web 共用实现；独立取消 Skill 继续遵守原有本地内容保护策略。

## 验证

`test/asset-removal.test.mjs` 覆盖 CLI/Web 取消工具、旧残留、重选、备份、外部链接、过期预览、失败回滚及扩展源保留；`scripts/check-web.mjs` 通过真实浏览器取消 Claude Code 并核对项目目录。

2026-10-17 验证通过：`npm run verify`（231 项测试通过）、`npm run test:web`（含真实浏览器取消 Claude Code）、目录清理专项 9 项、`git diff --check`、Feature 路径校验和父课程仓库 `npm test`（1 项）。未发布新的 npm 版本。

## 上下文索引

- [素材索引](context/_INDEX.md)
