---
name: "my-create-feature"
description: "创建一个新的需求（Feature）上下文包，搭好 mai-specs/NNN 目录骨架并登记到 ROADMAP。触发词：新建需求、创建需求、新建 Feature、启动新需求、new requirement、create feature、start a new feature。"
compatibility: "需要 Node.js 22+ 和可写目标项目；初始化脚本独立于目标项目技术栈。"
metadata:
  author: "andy"
  source: "assets/skills/my-create-feature/SKILL.md"
---

# 脚本初始化 Feature

确认需求与输入，通过 [初始化脚本](scripts/init-feature.mjs) 一次完成 Feature 创建、素材归档、索引登记和校验。

## 阶段契约

先读取本作用域的[共享阶段契约](references/stage-contracts.md)，核对有效需求来源、Profile、模板、产物路径和授权。一次调用只完成本阶段，返回实际产物、证据与缺口；后续调用、修复复评和全局 Phase / ROADMAP 由 编排 Skill 或主编排者安排。连续授权内主编排者继续推进，独立调用保持边界。

## 前置条件

- 已明确目标项目、需求范围、标题、slug、简要描述和背景。关键缺项先停下来补充，存在冲突先让用户选择。
- 已确认素材的保存授权、来源与用途。同名冲突、无法读取的材料及影响范围判断的疑问，在初始化前处理。
- Node.js 22+ 可用，目标项目可写，当前 Skill 的脚本与模板完整。脚本适用于各种技术栈。

## 个人偏好记忆

若已安装 my-create-memory，按[个人记忆接入约定](../my-create-memory/references/sdd-integration.md)在开始时读取当前场景的已生效偏好。只有明确长期偏好、修订或有复用价值的用户纠正才条件触发抽取；默认异步委派，主任务继续，同一证据不重复派发。已作为子任务运行时仅回传证据，由主 Agent 统一委派，不递归派发。无新证据不生成记忆；收尾核对实际落盘结果。

## 工作流

### Step 1：准备输入

- 读取项目 README、适用规则及已有 `mai-specs/`，确认涉及模块与目录约定。
- 准备 `--project`（项目绝对路径）、`--slug`、`--title`、`--summary` 和 `--background`。
- 从共享契约引用的 Profile 注册表读取合法值及默认值。编排者可传 `--profile simple`；独立创建省略时采用注册表 default。预检和创建结果都返回 profile，新建 BRIEF 与索引同值；目录保持 NNN-slug。
- 按已有信息填写 `--modules`、`--priority`（默认 P1）、`--owner` 和 `--target-date`。非关键字段缺失时省略对应参数。
- 未指定负责人时省略 `--owner`，由脚本在目标项目目录读取本机 Git 配置 `user.name`（仓库配置优先，全局配置兜底）；未配置、名称为空或读取失败时保持“待填”。用户明确指定的负责人优先，不为该默认值额外询问。
- 有素材、发现或后续问题时，提前整理为 `--context` JSON 清单。格式见 [模板说明](template/README.md#上下文清单)。需要提取文本时，在此阶段准备派生文件并关联原件。
- 输入含债务报告或偿债目标时，登记证据来源、持续成本、治理范围与不做项；普通需求不前置独立债务分析。
- 使用结构化参数或可靠转义传递用户文本，避免被解释为 shell 代码。

### Step 2：执行只读预检

- 将完整参数传给脚本，增加 `--check`。预检检查参数、模板、素材、目录、编号与 ROADMAP 兼容性，不写入文件或预占编号。
- 预检失败时先处理原因；涉及需求、命名、路径约定或遗留锁的选择，停下来交用户决定。调整输入后重新预检。

```bash
node <本Skill目录>/scripts/init-feature.mjs \
  --project /path/to/project \
  --slug record-search \
  --title "资料检索" \
  --summary "通过关键词查找已有资料" \
  --background "人工逐条浏览耗时" \
  --check
```

### Step 3：执行初始化

- 预检通过后，用相同参数去掉 `--check` 执行。素材清单与输入保持一致。
- 脚本复核现场，完成编号、最小目录生成、素材复制、上下文索引、路径校验及 ROADMAP 登记，然后返回实际 ID、路径和文件清单。
- 脚本成功即完成本次创建，保持 `draft`。后续目录随实际产物创建。
- 执行失败时按错误处理；退出码 `2` 表示现场冲突，保留现场并交用户选择。不得将失败报告为成功，或手工补建绕过错误。

> 编号与全部落盘操作由脚本负责。成功后直接报告结果并引导下一步，无需 AI 再补写文件、运行独立校验或整理素材。

## 下一步

- 成功后，给出实际 Feature 路径、Profile 和初始文件；依据输入充分性建议整理 PRD 或直接技术设计，阶段选择由编排者决定，不固定启动 PRD。
- 遇到阻塞时，以当前需要补充或选择的问题收尾。
- 用户已授权连续阶段时由编排者继续执行，只提示尚未完成的动作。
