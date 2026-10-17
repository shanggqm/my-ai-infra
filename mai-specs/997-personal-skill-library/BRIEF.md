# 997: 内置 Skill 只读与个人 Skill 独立存储

| 项 | 值 |
|---|---|
| Phase | completed |
| 优先级 | P1 |
| 负责人 | andy |
| 目标日期 | 待填 |
| 涉及子系统 | store、project、CLI、Web、分发与迁移 |

## 一句话描述

内置资产随发行维护，个人 Skill 独立持久保存、支持项目导入并显示来源。

## 背景

项目中验证有效的 Skill 需要沉淀到全局个人库。用户选择简化方案：内置 Skill 由发行版本维护且用户只读，项目贡献仅支持新增个人 Skill，个人库独立于 npm 安装目录。

## 关键决策

- 内置 Skill 直接读取发行包，个人 Skill 存于 home/assets/skills/，默认 home 为 ~/.my-ai-infra。
- origin: builtin / personal 独立于业务 category；CLI、Web 显示来源并保护内置写入。
- 复用 asset import 完整目录新增；同名拒绝，定制内置内容须改名。个人正文既有编辑能力保留。
- npm 更新与卸载保留个人库；项目副本通过显式 init/sync 管理。
- 旧受管内置副本整包备份迁移；未知来源同名目录报错；不做三方合并。
- 不包含 npm 发布、真实个人库迁移或其他资产类型的只读改造。

## 实现与验证

- [技术设计](design/TECH_DESIGN.md)
- [测试计划与验收记录](test/TEST_PLAN.md)

## 上下文索引

- [素材索引](context/_INDEX.md)
