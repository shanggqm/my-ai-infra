---
name: "my-auto-design"
description: "从明确需求或已有方案推进到实现验收"
compatibility: "需要可读取的目标项目；流程编排使用当前作用域已安装的阶段 Skill。"
metadata:
  author: "andy"
  source: "assets/skills/my-auto-design/SKILL.md"
disable-model-invocation: true
---

针对已明确的需求，默认编排 my-create-design（已有有效方案则复用）→ my-review-design（安排方案修复并复评）→ my-implement-code → my-review-code（安排代码修复并复评）→ 实际验收。存在业务测试缺口时由当前编排者安排 my-create-test-plan，遵守其内部独立委派约定并回收结果。

先读取当前作用域 my-create-feature 的 `references/stage-contracts.md`、`references/FEATURE_PROFILES.json`、实际 Skill、项目规则及有效上下文。有 PRD 用 PRD；无 PRD 但目标、范围、行为、可判定 AC 和约束充分时直接设计，持久化来源与 AC。不足时安排产品规格梳理或回传关键业务问题；不补占位 PRD。仅请求方案时停在方案；显式完整 SDD 则补足所要求阶段。

默认新建规格使用注册表 default（standard），显式 simple 采用相应简版模板。阶段数量与模板档位独立。旧 BRIEF Profile 优先，单产物覆盖不改默认；已有文档增量维护并保留批注，新文档遵守显式模板、项目覆盖与随包资源优先级和 layout 路径。缺资源报告实际路径及受影响工作，不借另一作用域补缺。

风险决定必要契约、设计/代码审查与正反例验证；复杂度决定依赖切片、退出证据及最终集成；关键未知先限定探索。风险升级时暂停受影响代码，同一 Feature 补前置条件，复核旧证据。由编排者安排对应 Skill 修复和复评，原子 Skill 保持单阶段边界。

阶段间交接本次相关的债务证据与待决取舍，沿当前变更修正、复评；独立存量分析仅在明确请求或已有授权编排内安排，不作为固定阶段。偿债经当前验证后，在授权内更新有效约束、契约和回归入口；历史规格保留，团队债务不写入个人偏好记忆。

当前 Skill / 主 Agent 负责 Phase、BRIEF 的简短阶段/来源记录及 ROADMAP。改变 Feature 默认档位按共享契约保存快照、先 BRIEF 后目标行、最后复读，保持 ID/目录及外部编辑；中断报告索引待同步，以 BRIEF 恢复。跨分区移动按四/五列表头渲染。后补 PRD 保留 AC ID、安排来源切换并复核相关任务与证据。

已授权范围内连续推进，真实业务决策冲突再询问。阶段结果不能代替整体通过；测试失败、评审阻塞、必要证据未验证时保持未完成，不降低 AC。全部承诺和集成有当前有效证据后按项目规则结项；提交、推送和发布遵循各自授权。
