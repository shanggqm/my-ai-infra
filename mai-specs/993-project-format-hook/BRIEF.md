# 993: 复用项目既有格式化规范的 Hook

| 项 | 值 |
|---|---|
| Phase | review |
| Profile | standard |
| 优先级 | P1 |
| 负责人 | andy |
| 目标日期 | 待填 |
| 涉及子系统 | assets/hooks,src/project.mjs,src/discovery.mjs,test |

## 一句话描述

init 检测根目录既有格式化配置并装配格式化 Hook，复用已有执行入口，缺配置或脚本时跳过。

## 背景

项目已有格式化规范需要在 AI Coding 过程中自动执行，初始化不得添加格式化工具配置。

## 关键决策

- 根目录已有格式化配置才安装 Hook；有配置无脚本时正常跳过。
- 复用仓库既有 format / fmt 入口，不生成格式化配置或脚本，不自动安装工具。
- 主 Agent 一轮结束时触发，具体事件按四个宿主适配。
- 共享宿主配置结构化合并，保留其他设置；安装、plan 和 doctor 不运行脚本。
- 需求与验收依据见 [PRD](spec/PRD.md)，实现任务见 [技术方案](design/TECH_DESIGN.md)。
- 实现与自检完成：277 项自动化、7 组浏览器回归、安装包验收通过，见 [验证记录](test/TEST_PLAN.md)。四宿主真实事件调度及独立代码评审待验，保持 review。

## 上下文索引

- [素材索引](context/_INDEX.md)
