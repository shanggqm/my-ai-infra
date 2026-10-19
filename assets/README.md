# AI 资产唯一源

此目录统一保存分发资产，按类型分目录。所有内置资产（Skill、Agent、Prompt、Hook、MCP 及扩展类型）统一从当前发行包读取，CLI / Web 只读；个人资产独立保存。

| 类型 | 结构 | 原生适配 |
|---|---|---|
| Skill | `skills/<名称>/SKILL.md` 与附属文件 | Codex 直接使用源文件，其他工具逐文件相对软链接 |
| SubAgent | `agents/<名称>.md` | 从中立源生成原生格式，原生入口链接到派生文件 |
| Prompt | `prompts/<名称>.md`，frontmatter 提供 `description` | 安装器统一映射工具路径，安装相对软链接 |
| Hook / MCP / 扩展类型 | `<类型>/<名称>/asset.json` 与文本文件 | 清单声明入口和工具路径，安装相对软链接 |

项目源位于 `.agents/`，个人库源位于 `<home>/assets/`，全局入口源位于用户目录 `.agents/`。项目运行规则单独保存在项目 `.agents/rules/`，正文由项目维护。

Agent 原生格式保存在 `.agents/.generated/<工具>/agents/`，属于可重建的派生结果。编辑 `agents/<名称>.md` 后运行 sync；工具格式文件的手工修改会受到冲突保护：abort 停止，merge 保存修改候选后从中立源重建，replace 备份后重建。转换格式的正文仅来自对应角色源。

## Skill 来源与个人库

内置资产从当前包的 `assets/<类型>/` 读取，标记 `origin: builtin`、`readOnly: true`。个人资产保存在 `<home>/assets/<类型>/`，标记 `origin: personal`；默认 home 为 `~/.my-ai-infra`，支持 `--home` 或 `MY_AI_INFRA_HOME`。来源独立于类别，CLI 与 Web 均显示。

```bash
mai asset import .agents/skills/my-team-review
mai catalog
mai init --project /path/to/new-project
```

导入完整文本目录，仅支持新增；同名个人或内置 Skill（含别名）均拒绝覆盖。内置定制需先修改目录名、frontmatter name 及内部引用，再以个人 Skill 导入。个人正文仍可通过 asset edit 或 Web 编辑。新项目未保存固定清单时包含全部可用 Skill，已有选择继续保留。

`init` / `sync` / `setup` 直接使用当前包的全部内置资产，无需先执行 `upgrade`。npm 升级不修改个人资产，卸载保留个人库与项目文件，重新安装可继续发现个人资产。旧受管内置副本完整移入备份，未知来源同名冲突需先改名；详见[升级与恢复](../docs/usage.md#升级与恢复)。

## Skill 附属资源

Skill 的 `references/` 保存按需读取的决策规范，`assets/templates/` 保存生成产物时使用的模板，`evals/` 保存行为评测。安装与同步按完整 Skill 目录处理。例如 [my-create-test-plan](skills/my-create-test-plan/SKILL.md) 聚焦业务验收用例与开发测试缺口，复用项目测试计划模板，执行时按需读取最小依赖说明。

[my-analyze-debt](skills/my-analyze-debt/SKILL.md) 自带债务分类、报告约定和模板，可单独安装并分析项目或模块，比较全局最优与 MVP 方案后让用户选择下一步。原则与流程保留在入口，具体线索、反例及输出细则按需读取；已有阶段只检查与当前变更相关的债务，不依赖该 Skill。报告默认写入项目 `docs/technical-debt/`，明确关联 Feature 时遵守其报告路径；项目模板可覆盖默认模板，方案比较和用户选择信息仍须保留。

## Prompt

内置 [四个 Prompt](prompts/README.md)：`my-auto-feature`、`my-auto-design`、`my-simple-feature` 组合原子 Skill 适配场景；`my-init-repo-memory` 依据仓库事实生成或精简优化根目录 `AGENTS.md`。每个资产只需单个 Markdown，无需单独目录和清单。名称取文件名，描述来自 frontmatter；各工具原生入口通过 共享 Skill 入口读取同一 Markdown。安装、调用与宿主兼容边界见[自定义 Prompt 指南](../docs/custom-prompts.md)。

```bash
my-ai-infra asset import /path/to/my-shortcut.md --type prompts
my-ai-infra asset edit my-shortcut --type prompts --file /path/to/my-shortcut.md
my-ai-infra sync --project /path/to/project
```

旧清单式个人 Prompt 保持兼容；同名新旧源同时存在时报冲突，保留现场。

## 扩展清单

例如 `hooks/check/asset.json`：

```json
{
  "name": "check",
  "description": "项目检查脚本",
  "entry": "check.sh",
  "targets": {
    "claudecode": ".claude/hooks/check.sh"
  },
  "globalTargets": {
    "claudecode": ".claude/hooks/check.sh"
  }
}
```

同目录放置 `check.sh`。清单中的目标路径必须位于对应工具目录内，且使用独立子目录，不能占用 Skill、Agent 目录或整份宿主配置。只在清单显式声明且用户选中的工具安装入口；`globalTargets` 缺省表示不安装全局入口。

```bash
my-ai-infra asset import /path/to/check --type hooks
my-ai-infra asset import /path/to/reviewer.md --type agents
my-ai-infra asset list
my-ai-infra asset edit check --type hooks --file /path/to/check.sh
my-ai-infra sync --project /path/to/project
```

Hook 脚本、MCP 服务定义和未来类型使用相同清单。资产安装负责文件装配，不自动执行脚本或启动服务。需要写入 `.claude/settings.json`、`.mcp.json`、Codex 配置等共享配置时，须另行实现对应宿主的结构化配置适配；当前通用清单拒绝用单份资产替换共享配置。新增类型无需修改存储、备份和冲突流程。

CLI 与 Web 的资产清单、编辑界面包含所有类型。Web 新建按钮创建 Skill；其他类型先使用 CLI 导入 Prompt、角色文件或扩展目录，然后可在 Web 编辑入口正文。项目初始化默认包含适用于所选工具的扩展资产；Agent 继续随其依赖的 Skill 选择。

## 迁移

- 个人库旧 `skills/`、`agents/` 移到 `assets/`，原内容移入备份；新旧路径内容不同则停止并报告。
- 项目旧 `.agents/assets/<类型>/` 的受管资产迁移到 `.agents/<类型>/`，Skill 和 Agent 中立源直接保存文件；更新工具链接，备份旧内容，仅清理空旧目录，未登记的用户文件留在原处。
- 各工具的旧 Agent 文件迁成链接。未修改的受管文件可直接转换；修改内容遵循 merge / replace / abort 策略，并保留恢复材料。
- 运行规则原文迁移到 `.agents/rules/`，AGENTS.md 与 CLAUDE.md 的共享关系保持。
- `plan` 和 `doctor` 只读；迁移在显式安装、同步或升级时执行。

阶段共用协议及类型定义位于 [my-create-feature/references](skills/my-create-feature/references/stage-contracts.md)。简版 PRD/设计模板随所属 Skill 分发，只有一份源；项目 `_templates/simple/` 可覆盖，已存在产物增量维护。
