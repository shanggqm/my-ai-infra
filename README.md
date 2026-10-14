<p align="center">
  <img src="web/assets/logo.png" alt="my-ai-infra logo" width="120" />
</p>

<h1 align="center">my-ai-infra</h1>

<p align="center"><strong>让 AI 按规格交付，让经验持续复用。</strong></p>
<p align="center">面向企业级 AI Coding 的轻量 SDD 脚手架</p>

my-ai-infra 汲取开源社区在规格驱动开发（SDD）与 Agent 工作流上的实践，将需求、设计、评审、编码与验收串成一条清晰的交付路径。简单接入现有项目，按需组合能力，让开发偏好与可复用资产随实践持续积累。

支持 **Codex · Claude Code · Cursor · GitHub Copilot**。

## 少一点配置，多一点交付

- **轻量接入**：一条命令初始化，CLI 与本地 Web 工作台随手切换；运行时无第三方 npm 依赖。
- **规格驱动**：从需求到验收，以明确规格和评审支撑交付；按任务规模裁剪流程。
- **持续进化**：记住长期开发偏好，沉淀自己的 Skill 与 Prompt，在后续项目中复用有效经验。
- **一份资产，多种工具**：Skill、Agent、Prompt 等统一维护，通过软链连接工具入口；同步前可预览，冲突有备份。

## 快速开始

需要 **Node.js 22+**。在已有项目中运行：

```bash
npm install --global @easyuseai/my-ai-infra
cd /path/to/your-project
mai init
```

按提示选择 Coding 工具，即可装配内置 Skill 与 SDD 工作区。需要可视化管理时运行 `mai web`，通过终端给出的本机链接打开工作台。

## 从想法到验收

需求 → 产品规格 → 技术方案 → 方案评审 → 测试规划 → 编码实现 → 代码评审 → 测试验收

内置两条 [Prompt 快捷指令](docs/custom-prompts.md)，用一句话编排完整流程：

| 指令 | 适用场景 |
|---|---|
| `my-auto-feature` | 从目标出发，自主细化需求，推进方案、评审、实现与验收 |
| `my-auto-design` | 需求已经明确，从技术方案开始，评审修复后实现与验收 |

规格与交付记录保存在项目的 `mai-specs/` 中。各阶段 Skill 也可独立使用，已有方案可以直接接续。

## 文档

[GitHub 源码仓库](https://github.com/shanggqm/my-ai-infra) · [问题反馈](https://github.com/shanggqm/my-ai-infra/issues)（当前为 private，需要仓库访问权限）

- [使用指南](docs/usage.md)：配置、同步、升级与恢复。
- [资产管理](assets/README.md)：统一维护 Skill、Agent、Prompt 与扩展能力。
- [个人记忆](docs/memory.md)：积累开发偏好，管理跨项目与项目内的长期记忆。
- [开发与发布](docs/releasing.md) · [故障排查](docs/troubleshooting.md) · [版本记录](CHANGELOG.md)

## 致谢与许可

感谢开源社区对 SDD、Agent 协作与工程实践的持续探索。my-ai-infra 在这些经验之上做取舍与整合，追求精简、易用、可持续演进的开发体验。

项目采用 [MIT 许可证](LICENSE)。第三方资产的来源与授权状态见[来源与许可说明](THIRD_PARTY_NOTICES.md)。
