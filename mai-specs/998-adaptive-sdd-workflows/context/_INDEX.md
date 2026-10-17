# 素材索引 — 998

| 文件 | 类型 | 来源与原名 | 关键内容摘要 | 收集日期 | 派生自 |
|---|---|---|---|---|---|
| [需求来源与流程裁剪示意.md](./%E9%9C%80%E6%B1%82%E6%9D%A5%E6%BA%90%E4%B8%8E%E6%B5%81%E7%A8%8B%E8%A3%81%E5%89%AA%E7%A4%BA%E6%84%8F.md) | md | 用户 2026-10-16 对话及附图可见内容的文字整理 | 按风险、不确定性与复杂度裁剪 SDD，微小改动直接完成，中小需求精简规格；本次创建需求并设计方案。 | 2026-10-15 | — |

## 关键发现

- 自动 Prompt 当前固定串行调用完整 SDD；阶段模板支持篇幅裁剪，但缺少跨阶段简化契约。
- 已有最小初始化仅包含 BRIEF.md 与 context/_INDEX.md；路径校验只检查位置，不判定阶段完成。
- my-simple-feature 当前不存在；图中入口是拟议行为示例。
- 工作区已有大量修改，本次按当前工作树设计，不改已有实现与其他 Feature。
- 基线 HEAD f4861bf017bf6dc793c658cfc7c34c16d90ac4e4，分支 release/0.0.6；关键当前文件 SHA-256：assets/prompts/my-auto-feature.md=203e83405af1d866f4ded6679482ce54e065ab14fa278ee6abf20dc3775820dc; assets/prompts/my-auto-design.md=f9922db9d62022e0bb414bc5dfb23963f6b491f203e0b5735beaa676cff236da; assets/skills/my-create-feature/scripts/init-feature.mjs=2629973f8d4816aa287e38456d1ebee2f9c443aa6b10758855fe68966620f648; assets/skills/my-create-feature/scripts/validate-feature.mjs=941fb8a59309df7486b283d16885f442e4cce9b0dfaa62704cf17091748daeca; assets/skills/my-implement-code/SKILL.md=d5c4a67f501e145096f7eaf61033b9f92fefff7142c7bb545bbce3941ea585aa; src/project.mjs=c1dfd1c0ab5584cf98b2ff96f7ecc71e6d5085d7c7bc49a6e2568c822c596b23; src/assets.mjs=49a15134e83ab5b2b36cb5d98b76c6988238647b16b3a5242a2dcbc729f2b03a

## 开放问题
