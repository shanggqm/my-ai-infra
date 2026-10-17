# 999: 初始化后四工具全部资产的斜杠入口发现与调用

| 项 | 值 |
|---|---|
| Phase | review |
| 优先级 | P1 |
| 负责人 | 待填 |
| 目标日期 | 待填 |
| 涉及子系统 | CLI init/sync/setup、资产模型与四工具适配、发现诊断、发布验收、使用文档 |

## 一句话描述

确保 mai init 后，全部已安装资产在四工具中按各自原生入口发现与调用；支持 / 的使用 /，其他明确展示 @、$、角色选择或自动触发方式，补齐三个 Prompt 的入口与验收。

## 背景

用户在初始化后能够发现 Skill，却无法在 ChatGPT 的 / 菜单找到 my-auto-feature、my-auto-design、my-init-repo-memory。现有安装成功和文件布局检查未覆盖所有资产的宿主发现与调用体验，需要统一四工具的入口适配及验收标准，并明确原生能力限制。

## 关键决策

用户已确认采用各工具原生入口；支持 / 的使用 /，其他展示 @、$、角色选择或自动触发方式。

## 上下文索引

- [素材索引](context/_INDEX.md)

- [产品规格](spec/PRD.md)
- [技术方案](design/TECH_DESIGN.md)
- [方案评审](review/design_review.md)
- [测试计划](test/TEST_PLAN.md)
- [代码评审与复评](review/code_review.md)
- [执行证据](test/EVIDENCE.json)

当前交付状态：实现与自动化验证完成；Claude 登录后调用及 Copilot 宿主验收待补，保持 review。源码未发布。
