# 需求路线图

## 规划中

| 需求 | 标题 | 优先级 | 说明 |
|---|---|---|---|

## 进行中

| 需求 | 标题 | 优先级 | 说明 |
|---|---|---|---|
| 994 | [技术债治理贯穿 SDD 与独立债务分析 Skill](994-technical-debt-governance/BRIEF.md) | P1 | 规格：standard；my-analyze-debt 与阶段短约束已实现，追加全局最优/MVP比较及用户选择；review，保留前次宿主限制与报告质量问题。 |
| 998 | [原子 Skill 与场景 Prompt 的自适应 SDD 流程](998-adaptive-sdd-workflows/BRIEF.md) | P1 | 规格：standard；按需求组合原子能力与模板，新增 simple Prompt，支持分阶段交付；实现与代码评审完成；242 项回归及安装包检查通过；30 个 Codex 场景与 W-01 复查通过，其余宿主待验。 |
| 999 | [初始化后四工具全部资产的斜杠入口发现与调用](999-cross-agent-slash-discovery/BRIEF.md) | P1 | 按四工具原生入口发现与调用；实现及自动化验证完成，Claude 调用与 Copilot 宿主验收待补。 |

## 已完成

| 需求 | 标题 | 优先级 | 说明 |
|---|---|---|---|
| 997 | [内置 Skill 只读与个人 Skill 独立存储](997-personal-skill-library/BRIEF.md) | P1 | 实现完成；226 项测试、浏览器及实际 npm 卸载重装验收通过。 |
| 996 | [取消 Coding 工具时清理专属目录](996-tool-directory-cleanup/BRIEF.md) | P1 | 实现完成；231 项测试与浏览器回归通过，目录整体归档清理，保留 .agents 真源。 |
| 995 | [统一内置资产初始化来源](995-unified-builtin-assets/BRIEF.md) | P1 | 实现与验证完成；全部内置资产使用当前包来源，个人定制保留，发布验收见发行记录。 |
