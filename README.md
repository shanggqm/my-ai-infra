<p align="center">
  <img src="web/assets/logo.png" alt="my-ai-infra logo" width="120" />
</p>

<h1 align="center">my-ai-infra</h1>

<p align="center"><strong>让 AI 按规格交付，让经验持续复用。</strong></p>
<p align="center">面向企业级 AI Coding 的轻量 SDD 脚手架</p>

my-ai-infra 汲取开源社区在规格驱动开发（SDD）与 Agent 工作流上的实践，将需求、设计、评审、编码与验收串成一条清晰的交付路径。围绕中文开发者的需求表达、技术设计与评审习惯深度调优内置 Skill，简单接入现有项目，让开发偏好与可复用资产随实践持续积累。

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

## 我们的 SDD 理念

**先对齐要交付什么，再让 AI 按规格实现，用证据判断是否完成。** SDD（Spec-Driven Development，规格驱动开发）把需求、设计与验收标准变成开发者和 Coding Agent 共享的上下文，让每次实现都有依据，每次评审都有参照。

- **规格贯穿交付**：从用户场景明确范围、业务规则与验收条件，再关联技术方案、实现任务和测试；需求变化时同步维护相关规格。
- **用 MVP 思维做减法**：优先复用现有代码，只引入当前需求与硬约束所需的复杂度。小改动用短说明，大需求再展开，文档和流程随任务规模裁剪。
- **两次评审，关注不同问题**：方案评审检查问题定义、关键假设与过度设计；代码评审沿真实执行路径核对行为、系统影响与实现质量。发现问题后修复、复评。
- **以业务结果验收**：测试从用户旅程和验收条件出发，复用已有覆盖，补齐关键缺口；结论关联实际证据，未验证的部分明确保留。
- **让经验参与下一次开发**：长期偏好按场景读取，有价值的纠正沉淀为记忆，可复用的方法沉淀为资产；推断出的偏好经确认后生效。

## 从想法到验收

需求 → 产品规格 → 技术方案 → 方案评审 → 测试规划 → 编码实现 → 代码评审 → 测试验收

内置 [Prompt 快捷指令](docs/custom-prompts.md)，支持连续开发与仓库知识初始化：

| 指令 | 适用场景 |
|---|---|
| `my-auto-feature` | 从目标出发，自主细化需求，推进方案、评审、实现与验收 |
| `my-auto-design` | 需求已经明确，从技术方案开始，评审修复后实现与验收 |
| `my-init-repo-memory` | 依据当前仓库事实，直接生成或精简优化根目录 `AGENTS.md` |

规格与交付记录保存在项目的 `mai-specs/` 中。各阶段 Skill 也可独立使用，已有方案可以直接接续。

## 面向中文开发者调优的 Skill

内置 **7 个 SDD 核心 Skill + 3 个辅助 Skill**，围绕职责边界、输入输出、评审尺度与阶段衔接做了深度调优。中文指引和文档模板覆盖需求澄清、业务规则、交互文案与技术评审；既方便开发者阅读和决策，也为 Coding Agent 提供明确的执行上下文。

| Skill | 用途 | 调优重点 |
|---|---|---|
| [my-create-feature](assets/skills/my-create-feature/SKILL.md) | 建立需求上下文 | 收拢目标、素材与约束，创建统一的需求工作区 |
| [my-create-prd](assets/skills/my-create-prd/SKILL.md) | 编写产品规格 | 串联用户故事、业务流程与验收标准，按需补充交互、文案与原型 |
| [my-create-design](assets/skills/my-create-design/SKILL.md) | 设计技术方案 | 结合现有代码与约束，以 MVP 为默认，拆出可执行任务 |
| [my-review-design](assets/skills/my-review-design/SKILL.md) | 评审技术方案 | 同时检查遗漏与过度设计，验证关键假设，给出可执行的取舍建议 |
| [my-create-test-plan](assets/skills/my-create-test-plan/SKILL.md) | 规划与执行业务验证 | 从真实用户旅程补齐验收缺口，区分测试计划与实际通过证据 |
| [my-implement-code](assets/skills/my-implement-code/SKILL.md) | 按规格实现代码 | 遵循项目约定，逐步实现与验证，遇到设计冲突先对齐 |
| [my-review-code](assets/skills/my-review-code/SKILL.md) | 评审代码与交付质量 | 对照需求审查真实路径，按影响分级，附证据与最小修复建议 |
| [my-create-worktree](assets/skills/my-create-worktree/SKILL.md) | 创建隔离工作区 | 隔离 Git 分支与工作目录，支持并行开发 |
| [my-create-memory](assets/skills/my-create-memory/SKILL.md) | 沉淀长期偏好 | 审慎提炼、合并和修订偏好，按项目与场景复用 |
| [my-ai-infra](assets/skills/my-ai-infra/SKILL.md) | 管理 AI 开发配置 | 初始化项目、选择工具与资产，预览、同步并检查安装 |

每个 Skill 都可以独立调用，也可以由 Prompt 连续编排。已有明确需求或方案时，从对应阶段接续即可。

## 文档

[GitHub 源码仓库](https://github.com/shanggqm/my-ai-infra) · [问题反馈](https://github.com/shanggqm/my-ai-infra/issues)（当前为 private，需要仓库访问权限）

- [使用指南](docs/usage.md)：配置、同步、升级与恢复。
- [资产管理](assets/README.md)：统一维护 Skill、Agent、Prompt 与扩展能力。
- [个人记忆](docs/memory.md)：积累开发偏好，管理跨项目与项目内的长期记忆。
- [开发与发布](docs/releasing.md) · [故障排查](docs/troubleshooting.md) · [版本记录](CHANGELOG.md)

## 致谢与许可

感谢开源社区对 SDD、Agent 协作与工程实践的持续探索。my-ai-infra 在这些经验之上做取舍与整合，追求精简、易用、可持续演进的开发体验。

项目采用 [MIT 许可证](LICENSE)。第三方资产的来源与授权状态见[来源与许可说明](THIRD_PARTY_NOTICES.md)。
