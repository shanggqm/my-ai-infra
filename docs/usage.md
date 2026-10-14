# 使用指南

全局安装 `npm install --global @easyuseai/my-ai-infra@0.0.5` 后，在目标项目目录执行 `mai init` 初始化，执行 `mai web` 启动该项目的本地工作台。`mai` 与 `my-ai-infra` 共用入口，所有命令和选项均可互换。

`init` / `sync` 在终端中按配置选择、冲突检查、备份应用三个阶段展示进度，完成后分别列出文件统计、恢复记录与下一步操作。工具菜单支持彩色焦点与选中标记；执行阶段使用等待动画。设置 `NO_COLOR=1` 关闭颜色，`TERM=dumb` 关闭颜色和等待动画；标准输出重定向时保留 JSON，不输出动画。`plan` / `--dry-run` 继续输出完整 JSON 预览。

## Web 首页与变更预览

运行 `mai web` 后，使用终端链接打开首页。点击“配置当前项目”或“进入工作台”开始操作；侧栏“首页”可随时返回介绍页。

在项目页选择工具与 Skill，点击“预览变更”打开独立窗口。顶部可切换冲突策略，摘要显示各类型文件数量；搜索与显示范围用于筛选明细，链接目标可展开查看。更改策略后需重新预览，“应用到项目”始终使用当前预览。应用过程中等待结果，完成后在同一窗口查看后续初始化提示及恢复记录。

Esc、关闭按钮和遮罩可关闭预览，返回配置继续调整；正在应用时暂时禁止关闭。首页使用全宽浅色背景与深浅橙色齿轮动画，鼠标向右移动会明显加速，向左移动可减速并反转，停下后平滑恢复基础转速。动画遵循系统减少动态偏好，离开首屏后暂停。

## 命令与退出码

| 命令 | 作用 | 主要选项 |
|---|---|---|
| `init` | 初始化或同步一个项目 | `--project`、`--tools`、`--yes`、`--dry-run` |
| `plan` | 只读查看差异 | `--project`、`--tools` |
| `sync` | 显式同步一个项目 | `--project`、`--tools`、`--dry-run` |
| `doctor` | 检查安装漂移 | `--project` |
| `config` | 查看项目配置 | `--project` |
| `catalog` / `asset list` | 查看可用资产 | `--home` |
| `defaults` | 查看或修改新项目默认项 | `--tools` |
| `setup` | 安装/更新全局入口 | `--tools`、`--yes` |
| `upgrade` | 升级个人库与 runtime | `--home` |
| `asset import PATH` | 导入文本 Skill 包 | `--home` |
| `asset edit NAME` | 修改正文并备份 | `--file`、`--home` |
| `web` | 启动本地配置器 | `--project`、`--port`、`--home` |

所有命令支持 `--home`；`--help` / `-h` 查看帮助，`--version` / `-v` 查看版本。无效参数和额外位置参数会报错。返回 `0` 表示成功，`1` 表示错误或 doctor 发现未初始化/安装漂移；项目内容冲突和 Feature 初始化附属脚本的冲突返回 `2`；报错包含路径、原因及只读 plan 的处理指引。

路径含空格时加引号。项目目录必须已经存在；无 `--project` 时使用当前目录。个人库和目标项目必须分开，不能互相嵌套。

```bash
my-ai-infra init --project "/path/to/my repo" --home "/path/to/personal assets"
my-ai-infra web --project "/path/to/my repo" --home "/path/to/personal assets" --port 0
```

## 选择工具与 Skill

工具值为 `codex`、`claudecode`、`cursor`、`copilot`；CLI 也接受 `claude`、`claude-code`、`github-copilot`。

从 `0.0.2` 起，交互式 `init` / `setup` 只展示工具多选菜单，Skill 默认全部安装。工具菜单：↑/↓ 移动、空格切换选中、`a` 全选/清空、Enter 确认。已有工具偏好默认勾选；至少保留一项。Esc 或 Ctrl+C 取消，取消时不安装资产、不写入项目。标准输入或输出未连接终端时使用已保存选择；脚本建议显式传入工具；Skill 默认全部安装。项目 `init` / `sync` 的 `--yes` 跳过工具和冲突策略选择，默认按 merge 处理；可通过 `--conflict merge|replace|abort` 明确指定策略。全局 `setup` 仍保护同名修改并报告冲突。

配置 `.my-ai-infra.json` 只有三个字段：

```json
{
  "version": 1,
  "tools": ["codex", "copilot"],
  "skills": ["my-create-feature", "my-create-prd", "my-implement-code"]
}
```

工具与 Skill 列表不能为空。名称与兼容别名以 `catalog` 输出为准；`my-create-code` 等旧名解析到 canonical 名，不重复安装。未知配置字段会被拒绝。

## 维护个人资产

个人源位于个人库 `assets/skills/`，项目中的副本供 AI Coding 工具消费。先修改个人源，再显式同步指定项目。新建 Skill 默认使用中文元信息：

```yaml
---
name: "my-review-api"
description: "对照接口契约审查实现及测试。"
compatibility: "需要目标项目接口规格与当前代码。"
metadata:
  author: "andy"
  source: "assets/skills/my-review-api/SKILL.md"
---
```

名称为 1–64 个小写字母、数字和单连字符，头部 name 与目录名相同。自有资产默认 `my-动作-对象`，第三方资产保留原作者与来源。`metadata.source` 记录源入口，内置资产使用 npm 包根目录的相对路径。

读取器支持 JSON 兼容的双引号字符串、单引号字符串、旧版无引号及折叠/字面量多行说明；它读取必要字符串字段，不提供任意 YAML 对象解析或代码求值。文档产出用 `create`，实现用 `implement`，审查用 `review`。

```bash
my-ai-infra asset import /path/to/my-review-api
my-ai-infra asset edit my-review-api --file /path/to/updated-SKILL.md
```

导入同名资产会停止；编辑正文会校验最新摘要并备份旧内容。正文编辑不处理附属资源，修改资源时应保留恢复副本。二进制资源和符号链接不在自定义导入范围内。Web 支持搜索、新建、正文编辑、未保存保护与 Ctrl/⌘+S；在另一页面编辑默认偏好不会同步全部项目。

## 升级与恢复

`0.0.3` 移除 `my-verify-feature`，旧选择会自动剔除该项。项目同步时，未修改的受管文件可安全移除，修改过的副本会报告冲突；个人库原文件、已有路径契约及验收报告保留。若配置中只剩该项，使用 `sync --skills my-review-code` 或在 Web 选择可用 Skill 后应用；工具不会自动替换成其他步骤。

固定版本可重现安装；使用 `@latest` 明确获取后续版本：

```bash
npx --yes @easyuseai/my-ai-infra@latest upgrade --home /path/to/personal
npx --yes @easyuseai/my-ai-infra@latest plan --project /path/to/repo --home /path/to/personal
npx --yes @easyuseai/my-ai-infra@latest sync --project /path/to/repo --home /path/to/personal
npx --yes @easyuseai/my-ai-infra@latest doctor --project /path/to/repo --home /path/to/personal
```

`bundle-state.json` 记录本工具曾写入的内置文件摘要。显式 upgrade / setup 更新仍匹配该基线的内置文件；个人修改与没有可信基线的旧文件保持原状，并在 upgrade 结果中列为 preserved。普通 init/sync 保持当前个人源，避免预览期间隐式改写正文。新增包内资源会补齐，个人附加文件不会自动删除。

升级替换前的内容位于 `backups/bundle-update-*`；个人正文修改和命名迁移也有各自备份。项目更改的旧文件与 journal 位于 `<项目>/.my-ai-infra/backups/`。需要恢复时先停止相关写入，按具体操作的备份核对文件，恢复旧内容或删除该次新建且未被人工修改的文件，再重新 plan。安装记录也要与恢复后的状态一起核对；保留 journal，不用整目录删除代替恢复。

安装包降级不会自动回滚个人正文与项目文件；恢复具体资产后，再用所需版本预览并同步。没有一键清空个人库或卸载所有项目文件的命令。`npm uninstall --global my-ai-infra` 仅移除全局 npm 命令，个人资产、工具入口和项目文件保留。

Web 升级后需重启进程。全局入口已经绑定个人 runtime；若需修改全局工具选择，使用相应版本重新 setup。不能将个人 runtime 当源码发布仓库。

## 新建需求的目录编号

my-create-feature 的脚本在 mai-specs/ 下创建 NNN-<slug> 需求目录，编号从 999 递减，低于 000 回到 999，并跳过现有目录与索引占用的编号。AI 无需计算编号，直接使用脚本返回的 ID 和路径。旧命名等冲突由脚本报告，不自动迁移或覆盖已有需求。

脚本评测入口：node --test test/feature-init.test.mjs test/feature-layout.test.mjs，覆盖顺序编号、循环与占号、冲突保留、并发及错误恢复。

## 单一内容源与已有项目兼容

`0.0.4` 统一使用 `.agents/assets/<类型>/` 保存项目资产，Codex 的 `.agents/skills/` 与其他工具目录均为相对软链接入口。全局 setup 使用用户主目录 `.agents/assets/`。个人库与分发包采用 `assets/<类型>/`，完整扩展清单见 [统一资产管理](../assets/README.md)。

项目规则正文由项目作者维护，不注入 SDD 正文或共享流程引用。已有不同正文的 AGENTS.md、CLAUDE.md 和 Copilot 原生规则分别备份、迁移到 .agents/assets/rules/ 下的独立文件，原入口改为相对软链接。已有根规则即使对应工具未选中也迁移。新建 CLAUDE.md 时，AGENTS.md 是唯一内容源，两个根入口都直接链接 .agents/assets/rules/AGENTS.md；只选 Claude Code 也创建此中心文件和 AGENTS.md 入口，后续新增 Claude Code 同样复用已有 AGENTS.md。未选 Claude Code 时不新建 CLAUDE.md；Copilot 对应 .github/copilot-instructions.md，继续独立管理。切换偏好保留已有规则与入口，删除安装记录后也能识别并保留共享关系。

CLI 输出 JSON 的 nextSteps 记录空规则的初始化提示，成功应用后也在终端单独显示；Web 在预览和成功提示中显示。Codex / Claude Code 在各自会话中执行 /init；Copilot 执行 copilot init；Cursor 使用 Agent 对话补全 AGENTS.md。具体命令及官方说明见 [项目规则入口](#项目规则入口)。安装器不自动运行这些命令；doctor 健康表示安装一致，空规则仍需用户补全。

通过规则软链接编辑内容会更新中心文件，sync 保留这些正文修改。如果外部工具把空规则链接替换成普通文件，sync 会将新正文归入中心文件并恢复链接；中心文件与入口均有不同非空内容时，默认 merge 保留中心正文，把入口原文归档为 local/ 候选，再恢复链接。选择 abort 时保留现场并退出 2。中心文件仍有内容而入口副本为空时，保留中心正文。

CLI 初始化默认安装全部可用 Skill；Web 可按项目选择，sync 保留项目配置。旧 --skills 参数保持脚本兼容，不参与交互选择。

.gitignore 增量补缺并去重，保留已有规则、注释、换行和显式反向规则。删除安装记录后留下的旧片段不会仅因没有旧 hash 而阻止安装。项目规格文档只补缺，已有正文保留。CLI 与 Web 默认 merge，交互终端发现冲突时提供 merge / replace / 终止单选。使用 --conflict 显式指定策略；--yes 或非交互环境采用默认 merge。plan 返回 conflicts、review、skipped、complete 与逐项 resolution，链接项包含 target。冲突内容的恢复方式与不同类型处理见 [初始化冲突处理](#初始化冲突处理)。

merge 以本地优先的目录合并补齐资产，同名不同正文保留候选；脚本和结构化文件不盲目拼接。合并后保留的本地资产记录 preserve 标记，普通同步和 doctor 尊重这些项目定制；显式 replace 才重置它们。安装状态无效时备份后重建，不使用未经校验的旧路径删除文件。merge 会备份损坏的忽略标记，再保留其他内容并重建有效标记。目录或二进制占位归档后装配，未知父目录链接保持原状并跳过依赖入口；此时部分配置可应用，但 complete 为 false，CLI 退出 2，doctor 不宣称健康。

旧版 SDD 片段只有与公开 0.0.1/0.0.2 的生成正文摘要相符，或与原安装记录 hash 相符，才会备份后清理。标记不完整、重复或正文有无法确认的修改时保留并提示；不要通过删除整个目录来掩盖差异。已知旧规则共享链接迁移到 .agents/assets/rules/ 下各自的文件，再移除旧共享源。旧生成内容清理后为空时，按所选工具保留空中心文件与有效入口。安装器不扫描或修改任意其他项目规则文件。

项目状态升级到 version 3，可读取 version 1/2 的旧记录。备份目录 journal 保存 before/after 类型、原文或链接目标；恢复时同步核对安装记录。降级到旧版本不会自动恢复已清理的旧 SDD 片段。

复制项目时保留符号链接；Windows 需要文件软链接权限。系统拒绝创建链接时，安装器报错并回滚。


`asset list` 列出所有类型，`--type` 可筛选。`asset import PATH --type agents` 导入中立角色文件；`asset import NAME.md --type prompts` 导入带单行 `description` frontmatter 的 Prompt，名称来自文件名，工具路径由安装器统一映射。Hook、MCP 和新类型通过 `asset import DIR --type TYPE` 导入带 `asset.json` 的目录。`asset edit NAME --type TYPE --file PATH` 和 Web 资产页编辑该资产入口；修改后显式同步目标项目。Prompt 自动适配已选工具，其他扩展资产按清单声明安装。

## 同一个测试 Skill 在不同阶段调用

[my-create-test-plan](../assets/skills/my-create-test-plan/SKILL.md) 聚焦业务验收与测试缺口，按用户意图和信息成熟度选择本次工作，增量维护一份 `TEST_PLAN.md`。

| 调用时机 | 示例请求 | 主要产出 |
|---|---|---|
| 需求和设计阶段 | 用 my-create-test-plan 梳理 999-search 的业务验收场景 | 场景、可观察预期与待确认项 |
| 开发中或提测前 | 对照已有测试，为 999-search 补齐 AI 可执行的业务用例 | 已有覆盖引用、待验用例与执行条件 |
| 需求或实现变化后 | 更新 999-search 受本次变更影响的用例 | 局部更新与需要复验的范围 |
| 明确执行验收 | 用 my-create-test-plan 对 999-search 当前版本执行业务验收 | 实际结果、证据与未覆盖部分 |

示例编号替换为实际 Feature 路径。单元、组件、常规接口及必要集成测试由实施流程完成；本 Skill 引用覆盖和结果，缺失时列补测项，不再生成一套同义用例。纯后端的完整业务链路也可单独验收。

只规划时无需额外安装工具；执行 Web 验收复用宿主浏览器能力，缺少时才补一套浏览器适配。只请求方案不启动测试或浏览器。计划完成、测试通过与项目批准分别处理，保持原 Phase。

### 相关环节的提醒与独立执行

`my-create-prd`、`my-create-design`、`my-review-design`、`my-implement-code` 和 `my-review-code` 会在各自流程中检查业务测试缺口。有需要时说明建议动作与理由，已有覆盖或已安排的任务不重复提醒。

确定开展且授权覆盖后，默认通过宿主 SubAgent 独立运行 `my-create-test-plan`，主任务继续无依赖的工作；只有影响当前判断的必要证据保持待办或阻塞。规划授权与实际验收授权分别判断。产物、输入基线、资源隔离、结果回收及能力不足时的处理统一遵循 [独立委派约定](../assets/skills/my-create-test-plan/references/delegation.md)。该约定使用现有 SubAgent 能力，不新增必装角色。

## 个人长期记忆

`0.0.4` 新增 `memory get / recall / bind / put / save / delete` 与 Web“个人记忆”。项目配置可包含稳定 `projectId`，只在首次绑定时生成；普通 sync 保留它。全局偏好配置 defaults.json 继续仅保存工具与 Skill 选择。完整说明见[个人记忆指南](memory.md)。

## 项目规则入口

空规则由项目作者在目标项目中初始化；安装器负责集中存放与软链装配。

- Codex：启动 `codex` 后执行 `/init`，补全 AGENTS.md（[官方命令说明](https://developers.openai.com/codex/cli/slash-commands)）。
- Claude Code：启动 `claude` 后执行 `/init`，补全 CLAUDE.md（[官方命令说明](https://code.claude.com/docs/zh-CN/commands)）。
- Cursor：在 Agent 对话发送“请读取仓库，补全根目录 AGENTS.md 中的项目运行原则、命令和约束”（[规则支持](https://cursor.com/docs/context/rules)）。
- Copilot：执行 `copilot init`，或在 CLI 会话执行 `/init`（[官方命令说明](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference)）。

文件已存在时，可让对应工具补全已有内容。新建的 AGENTS.md 与 CLAUDE.md 共用源，Codex、Cursor、Claude Code 可选一个生成原则；原有独立规则保持独立。通过现有链接写入后内容立即集中生效；如果初始化工具将空链接替换成普通文件，执行 `my-ai-infra sync --project .` 重新归入中心目录。已有两份不同的非空内容时，先合并差异后再同步。

## 初始化冲突处理

`init` / `sync` 会在写入前集中检查计划安装和移除的路径，包括 Skill / Agent、运行规则、父目录类型、文件链接、配置、安装记录与忽略标记。无关文件保持原状。交互终端发现冲突时用方向键选择处理方式，Enter 默认选择 merge；完成后显示简短摘要与恢复目录。`--yes` 和非交互命令直接采用默认策略，非交互输出保持 JSON。Web 提供相同策略，并要求重新预览后应用。

| 策略 | 行为 |
|---|---|
| `merge`（默认） | 补缺，保留同名本地文本；多工具 Skill 副本集中到 `.agents`，优先已有中心内容，否则采用首个本地副本。不同版本保存为合并候选，不直接拼接脚本、YAML 或运行约束。 |
| `replace` | 先备份，再使用待安装内容；目录和二进制占位也会归档，外部链接仅更换链接入口，不修改目标。 |
| `abort` | 有冲突时终止，项目保持原状。 |

```bash
my-ai-infra init --project . --conflict merge
my-ai-infra sync --project . --conflict replace
my-ai-infra plan --project . --conflict abort
```

成功结果的 `recovery` 给出恢复目录，通常为 `.my-ai-infra/backups/<操作ID>/`。其中 `before/` 保留原文件、二进制与链接，`incoming/` 和 `local/` 保存不同版本，`journal.json` 记录变更。目录占位整体移入备份，失败时恢复；状态目录本身被占用时采用项目内独立的 `.my-ai-infra-recovery-<操作ID>/`。

merge 保留的本地资产继续受到保护，后续普通同步沿用它；需要明确采用分发版本时使用 replace。`review` 列出需要人工核对的差异。不能安全处理的父目录链接或不可读路径保留并列入 `skipped`，其他配置继续装配；此时 `complete: false`、CLI 退出 2，Web 明确显示部分完成。正确指向 `.agents` 的 Skill 目录链接可直接复用。核心 API 保留默认 abort，CLI 与 Web 的默认策略为 merge。

## 环境与支持范围

需要 Node.js 22+ 和 npm；Git worktree 辅助能力另需 Git 与 Bash。当前验证环境为 macOS，Windows / Linux 尚未逐平台完成全部验收；Windows 使用软链需要相应权限。

CLI 与 Web 在本机运行，无遥测。开发偏好保存在本地个人库，项目同步由用户显式发起；团队审批、远程资产市场和跨项目自动升级不在当前功能范围内。
