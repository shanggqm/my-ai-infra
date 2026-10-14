# 连续流程 Prompt 评测

适用资产：`assets/prompts/my-auto-feature.md`、`assets/prompts/my-auto-design.md`。

Prompt 只用一句话编排 Skill。详细行为由各 Skill 的评测负责，这里检查编排顺序与连续推进。

| 场景 | 预期行为 |
|---|---|
| 明确目标，调用 my-auto-feature | 创建或复用 Feature、PRD、技术方案、方案评审修复、测试计划、代码实现、代码评审修复、最终测试验收 |
| 明确需求，调用 my-auto-design | 从技术方案开始，经过评审修复后实现并验收 |
| 已有技术方案 | 复用方案，进入方案评审，避免重复生成 |
| 方案或代码评审发现问题 | 修复并复评，继续已授权后续步骤 |
| 验收失败 | 修复并复验；有真实阻塞时说明并询问 |

自动化装配回归：`node --test test/prompts.test.mjs test/assets.test.mjs`。覆盖单文件导入与描述校验、编辑、旧清单兼容、软链唯一源、移动、重复同步、定制保护、升级及全局安装。

宿主内行为评测需记录实际工具、模型、输入、Skill 调用和验收证据；文件装配测试不能代替模型行为评测。
