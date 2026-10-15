---
name: "my-ai-infra"
description: "初始化或同步项目的个人 AI Coding SDD 基础设施、选择工具与 Skill，或打开本地配置工作台。用于用户要求给项目装配 SDD 流程、修改 AI Coding 配置或维护个人 Skill 资产。"
compatibility: "需要 Node.js 22+ 和 my-ai-infra 本地命令或已安装的入口脚本。"
metadata:
  author: "andy"
  source: "assets/skills/my-ai-infra/SKILL.md"
---

# 个人 AI Coding 基础设施

使用本 Skill 的 `scripts/my-ai-infra.mjs` 调用已安装的本地工具。全局安装的 wrapper 绑定个人资产库中的稳定 runtime，可在 npx 缓存清理后继续使用。

包内或项目副本 wrapper 在导入 runtime 前按 `--home`、`MY_AI_INFRA_HOME`、默认 `~/.my-ai-infra` 的顺序确定个人库；使用自定义库时命令始终携带同一 `--home`。setup 生成的全局 wrapper 绑定安装时 runtime。需要正文依赖时按本 Skill 目录定位 [入口脚本](scripts/my-ai-infra.mjs)。

## 项目配置

1. 从对话确定目标项目目录。用户指定路径时使用该路径；否则使用当前项目目录。
2. 读取目标项目说明及现有 `.my-ai-infra.json`。保留已有规则与用户文件。
3. 工具可选 `codex`、`claudecode`、`cursor`、`copilot`。优先使用用户已表达的偏好或项目已有配置；首次使用且未说明偏好时简短询问一次。初始化默认安装全部可用 Skill，不逐项询问；需要缩减项目 Skill 时在 Web 中调整后执行 sync。
   文档与辅助资产创建统一使用 `my-create-对象`，编码实现使用 `my-implement-code`，审查使用 `my-review-对象`；以 `catalog` 输出的 canonical 名称为准。旧版 Skill 名可作为 CLI 配置输入，解析后统一使用新名；不要复制旧名 Skill 作为第二份资产。
4. 先调用 `plan --project <绝对路径> --tools <逗号分隔工具>` 查看全面预检。CLI / Web 默认 merge：本地优先补缺，同名差异保存候选，Skill 副本归入中心源；脚本和结构化内容不盲拼。已有初始化或同步授权时，按默认或用户指定的 `--conflict merge|replace|abort` 继续，无需再次确认。replace 先备份再替换；abort 遇冲突终止。交互 CLI 自行展示策略菜单；通过入口脚本执行时显式带上已确定策略。报告 recovery、review 和 skipped；出现 complete: false 时说明部分完成及未处理路径，不宣称全部装配成功。
   项目 SDD 工作区统一使用 `mai-specs/`。`init` / `sync` 仅补缺该工作区的 README、ROADMAP 和 `_templates/`；`FEATURE_LAYOUT.json` 仅在用户需要自定义产物路径时从已安装的 `my-create-feature/template/FEATURE_LAYOUT.json` 复制并调整，已有文件保持原状；后续 Feature 与规格均写入此目录，不查找或回退到其他根目录。
5. 执行 `doctor --project <绝对路径>`，报告项目配置、安装目录和检查结果。若结果有 `nextSteps`，转达空规则对应工具的初始化提示，由用户执行；安装健康仅表示装配一致，不代表规则正文已补全。

命令示例（从本 Skill 所在目录执行）：

```bash
node scripts/my-ai-infra.mjs plan --project /path/to/repo --tools codex,copilot
node scripts/my-ai-infra.mjs init --project /path/to/repo --tools codex,copilot --yes
node scripts/my-ai-infra.mjs doctor --project /path/to/repo
node scripts/my-ai-infra.mjs web --project /path/to/repo
```

如果本地 runtime 尚未安装，提示用户从本项目安装包执行 `setup`；不要下载未知同名包作为自动回退。

## 维护个人资产

个人源位于 `MY_AI_INFRA_HOME` 指定目录或 `~/.my-ai-infra/assets/`。项目 `.agents/<类型>/` 保存所有 AI 资产实体，Codex 直接使用 `.agents/skills/` 源文件，其他工具的 Skill 入口使用相对软链接，全局入口同样链接到用户主目录 `.agents/`。项目运行规则归入 `.agents/rules/`，原生入口建立相对软链接。新建 CLAUDE.md 时，根目录 AGENTS.md 和 CLAUDE.md 都链接到 `.agents/rules/AGENTS.md` 唯一源，补全一次即可；只选 Claude Code 也创建 AGENTS.md 入口，后续新增 Claude Code 复用已有 AGENTS.md。已有两份不同正文分别迁移保留，Copilot 原生规则独立管理。正文由项目作者维护，不注入 SDD 流程或引用。规则的不同非空副本发生冲突时保留两份，让用户合并后重试。修改个人 Skill 源后显式同步选定项目；旧版未修改受管副本会先备份再迁移，修改冲突保持原状。

- `catalog`：查看 Skill；`asset list`：统一查看所有类型资产。
- Agent 唯一可编辑源位于 `assets/agents/`；工具格式生成到 `.agents/.generated/<工具>/agents/`，原生入口软链接到派生文件。修改项目源后执行 sync 重建。
- Prompt 使用 `assets/prompts/<名称>.md`，文件名作为名称、frontmatter 单行 `description` 作为描述，正文简短编排 Skill，工具入口由安装器统一映射。Hook、MCP 和扩展类型使用 `assets/<类型>/<名称>/asset.json` 声明入口与目标，默认采用相同的备份、同步、冲突和升级策略。共享宿主配置保持独立，不将单个资产覆盖到整份配置。
- `upgrade`：更新个人库与本地 runtime；只有仍匹配上次内置版本摘要的文件自动更新，个人修改与未知来源旧资产保留。随后针对用户指定项目执行 plan / sync，不自动同步全部项目。
- `asset import <Skill目录>`：导入包含 `SKILL.md` 的个人文本 Skill；`--type agents` 导入角色文件，`--type prompts` 导入单个 Markdown 文件，`--type hooks|mcp|<扩展类型>` 导入带 asset.json 的目录；已有同名资产保持原状。旧清单式 Prompt 保持兼容，新旧同名源冲突时先保留现场。
- `asset edit <名称> --file <新SKILL.md路径>`：替换正文并备份旧版本。
- `web`：打开配置工作台，编辑个人 Skill、默认偏好及目标项目配置。

选择一个项目的请求仅授权该项目。全局偏好修改作用于后续新项目；已有项目由各自配置控制。

维护时使用 [evals/cases.md](evals/cases.md)，检查只读、冲突保留、个人库选择和 runtime 定位。

## 个人长期记忆

使用 `memory get / recall / bind / put / save / delete` 管理全局或当前项目的 Markdown 偏好；Web“个人记忆”支持编辑、候选确认、停用、删除和命中预览。规则、原始会话与项目事实不进入个人偏好库。新偏好的准入与提炼统一使用可用的 [my-create-memory](../my-create-memory/SKILL.md)，宁缺毋滥，不为初始化生成默认偏好。项目 ID 只在首次绑定时创建，sync 保留；独立 fork 用 `memory bind --project PATH --project-id new`。绑定、Markdown 格式和命令详见 [记忆契约](../my-create-memory/references/storage.md)。
