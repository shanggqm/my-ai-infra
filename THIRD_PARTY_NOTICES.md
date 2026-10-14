# 来源与许可说明

## 本项目

本项目采用 [MIT 许可证](LICENSE)，版权署名为 `andy`。第三方资产保留各自适用的许可证和版权登记；本项目许可证不替代原始输入的授权核实。源码维护于私有仓库 [shanggqm/my-ai-infra](https://github.com/shanggqm/my-ai-infra)。

## 内置 Skill 来源

7 个原始 Skill 由负责人提供的项目复制而来，原始提交记录为 `ac59d821c77e5d647f031b57671a9957225cdd79`。本项目已进行命名、跨工具适配、职责与行为修订；上游 URL 与授权范围仍待补齐。署名元信息表示本项目维护者，不能替代上游版权登记。

`my-ai-infra`、`my-review-design`、`my-create-memory` 为当前内置的本项目自研资产，唯一源位于本仓库 `assets/skills/`，课程开发工作区通过软链引用。团队 AI Infra 和五个 SDD 脚手架用于机制比较，未直接复制其实现源码。

实际公开发布前，维护者需确认复制资产的分发授权并更新相应登记。包中不包含私人项目素材、个人资产库或研究原始材料。

## Material Symbols Rounded

Icon 来自 Google Material Symbols Rounded，以 Apache License 2.0 分发。本包包含实际使用的字体子集，保留必要连字和原许可文件：

- [Apache 2.0 许可](design-system/assets/icons/APACHE-2.0.txt)
- [图标来源及子集说明](design-system/assets/icons/README.md)
- 官方来源：[Google Material Design Icons](https://github.com/google/material-design-icons)

字体许可适用于对应第三方文件，不自动改变本项目其他文件的许可。

## Logo 与设计基础

Logo 由内置 imagegen 于 2026-10-13 生成；项目内保存透明 PNG，来源与提示词见 [Logo 说明](web/assets/README.md)。界面按负责人指定的 bxy-core-design-system 沉淀 tokens 和交互约束；未分发商业产品组件、设备外框或私有业务素材。

## 首页齿轮动画参考

2026-10-14，负责人提供标题为 “Cog Train — Originkit” 的 React/WebGL 代码片段作为视觉与运动参考。原始输入 SHA-256：`4883d59879e50b114741cbd904e6081b4a53009dc56d5702d9d7941498a0e549`。

[web/cog-train.js](web/cog-train.js) 使用原生 Canvas 2D 实现，参考共同齿距、齿轮接触相位、反向转动和指针速度反馈机制；重新实现轮廓路径缓存、浅色语义配色、阅读区域、响应式布局与动效生命周期。分发内容未包含原始 React 组件或 GLSL 源码，也未引入相应运行时依赖。此登记保留参考来源，不对输入片段的上游许可作推定。
