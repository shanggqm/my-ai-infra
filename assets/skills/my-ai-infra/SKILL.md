---
name: "my-ai-infra"
description: "使用全局 mai 命令维护 my-ai-infra 个人资产库和目标项目中的 AI 资产。适用于‘新增一个全局个人 Skill’‘把项目 Skill 收进个人库’‘修改全局或当前项目的资产’‘给项目增减或同步 Skill’及资产装配、配置和检查。单独创作 Skill 内容、执行开发任务或提炼个人记忆时，使用对应专用 Skill。"
compatibility: "需要 Node.js 22+，且全局 mai 命令在 PATH 中可用。"
metadata:
  author: "andy"
  source: "assets/skills/my-ai-infra/SKILL.md"
---

# my-ai-infra 资产维护

在目标项目目录中，将用户的资产维护需求映射为 `mai` 命令，完成所请求范围内的变更和验证。重点处理全局个人资产库与项目资产之间的新增、导入、编辑、装配和同步。

## 职责与入口

- 用户明确提及个人库、项目资产、安装入口或同步配置时，由本 Skill 承接维护流程。复合请求包含内容创作时，使用可用的 `skill-creator` 等专用 Skill 完成内容，再继续入库或装配；普通“帮我写一个 Skill”交给内容创作 Skill。
- 需求分析、PRD、技术设计、编码、评审、测试、worktree 和个人记忆提炼/管理由对应专用 Skill 处理。CLI 支持这些辅助命令，不构成本 Skill 扩大触发范围的理由。
- 在目标项目工作目录直接调用全局 `mai`。先用 `command -v mai` 和 `mai --version` 确认入口，需要时查看 `mai --help`。不要求项目存在 `scripts/`，不切到 Skill 目录，不使用内部 wrapper 作为调用入口。若命令缺失，报告安装前提；用户授权安装时使用已知包 `@easyuseai/my-ai-infra`。
- 目标项目取用户给定路径，否则取当前工作目录；读取项目说明和已有 `.my-ai-infra.json`。命令示例中的 PATH 换成实际绝对路径，路径含空格时加引号。
- 个人库按 `--home`、`MY_AI_INFRA_HOME`、默认 `~/.my-ai-infra` 确定，自定义库的每条命令都携带同一 `--home`。不改个人 runtime 或 npm 内置源码来定制资产。

## 先确定维护位置

| 位置 | 查看方式 | 变更路径 |
|---|---|---|
| 全局个人资产库 `<home>/assets/` | `mai catalog`、`mai asset list`，读取返回的个人源 | `mai asset import` 新增，`mai asset edit` 修改入口正文 |
| 目标项目 `.agents/<类型>/` | `mai config --project PATH` 和实际文件；`mai doctor --project PATH` 检查漂移 | 项目定制直接编辑项目源；从库装配用 `mai plan` → `mai init/sync` |
| 全局工具入口，实体位于用户目录 `.agents/` | setup 输出及实际入口 | `mai setup` 更新当前版本支持的全局入口，具体限制见下文 |

`mai catalog` / `mai asset list` 列出库中可用资产，不能替代项目目录盘点。项目源、个人库源与全局入口分别维护。只改项目时不写回个人库；只入个人库时不自动安装入口或同步已有项目。作用域无法从表达、路径或配置判断且会影响写入位置时，先确认该作用域。

## 全局个人资产维护

| 用户需求 | 操作 |
|---|---|
| “看看个人库有哪些 Skill / Agent / 资产” | `mai catalog` / `mai agents` / `mai asset list`；按类型用 `mai asset list --type TYPE`，用 origin 区分 builtin 与 personal |
| “把这个项目 Skill 收进个人库” | 检查完整目录、名称及资源，再 `mai asset import /absolute/my-skill`，回读库中新增项 |
| “新增一个全局个人自定义 Skill” | 按下方创建并入库流程完成，不停留在操作建议 |
| “修改个人库里的 Skill” | 读取当前个人源，准备更新文本，`mai asset edit NAME --file /absolute/updated.md --type TYPE`，回读验证；Skill 可省略 type |
| “导入 Agent / Hook / MCP” | `mai asset import /absolute/source --type TYPE`；TYPE 取 agents、hooks 或 mcp，再 `mai asset list --type TYPE` 验证 |
| “以后项目默认选择这些资产” | `mai defaults` 读取，再 `mai defaults --skills FULL_LIST`；工具偏好用 `--tools FULL_LIST`，不同步已有项目 |
| “打开资产管理界面” | `mai web --project PATH`，返回实际本地链接并保持进程；端口占用用 `--port 0` |
| “刷新内置资产 / runtime” | `mai upgrade` 使用当前安装包版本刷新 runtime，报告迁移和恢复路径；该命令不下载新版 npm 包，也不自动同步项目 |

### 创建并入库

1. 从请求提取用途、触发条件与输入输出，仅补问实际缺失信息。查询 catalog 排查内置名、兼容别名与个人名冲突。自有名称默认 `my-动作-对象`，目录名与 frontmatter name 一致。
2. 使用可用的内容创作 Skill 在临时或指定目录生成并校验完整资产；不因创作而改项目配置。没有辅助 Skill 时，在本次明确的资产创建范围内完成必要内容与校验。仅创建实际需要的资源，核对相对引用和脚本行为。
3. `mai asset import /absolute/staging/my-skill` 导入完整文本目录。含二进制或符号链接时说明导入限制，处理资源方案后再继续，不静默丢失附件。
4. `mai catalog` 确认 `origin: personal`，回读个人源确认正文和附属文件完整，报告实际路径。用户要求项目可用时继续该项目的装配流程。

导入仅新增，同名拒绝覆盖，无需修改内置 catalog。所有内置资产通过 CLI / Web 只读；定制内置 Skill 时改目录名、frontmatter name 与内部引用，以个人资产导入。个人资产在 npm 升级和卸载后保留。

### 编辑边界与格式

- `mai asset edit` 修改入口正文并备份。附件、名称或目录结构变更没有批量编辑命令；按授权保留恢复副本后维护个人源，不用同名 import 绕过保护。删除资产也没有专用 CLI 命令，先定位影响范围再按明确授权处理具体文件。
- Skill 为包含 `SKILL.md` 的完整文本目录；Agent 为中立 Markdown 文件。保留作者与来源信息。
- Hook、MCP 和扩展类型为含 `asset.json` 的文本目录，清单声明 name、description、entry、targets 及可选 globalTargets。工具仅装配文件，不自动执行 Hook、启动 MCP 或替换宿主整份共享配置。格式不明时参考当前可用的同类型资产，不臆造清单字段。

## 目标项目资产维护

### 从个人库或内置库装配

1. `mai config --project PATH` 读取配置，`mai catalog` 核对可用 Skill。工具优先沿用已有选择，首次装配且无偏好时简短询问；可选 codex、claudecode、cursor、copilot。
2. 增减 Skill 或工具时计算完整目标清单，保留用户未要求改动的项。`--skills` / `--tools` 接收逗号分隔完整清单；不要将“加一个”传成“只保留一个”。取消项目工具可能整体备份并移除对应专属目录，需在预览中明确影响。
3. 先 `mai plan --project PATH`，再按相同工具、Skill 和冲突策略执行 `mai init --project PATH --conflict merge --yes` 或 `mai sync --project PATH --conflict merge --yes`。需要调整选择时，plan 与写入命令都传同一 `--skills FULL_LIST` / `--tools FULL_LIST`。首次装配用 init，已有项目同步用 sync。
4. `mai doctor --project PATH` 检查装配结果，并核对用户要求的具体资产。用户只要求查看或诊断时，停留在 config、plan、doctor 与文件读取。

新项目未保存固定清单时默认选择全部可用 Skill，已有默认或项目选择优先。显式 `--skills` 固定清单，CLI 暂无专用开关恢复自动全部选择。Agent 随依赖 Skill 选择，其他资产按工具与清单适配，不臆造通用 `--assets` 选择参数。

### 直接维护项目内容

- “只修改当前项目的某个 Skill”：先核对文件及链接归属，再编辑 `.agents/skills/<名称>/` 实体并验证所改内容；未知外部软链接不直接写其目标；其他工具的相对链接共享该实体。不要用 `mai asset edit` 写到全局库，也不要为保存项目内容额外 sync。
- “给当前项目创建独有 Skill”：由内容创作 Skill 生成到项目 `.agents/skills/`。需要其余工具入口时检查 CLI 的可装配来源；未入库的项目独有 Skill 不能凭名称加入库清单。说明限制，不自动把项目私有内容导入全局库。
- “调整项目 Agent”：修改 `.agents/agents/` 中立源，按 plan / sync 流程更新派生入口；检查 merge 下的候选与保留内容，不直接编辑 `.agents/.generated/`。
- “把项目定制推广为个人资产”：按用户授权将完整资产导入个人库；已有同名个人项走编辑流程。内置同名须先改名，再针对指定项目同步。
- 项目运行规则位于 `.agents/rules/`，保持原有共享链接和正文。若工具报告空规则，转达 nextSteps；不把资产装配扩展为编写业务规则或推进 SDD 开发。

## 全局入口、冲突与结果

`mai setup --tools FULL_LIST --yes` 维护全局入口，并保存默认偏好；先读 `mai defaults`，保留既有选择，检查 setup 的实际输出。setup 会保留此前安装但本次未选的工具，不能用它卸载全局工具。当前 setup 全局安装管理入口、可选记忆入口及所选 Agent 的依赖 Skill；`--skills` 不会将任意个人 Skill 自动安装到全局。遇到“让这个个人 Skill 在全局可调用”，先说明这个能力边界，再按用户明确的宿主与范围处理入口方案；入库成功不能报告为全局安装成功。全局装配没有 `doctor --global`。

项目冲突默认 merge：保留本地内容、补缺并保存候选；replace 先备份再替换；abort 遇冲突终止。沿用用户授权和指定策略，无需为常规预览重复索要确认。检查 complete、recovery、review、skipped 和 nextSteps；部分完成或冲突未处理时明确报告。旧受管副本迁移保留备份，未知来源同名资产保持现场。

最终报告维护位置、具体变更、验证结果和未完成项。区分已入库、已安装入口、已同步项目及宿主实际可用，不把装配检查作为宿主调用证据。维护本 Skill 时更新或执行 [行为评测](evals/cases.md)。
