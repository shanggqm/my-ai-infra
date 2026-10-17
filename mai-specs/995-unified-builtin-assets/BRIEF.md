# 995: 统一内置资产初始化来源

| 项 | 值 |
|---|---|
| Phase | done |
| 优先级 | P1 |
| 负责人 | andy |
| 涉及子系统 | 资产目录、个人库迁移、项目装配、CLI / Web |

## 一句话描述

init、sync、setup 对所有内置资产直接读取当前发行包，个人库只保存个人新增资产，历史受管副本备份退出生效目录。

## 背景

0.0.11 的 Prompt 被旧个人库副本遮蔽。用户要求将 Skill 已有的来源隔离与初始化规则扩展到 Prompt、Agent、Hook 和其他内置资产。

## 关键决策

- 内置资产由包目录认定，统一 origin=builtin、readOnly=true；个人新增资产 origin=personal。禁止编辑或同名导入内置资产。
- 当前包是内置资产的唯一读取源；init / sync / setup 无需先 upgrade。所有类型使用相同的项目冲突策略，未修改副本自动更新，本地定制按 merge / replace / abort 处理。
- bundle-state.json 能确认的历史内置副本整体备份，包含定制正文及附件；未知来源同名资产报错，保留现场。只读 plan 展示迁移信息，apply 执行迁移。
- 稳定 runtime 的 assets 整体替换，备份旧目录，清除旧版本遗留文件；替换失败恢复旧目录。
- 个人新增资产保留于 ~/.my-ai-infra/assets/<类型>/，项目规则继续由项目维护。
- 本次不变更 npm 版本号，不发布 npm 包。

## 验收

- test/builtin-assets.test.mjs：旧包初始化后升级 Skill、Agent、Prompt、Hook、MCP、扩展类型，再次 CLI init 与新项目均读取新包；旧个人副本及自定义附件完整备份，个人新增资产保留，退役附件移除。
- 同文件覆盖 Web plan / apply、过期预览拒绝、内置保存与导入拒绝、历史目录式 Prompt 迁移和未知来源重名拒绝。
- 现有 Agent、Prompt、个人 Skill、退役资产及 runtime 回滚测试继续覆盖冲突与恢复；浏览器检查内置 Prompt、Agent、Skill 只读状态。
- 最终验证结果登记于 [实现记录](review/IMPLEMENTATION.md)。

## 上下文索引

- [素材索引](context/_INDEX.md)
