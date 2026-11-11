# 991: 存量 OpenSpec 项目迁移

| 项 | 值 |
|---|---|
| Phase | draft |
| Profile | standard |
| 优先级 | P1 |
| 负责人 | wangxing |
| 目标日期 | 待填 |
| 涉及子系统 | CLI、规格工作区、Feature 接续与归档 |

## 一句话描述

支持存量项目从 OpenSpec 导入在途变更并接续开发，或整体切换到 my-ai-infra。

## 背景

已有 OpenSpec 项目沉淀了现行规格、在途变更和历史记录；迁移需保留规格来源、任务进度及归档可追溯性。

## 关键决策

产品规格已起草，覆盖单变更接续与整仓切换；首版范围待评审。后续设计、实现与验收按 PRD 的 FR 和 AC 引用。

## 上下文索引

- [素材索引](context/_INDEX.md)
- [产品规格与验收标准（有效需求源，待评审）](spec/PRD.md)
- [技术方案与实施任务（待评审）](design/TECH_DESIGN.md) · [关键代码骨架](design/CODE_DESIGN.md)

需求负责人已确认 AC-03 保留已同步结果，并要求批量导入在途 change；真实迁移样本与宿主接续待验证。
