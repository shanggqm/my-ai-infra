# 故障排查

| 现象 | 检查与处理 |
|---|---|
| `node` 不存在 / import 语法错误 | 运行 `node --version`，使用 Node.js 22+。 |
| npm 返回 E404 | 首次发布前使用本地 `.tgz`；发布后核对包名、版本和 registry。E404 不证明账号有权发布该名称。 |
| 双击 HTML 后空白、无样式或请求失败 | 使用 `my-ai-infra web` 输出的 `http://127.0.0.1:端口/#凭证` 链接。`file://` 无法提供本地 API。项目源码目录为 `my-ai-infra`，不带前导点。 |
| 端口 4317 被占用 | 使用 `my-ai-infra web --port 0` 自动分配空闲端口。 |
| 访问凭证失效 / 403 | 使用当前进程启动时输出的完整链接；重启后旧凭证会失效。不要公开分享带凭证的 URL。 |
| Project must be an existing directory / ENOENT | 创建或选定真实目录，确认路径与引号，并核对 `--home` 和 `--project` 没有嵌套。 |
| Conflicting files / Global Skill conflict | 项目 init / sync 默认 merge，交互终端可选 merge / replace / 终止，--conflict 显式指定；--conflict abort 遇冲突退出 2。先查看 plan 的逐项原因和 resolution。全局 setup 保持原有冲突保护；勿删除整个配置目录。 |
| changed since preview | 项目或资产在预览后改变，重新预览。应用失败后 Web 会禁用旧预览。 |
| 入口与中心规则都有不同的非空内容 | 默认 merge 保留中心正文，把入口原文归档为 local/ 候选并修复链接。需要人工核对并合入的内容可从 recovery 目录读取；abort 保留原现场。 |
| complete: false / skipped 非空 | 部分配置已完成；未知父目录链接或不可读路径保持原状。按逐项原因处理后重试；replace 只替换链接入口，不改外部目标。 |
| merge 后未采用新分发正文 | 本地同名资产优先保留，新正文存于 recovery/incoming/；核对后手动合入，或显式 --conflict replace 先备份再重置。 |
| 初始化后提示规则尚为空 | 文件与软链接已创建；按 nextSteps 执行对应工具的初始化，完成后 sync。doctor 健康表示装配一致，规则内容仍由项目维护。 |
| Another operation is running | 等待现有操作；确认相关进程已退出后，再处理个人库 `.lock`。不要删除仍在使用的锁。 |
| 旧名和新名同时存在 | 比较两份个人源并保留所需内容，解决重复后再迁移；不要静默删除一份。 |
| 初始化后找不到项目 Skill | 在目标目录运行 `mai doctor`，确认 `.agents/skills/<名称>/SKILL.md` 是普通文件。旧版文件软链接布局通过修复版 `mai sync` 迁移；同时核对实际执行的 `mai` 安装版本，源码修复不会自动更新全局命令。ChatGPT 用 `@` 选择 Skill，Codex CLI/IDE 用 `/skills` 或 `$`；列表未刷新时重新打开项目会话。 |
| Prompt 在菜单中缺失或重复 | 使用包含原生入口适配的版本运行 sync；Prompt 通过共享 Skill 和 Claude Skill 链接发现，受管旧 commands/prompts 会迁移。用 doctor.discovery 查看 needs-sync 和配置限制，刷新宿主会话；未受管同名命令先比较再自行处理。 |
| 修改 Skill 后项目未更新 | 个人库改动需对指定项目执行 plan / sync；项目内修改 .agents 实体会立即反映到软链接入口，本地改动会受到同步冲突保护。 |
| Builtin Skill / asset is read-only | 内置资产随 npm 维护；需要个人定制时使用新名称，按类型同步修改文件名、目录名或元信息，再导入个人库。 |
| Personal Skill conflicts with builtin | 未知来源同名目录受到保护；先保留原文并改名，再重试。不能通过修改 origin 绕过保护。 |
| upgrade 提示 skillMigrations | 旧内置副本已原样备份；按返回的 backup 路径检查正文及附件，改名后导入所需个人能力。 |
| Git worktree 辅助不可用 | 确认 Git、Bash、已提交的 HEAD、分支和目录状态；它不会自动安装依赖或共享 .env。 |

## 报告问题

提供包版本、Node/npm 版本、操作系统、可复现步骤、脱敏后的命令和错误信息。先在临时目录中复现，说明是否使用自定义 `--home`，以及 plan / doctor 的结果。

不要附带凭证、环境文件、完整个人库、私人需求素材或未脱敏日志。独立源码仓库和反馈地址尚未登记；正式发布前应确定可用的维护者联系渠道，不在文档中填写推测地址。

项目入口使用相对文件软链接。`0.0.3` 会检测受管链接被替换或改指向的情况；merge 保留安全的本地内容，遇到指向项目外部的父目录链接时跳过受影响资产并报告部分完成。明确选择 replace 时先备份链接本身，再建立本地目录，不写入外部目标。Windows 需要启用文件软链接权限，失败时安装器报错并回滚；请保留当前现场后处理系统权限。

`npm warn Unknown project config "shamefully-hoist"` 来自 npm 读取 pnpm 项目配置，与 my-ai-infra 的内容冲突独立；它本身不会触发 Conflicting files。
