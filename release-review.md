# 0.0.1 发布前审视

检查日期：2026-10-13。状态：已发布 @easyuseai/my-ai-infra@0.0.1，registry 安装验收通过。

## 本轮完善

- npm 生产文件白名单、可执行入口、Node.js 约束、锁文件、版本记录与来源说明；源码发布前执行 verify，打包时验证当前快照。
- CLI 补充版本查询、严格参数与位置参数检查、等号形式参数、工具与 Skill 交互选择、端口占用提示及正常关闭。
- 显式 upgrade 跟踪内置资产基线：备份并更新未修改资产，保留个人修改和未知基线文件；项目同步独立执行。
- Web 保留切换项目时未保存的默认偏好，失败后清理失效预览，提供直接打开 HTML 的连接提示。
- README、使用指南、故障排查、发布指南、CHANGELOG 和 THIRD_PARTY_NOTICES 覆盖初始化、升级、恢复、卸载边界与发布步骤。
- 新增实际 tarball 验收，隔离验证离线 npm exec/npx 入口、四种工具装配、Feature 目录初始化、重复同步、修改冲突保护、Web 静态资源与 API 认证。

## 验证证据

- macOS 上 Node.js v22.23.3 与 v24.12.0：初次完整回归各 74 项通过，无跳过。路径别名修复后，Node.js 22 相关 29 项回归通过。
- 最终 npm run verify 通过，Node.js v24.12.0 完整回归 75/75 通过，无跳过。
- 根仓库 npm test：1 项通过；git diff --check 通过；新增文件独立空白检查通过。
- 13 个 Skill 元信息、Eval 和递归资源检查通过；34 个 JavaScript/JSON 文件通过语法、JSON 解析与空白检查。
- npm ci --offline --ignore-scripts 通过，运行时依赖为零。
- 手动交互初始化选择 Claude Code、GitHub Copilot 与 3 个 Skill，生成配置一致。
- 实际发行包验收通过：具体文件数量与大小以重新生成的发行报告为准；文件清单、完整性及安装结果见 dist/release-report.json。生成产物不提交 Git。

实际验包发现并修复了 Feature 初始化及校验脚本通过目录别名运行时静默跳过入口的问题，已补充目录符号链接回归与 Skill Eval。

测试验证装配和程序行为。Windows/Linux 实机兼容性与四种 AI 工具的真实模型调用未在本轮验证。

## 发行前仍需负责人决定

仓库 URL、主页与问题反馈地址继续按负责人决定暂缓。项目已按负责人要求采用 MIT 许可证，9 个负责人提供的复制 Skill 的原始来源及分发授权仍需确认，详见 THIRD_PARTY_NOTICES.md。本次已由负责人在终端输入凭证完成发布，公共 registry 的版本与完整性已核对。

2026-10-13 公共 registry 查询返回 E404，仅表示当次未读取到公开包元信息。

后续修改后重新运行 npm run release:check，再按 docs/releasing.md 发布已验收的 tarball。

## @easyuseai/my-ai-infra 0.0.1 发行检查

按负责人指定变更 scope 与首发版本，当前完整测试 88/88 通过；打包验收结果见 dist/release-report.json。CLI 名称保持 my-ai-infra，registry 安装命令使用 @easyuseai/my-ai-infra。

发布命令已成功，公共 registry 已返回 0.0.1、latest 与匹配的 integrity；npm 处理完成后，已从全新缓存安装公开版本，版本查询、四种工具初始化、doctor 和 Web 验证全部通过。凭证仅在交互终端子进程中使用，临时认证配置已随进程退出清理。

## 0.0.2 单一内容源与简化初始化（未发布）

2026-10-14：按负责人要求暂缓发布。CLI 初始化仅选择工具，默认安装 catalog 全部 Skill；项目与全局入口以 .agents 为实体源，其他产品逐文件相对软链接。项目规则实体为 .agents/AGENTS.md；规则入口、Skill 正文与附属脚本、模板和引用均链接到对应实体。Web 继续支持项目 Skill 选择，并在预览中显示链接目标。

未修改的 0.0.1 受管副本迁移前备份，已有规则保留；本地改动、规则差异、异常链接和伪造状态拒绝应用。切换工具保留内容源；失败恢复原始文件、链接及状态。完整测试 100/100 通过，Node.js 22 新增菜单与内容源专项 12/12 通过。真实终端已确认只出现工具菜单、默认安装 10 项并生成共享链接。根 npm test 与 git diff --check 通过。分发验收结果见忽略的 dist/release-report.json；尚未发布到 npm。

## 0.0.2 发布结果

已公开发布 @easyuseai/my-ai-infra@0.0.2，latest 与 integrity 已核对。100/100 测试及实际分发包验收通过；从公共 registry 全新安装后，版本查询、四种工具初始化、全部 10 项 Skill、.agents 单一内容源与软链接、doctor 和 Web 均通过。临时认证配置已清理。
