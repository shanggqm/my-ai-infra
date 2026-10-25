# 992: 统一快捷指令为 Skill

| 项 | 值 |
|---|---|
| Phase | review |
| Profile | simple |
| 优先级 | P1 |
| 负责人 | andy |
| 目标日期 | 待填 |
| 涉及子系统 | assets,src,catalog,web,test,docs |

## 一句话描述

四个内置 Prompt 转为 Skill，移除 Prompt 资产类型，init 丢弃旧 Prompt 并安装最新内容。

## 背景

产品尚未正式推广，统一资产格式以减少管理和适配成本；用户明确授权丢弃旧 Prompt，不做内容兼容。

## 关键决策

待补充。

## 上下文索引

- [素材索引](context/_INDEX.md)

## 范围与验收

用户于 2026-10-25 明确授权：四个内置 Prompt 全部改为 Skill，移除原 Prompt 资产，不保留内容迁移兼容；新版 mai init 丢弃本地旧 Prompt 并安装最新内容。

- AC-01：四个同名 Skill 的 SKILL.md 直接包含原有任务正文，保持显式调用策略，四工具通过标准 Skill 适配。
- AC-02：CLI / Web / 分发清单只提供 Skill 资产，无 Prompt 导入、编辑或转接生成；工作台展示快捷工作流分类。
- AC-03：init / sync 识别旧 Prompt 后，补入四个 Skill，丢弃旧正文、旧入口和生成包装，不合并旧修改；个人库旧 Prompt 停用并清理。
- AC-04：plan / doctor 保持只读；清理进入 revision 校验和项目回滚，外部软链接目标不变，无关 Skill / command 和规则保留。
- AC-05：装配、浏览器和实际 npm 安装包检查通过；宿主模型行为另列实际验证结果。

范围内同步 setup 的旧入口清理。安装任务不发布 npm，不提交或更新父仓库子模块指针。

技术与验证记录见 [技术方案](design/TECH_DESIGN.md)、[测试记录](test/TEST_PLAN.md)。

实现与自检完成：276 项自动化、8 组浏览器、实际安装包及 Codex/Claude 发现检查通过。模型行为回归与独立评审未执行，详见测试记录。
