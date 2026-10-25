# 993 测试与验证记录

执行日期：2026-10-25。环境：macOS / Node.js v24.12.0。测试均使用隔离个人库、项目与全局安装前缀，未在真实用户项目执行格式化或安装 Hook。

## 当前证据

| 条件 | 覆盖与结果 |
|---|---|
| AC-01 | CLI init / dry-run 无配置时不装配 Hook；根目录限定、非格式化 pyproject、外部配置链接跳过。通过。 |
| AC-02 | 四宿主配置结构、注册与脚本依赖、实际安装入口的执行通过；真实客户端事件调度待验。 |
| AC-03 | 15 种常见配置样例、package manager 选择、Make / Just 目标、真实 npm script、缺脚本/运行工具跳过。通过。 |
| AC-04 | init 不执行脚本、安装后的脚本从其他 cwd 启动仍使用项目根、原格式化配置和 package 元数据保持、无 node_modules/lockfile 生成。通过。 |
| AC-05 | 用户宿主设置与其他 Hook 保留、重复 sync、配置移除、取消 Copilot、全局 setup 不接入。通过。 |
| AC-06 | 格式化配置/脚本变更使预览失效；损坏 JSON、无效 Stop 结构、受管 handler 修改、共享配置链接保护；注入失败后精确回滚原字节。通过。 |
| AC-07 | 同项目并发跳过、规划模式/递归/续跑/已知子任务跳过、失败状态、进程超时、锁释放与安装包缺脚本正常退出。通过。 |

`test/format-hook.test.mjs` 新增 28 个自动化案例。其他装配、存储、Web API 与资产测试沿用项目完整回归。

- `npm run release:check`：通过，包含最终 `npm run verify`（build:skill、lint、validate、277 项测试全部通过），并实际打包、离线隔离安装和执行本 Hook。报告为忽略产物 `dist/release-report.json`，未发布 npm。
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' MAI_WEB_ARTIFACT_DIR=dist/format-hook-web npm run test:web`：7 组通过。默认 Playwright 浏览器缓存缺失，改用本机 Chrome 完成。报告与截图位于忽略产物 `dist/format-hook-web/`。
- Feature 路径校验与本地文档链接核对：通过。
- `git diff --check`：通过。

## 未验证与适用边界

- 未通过真实 Codex / Claude Code / Cursor / Copilot 会话触发事件，`hostVerified` 保持 false。Codex 的信任操作仍由宿主处理。
- 未做独立代码评审或 Windows 原生 shell 验收。配置适配和命令执行的当前运行证据来自 macOS。
- 已有格式化脚本按其原有范围运行；全仓脚本可能处理已有脏文件。Hook 不推断文件参数，不自动添加格式化配置。
- JSONC 共享宿主配置保留现场，自动合并只支持标准 JSON；异常进程终止可能遗留格式化锁，需确认进程状态后处理。

本次记录是实现验证证据；真实宿主触发未验收前，Feature 保持 review。

## 0.0.14 发行复验

2026-10-25，经负责人授权发布 `0.0.14`。本节记录后续发行，前文保留实现阶段的检查结果。

- `npm run release:check` 通过：276 项自动化测试及 17 组实际安装包检查，启用 Codex/Claude 资产发现。
- `npm run test:web` 通过：8 组浏览器回归，使用本机 Chrome。
- 发布后 7 组固定版本检查通过，包含旧 Prompt 清理、当前工作流 Skill 安装、四工具装配、格式化脚本执行、个人 Skill 保留和 Web 鉴权。
- npm `latest`、integrity、下载包 SHA-256 与 GitHub 附件一致。源码标签提交为 `4e2012b468180c80fab678a3d4a9da8b038b61c1`，SHA-256 为 `4f747ccca20b446384b2449769e742ecddfffe17fc4887cafb44f2e30ea7ee49`。
- 本地证据：`dist/release-0.0.14/release-report.json`、`dist/release-0.0.14/web/report.json`、`dist/release-0.0.14/postpublish.json`；公开发行见 [v0.0.14](https://github.com/shanggqm/my-ai-infra/releases/tag/v0.0.14)。

发行未补齐前述模型行为和真实宿主事件验收，Feature 保持 review。
