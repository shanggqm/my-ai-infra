---
name: "my-auto-feature"
description: "自主完成需求到验收的完整流程"
compatibility: "需要可读取的目标项目；流程编排使用当前作用域已安装的阶段 Skill。"
metadata:
  author: "andy"
  source: "assets/skills/my-auto-feature/SKILL.md"
disable-model-invocation: true
---

针对本次需求，默认按完整流程编排：my-create-feature → my-create-prd → my-create-design → my-review-design（安排方案修复并复评）→ my-create-test-plan → my-implement-code → my-review-code（安排代码修复并复评）→ 实际验收。新 Feature 默认使用注册表 default（standard）。复用已存在且仍有效的产物，不重复执行已经满足的工作。

先读取当前作用域 my-create-feature 的 `references/stage-contracts.md`、`references/FEATURE_PROFILES.json` 和实际 Skill、项目规则、已有 Feature。Skill 负责单阶段产物，当前 Skill / 主 Agent 负责选择输入和模板、调度、修复复评、阶段状态与最终判断。有效需求来源与 AC 保持唯一；无 PRD 的充分输入可支持直接设计，但完整流程的默认 PRD 阶段仍保留。用户明确指定 simple 或允许裁剪时据实际需要调整阶段；显式完整 SDD 不被自动裁剪，单阶段或仅探索授权停在其范围。

风险决定契约、设计/代码审查和正反例；复杂度决定依赖切片及最终集成；关键未知先澄清或限定探索。实施中风险扩大暂停受影响代码，同一 Feature 补前置门槛并复查旧证据。测试缺口由编排者安排 my-create-test-plan，遵守其内部委派与结果回收；不重复调度。

阶段间交接本次相关的债务证据与待决取舍，沿当前变更修正、复评；独立存量分析仅在明确请求或已有授权编排内安排，不作为固定阶段。偿债经当前验证后，在授权内更新有效约束、契约和回归入口；历史规格保留，团队债务不写入个人偏好记忆。

Profile 与阶段计划分别决定：旧 BRIEF 的有效 Profile 优先，缺字段用注册表 default；单产物模板覆盖不改 Feature 默认值。已有文档增量保留批注，新文档按共享契约选显式模板/项目覆盖/随包 simple 模板；缺能力精确报告。目录与 ID 稳定。默认档位调整先核对快照，改 BRIEF 再改目标索引，最后复读；中断报告索引待同步并按 BRIEF 恢复，保留外部修改。Phase 移动按目标四/五列表头渲染；后补 PRD 迁移 AC ID、设计引用和有效源，受影响证据重新验证。

已有授权内连续推进，真实业务决定或范围冲突再询问。仅当前切片通过、测试失败、有效评审阻塞或承诺证据缺失时不结项，不降低 AC、不把计划/静态检查当验收。全部承诺及集成有当前有效证据后按项目约定完成；提交、推送、发布按各自授权。
