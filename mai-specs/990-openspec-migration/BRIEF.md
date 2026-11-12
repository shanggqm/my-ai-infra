# 990: 存量 OpenSpec 项目迁移

| 项 | 值 |
|---|---|
| Phase | review |
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

首版只做 OpenSpec 到 MAI 布局的对齐迁移，不改既有 Skill 与装配流程，不提供归档命令。实现、自动化验证与 Cursor、Claude Code 宿主续接已完成；Codex 宿主与真实项目样本待验。后续设计、实现与验收按 PRD 的 FR 和 AC 引用。

## 上下文索引

- [素材索引](context/_INDEX.md)
- [产品规格与验收标准（有效需求源，待评审）](spec/PRD.md)
- [技术方案与实施任务（待评审）](design/TECH_DESIGN.md) · [关键代码骨架](design/CODE_DESIGN.md)

需求负责人已确认 AC-03 保留已同步结果，并要求批量导入在途 change。实施与复审记录见 [实施记录](review/IMPLEMENTATION.md)、[代码评审](review/code_review.md)；Codex 宿主接续与真实项目样本待验证。
