# SDD 规格与需求工作区

本目录 `mai-specs/` 由 my-ai-infra 管理工作区规范，按 Feature 维护驱动开发、测试与验收的规格及关联记录。项目初始化或同步时写入本说明、ROADMAP 和 `_templates/`；独立调用 `my-create-feature` 时会创建本目录与需求初始文件，缺少项目契约时使用随包契约。

每个需求使用 `NNN-<slug>/`，编号交由 my-create-feature 初始化脚本计算：从 999 递减，低于 000 回到 999，跳过已有目录和索引占用的编号。目录与 ID 不带 Feature- 前缀，从 `BRIEF.md` 和 `context/_INDEX.md` 开始，由 Prompt 依据输入、风险和复杂度组合 PRD、技术设计、评审、测试和实施；单独调用 Skill 只完成当前阶段。测试计划可以先于实现，所有本次承诺条件有当前通过证据后才结项。

使用 `my-create-feature` 的初始化脚本创建 Feature，目录结构与 BRIEF 的真源位于该 Skill 的 `template/feature/`；ROADMAP 的首次副本也来自同一 Skill。`_templates/` 提供后续 PRD、设计和测试计划的初始骨架，可随项目约定调整。旧版 BRIEF 模板副本保留为用户文件，新初始化不读取它。

## 按需创建与集中路径契约

Feature 初始化仅生成 BRIEF.md、context/_INDEX.md。后续 Skill 默认使用随包布局；存在本目录的 FEATURE_LAYOUT.json 时优先读取它，按 artifacts 中本阶段登记的路径，在实际写文件时创建父目录；初始化所需文件由 initialFiles 定义。spec/diagrams 等辅助目录同样按需创建，不放 .gitkeep。需要自定义产物路径时，将已安装的 my-create-feature/template/FEATURE_LAYOUT.json 复制到本目录后修改 artifacts 中的 path；initialFiles 应与需求初始化模板保持一致。重复安装保留已有契约。

缺少契约时沿用各 Skill 的默认路径；初始化和同步均不自动生成契约副本。自定义规范、已有文件与登记路径冲突时保留现场并让用户选择。路径校验入口位于已安装 my-create-feature/scripts/validate-feature.mjs，使用 --feature 指定需求，可用 --artifact 指定本次产物 ID。只要求初始文件及明确检查的产物；未来阶段目录缺失正常，已有目录/文档也不代表阶段完成。旧空目录和占位文件仅提示，不自动清理。没有安装该 Skill 时，依照同一契约核对路径，不伪造可用脚本入口。

## Profile 与索引

Feature 默认规格档位记录在 BRIEF 的 Profile，常量位于已安装 my-create-feature 的 references/FEATURE_PROFILES.json，缺字段时用注册表 default（standard）。simple / standard 与阶段选择独立；目录始终 NNN-slug，两档位共用编号池。新 ROADMAP 五列：需求、标题、规格、优先级、说明；旧四列保持，目标行说明前记 `规格：simple；` 或 `规格：standard；`。类型改变不重命名，索引待同步按 BRIEF 恢复。

新 simple PRD/技术方案先用项目 `_templates/simple/PRD.tmpl.md` / `TECH_DESIGN.tmpl.md`，没有时用所属 Skill 的 assets/templates/ 简版模板；显式指定优先，坏覆盖不绕过。已有文档增量保留，单产物覆盖不改 Feature 默认值。两档位共用 artifact 路径。无 PRD 时设计登记充分需求与 AC，后续使用该有效源；后补 PRD 保留 AC ID 并同步引用。
