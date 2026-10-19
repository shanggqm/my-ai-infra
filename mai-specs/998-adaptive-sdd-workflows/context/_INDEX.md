# 素材索引 — 998

| 文件 | 类型 | 来源与原名 | 关键内容摘要 | 收集日期 | 派生自 |
|---|---|---|---|---|---|
| [需求来源与流程裁剪示意.md](./%E9%9C%80%E6%B1%82%E6%9D%A5%E6%BA%90%E4%B8%8E%E6%B5%81%E7%A8%8B%E8%A3%81%E5%89%AA%E7%A4%BA%E6%84%8F.md) | md | 用户 2026-10-16 对话及附图可见内容的文字整理 | 按风险、不确定性与复杂度裁剪 SDD，微小改动直接完成，中小需求精简规格；本次创建需求并设计方案。 | 2026-10-15 | — |
| [2026-10-17-原子能力与场景编排.md](2026-10-17-原子能力与场景编排.md) | md | 用户本轮对话及附图的文字整理 | 原子 Skill、Prompt 场景组合、动态阶段输入输出与 simple 独立模板。 | 2026-10-17 | — |

## 2026-10-16 创建时发现（历史记录）

- 自动 Prompt 当前固定串行调用完整 SDD；阶段模板支持篇幅裁剪，但缺少跨阶段简化契约。
- 已有最小初始化仅包含 BRIEF.md 与 context/_INDEX.md；路径校验只检查位置，不判定阶段完成。
- my-simple-feature 当前不存在；图中入口是拟议行为示例。
- 工作区已有大量修改，本次按当前工作树设计，不改已有实现与其他 Feature。
- 基线 HEAD f4861bf017bf6dc793c658cfc7c34c16d90ac4e4，分支 release/0.0.6；关键当前文件 SHA-256：assets/prompts/my-auto-feature.md=203e83405af1d866f4ded6679482ce54e065ab14fa278ee6abf20dc3775820dc; assets/prompts/my-auto-design.md=f9922db9d62022e0bb414bc5dfb23963f6b491f203e0b5735beaa676cff236da; assets/skills/my-create-feature/scripts/init-feature.mjs=2629973f8d4816aa287e38456d1ebee2f9c443aa6b10758855fe68966620f648; assets/skills/my-create-feature/scripts/validate-feature.mjs=941fb8a59309df7486b283d16885f442e4cce9b0dfaa62704cf17091748daeca; assets/skills/my-implement-code/SKILL.md=d5c4a67f501e145096f7eaf61033b9f92fefff7142c7bb545bbce3941ea585aa; src/project.mjs=c1dfd1c0ab5584cf98b2ff96f7ecc71e6d5085d7c7bc49a6e2568c822c596b23; src/assets.mjs=49a15134e83ab5b2b36cb5d98b76c6988238647b16b3a5242a2dcbc729f2b03a

## 2026-10-17 修订记录

- 本轮基线：`main` / `b82c0733c1a67c618a2c7becd71f82fa6b5ea460`，包版本 `0.0.12`；开始修订时工作区干净。
- 用户明确原子 Skill 与 Prompt 编排职责，simple 按需要生成 PRD 和技术方案，并提供相应简版模板。
- 本轮附图以风险和复杂度为两轴，不确定性作为澄清 / 探索触发；历史原图记录保持。
- 已核对当前 Prompt、七个阶段 Skill、初始化与路径校验、模板装配和现有测试；新 Prompt、profile、共享契约和 simple 模板仍未实现。
- 以新 PRD / 技术方案为当前有效设计；历史 lite 单文档和 workflow 参数提案由本轮方案替换，未修改历史来源材料。
- 本轮仅维护 998 文档与 ROADMAP 中对应行，保持 Phase=draft。技术细节待方案评审，无阻塞文档更新的业务问题。
- 用户随后同意统一 Profile 常量、索引展示及稳定目录。本次在已有未提交文档上增补规则，新增常量资源和脚本行为仍待实施；998 的 BRIEF 与 ROADMAP 对应行手工登记 standard，目录保持原路径。

## 2026-10-18 实施与验收

- 用户授权用 my-create-test-plan 覆盖 AC-01～20 和 W-01，再用 my-implement-code 完整实现和验收。
- 在 feature/998-adaptive-sdd-workflows 分支实现 T-01～T-07，保留先前规格修改；未提交、推送或发布。
- 独立代码评审发现的 manifest 资源列表位置和旧模板/动态 default 组合问题均修复并复查。
- 242 项自动化、实际 npm 包隔离安装验收通过；Codex/Claude 入口发现有实际证据。宿主模型行为与静态装配分别验收，其他宿主缺登录条件保留待验。
- 测试计划、设计/代码评审与后续验收记录通过 BRIEF 索引。
- Codex 共 30 个隔离场景结合自动化覆盖 AC-01～20，W-01 由独立评审复核关闭；持久摘要见测试目录 EVIDENCE.json。其余宿主模型运行未完成，Feature 保持 review。
