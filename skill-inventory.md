# AI Coding Skill 清单与命名审视

`my-ai-infra` 保持个人可选择的 SDD 基础，内置名称统一采用 `my-动作-对象`。当前 9 项分别是 7 个默认 SDD Skill、1 个可选编码辅助 Skill、1 个可选资产管理 Skill。已补齐方案审查，验证证据由实现与代码审查阶段维护；规格变更、小修分流和跨会话恢复仍为后续候选。完整工作流的可靠性由规格、测试证据和配置共同保证。

## 参考范围与差异

盘点日期：2026-10-13。参考 chat AI Infra 清单（`chat/packages/ai-infra/catalog/catalog.json`，外部参考） 与 命名规范（`chat/packages/ai-infra/assets/skills/bxy-core-ai-infra/references/naming-convention.md`，外部参考）。清单与磁盘共 49 个 Skill：11 个 core、27 个根项目 addon、11 个 iOS addon。其他资产包括 instruction 7、rule 3、command 2、tool 2、editor-config 6、MCP 1、agent 1、hook 1、library 1。

chat 的 core 表达团队稳定必装，addon 表达可装卸自研能力，vendor 表达规范化后的第三方资产。它还维护 scope、稳定 ID、版本、摘要、依赖和 legacyAliases。个人版借鉴命名一致、来源可追溯与改名兼容，默认选择始终可取消；团队发布审批、移动端项目策略和内部服务不随之迁入。

## 当前命名与策略

内部清单以 [catalog/skills.json](catalog/skills.json) 为唯一登记源。目录 basename、frontmatter name、配置中的 canonical 名一致。使用小写 ASCII、数字、单连字符，总长度不超过 64；类别和默认策略放在元数据中。内置自有名称使用 `my-` 前缀，以减少和其他安装包的同名碰撞。第三方 Skill 保留作者身份与许可信息，无需强制改成个人前缀。

| 原名称 | 当前名称 | 类别 | 安装策略 |
|---|---|---|---|
| `create-feature` | `my-create-feature` | SDD | 默认，可取消 |
| `generate-prd` | `my-create-prd` | SDD | 默认，可取消 |
| `create-tech-design` | `my-create-design` | SDD | 默认，可取消 |
| `新增` | `my-review-design` | SDD | 默认，可取消 |
| `create-test-plan` | `my-create-test-plan` | SDD | 默认，可取消 |
| `implement-feature` | `my-implement-code` | SDD | 默认，可取消 |
| `review-code` | `my-review-code` | SDD | 默认，可取消 |
| `create-worktree` | `my-create-worktree` | 编码辅助 | 可选 |
| `my-ai-infra` | `my-ai-infra` | 资产管理 | 可选；全局入口由 setup 安装 |

文档、上下文包和辅助资产创建统一使用 `create`：需求包、PRD、技术方案、测试计划和 worktree。`implement` 表达按方案实现代码；`review` 表达方案或代码审查；`verify` 表达用当前证据验证交付。管理入口保留 `my-ai-infra`。

0.2.0 的 `my-init-feature`、`my-generate-prd`、`my-design-tech`、`my-plan-test` 与 0.3.0 的 `my-create-code` 保留为配置别名。编码入口统一为 `my-implement-code`。分类和默认安装策略在 catalog 中维护，动作名称保持职责明确。

旧名保留为配置输入别名，不重复安装两套 Skill。只读预览会解析为新名；应用时迁移旧个人目录并保留备份，再按受管状态迁移项目副本。个人源旧名和新名同时存在时报告冲突，不静默选一份。未受管的旧文件仍由用户管理。现有会话中的旧 Skill 调用名需要重新加载工具；CLI 配置别名兼容不等于保留旧斜杠命令。

## 49 个参考 Skill 的逐项取舍

方案审查已使用独立实现补齐；其余标为“补充”和“扩展”的项仍为后续方案，未直接复制参考工程的实现。

| chat Skill | 个人版取舍 | 对应能力与边界 |
|---|---|---|
| `bxy-core-ai-infra` | 保留对应能力 | my-ai-infra 已具备装配、编辑和诊断；个人版不引入团队 promote/owner 审批。 |
| `bxy-core-commit-code` | 推荐可选 | my-commit-code；控制暂存范围，提交、推送、CI 分别按用户意图执行。 |
| `bxy-core-create-main-worktree` | 已覆盖为可选 | my-create-worktree；默认基于调用工作区 HEAD，冲突让用户选择；仅执行 Git 创建，环境准备按各项目约定单独处理。 |
| `bxy-core-deploy` | 项目扩展 | my-deploy-project；依赖目标项目发布方式，不能移植内部部署 CLI。 |
| `bxy-core-design-tech` | 已覆盖 | my-create-design；沿用真实代码路径和任务拆解。 |
| `bxy-core-generate-prd` | 已覆盖 | my-create-prd；保留验收标准与来源关联。 |
| `bxy-core-implement-code` | 已覆盖 | my-implement-code；实现和验证分开记录，提交遵循用户授权。 |
| `bxy-core-init-feature` | 已覆盖 | my-create-feature；由 Skill 内 template/ 与 scripts/init-feature.mjs 初始化最小需求包，编号与索引由脚本维护；FEATURE_LAYOUT.json 登记产物路径，目录随实际产出创建，只读校验不强制未来阶段，冲突保留现场。 |
| `bxy-core-plan-test` | 已覆盖 | my-create-test-plan；增强需求到测试的对应关系。 |
| `bxy-core-review-code` | 已覆盖 | my-review-code；保持规格、设计与实现对照。 |
| `bxy-core-review-design` | 已补齐 | my-review-design；实施前核对规格、方案和现有代码，作为推荐默认项。 |
| `bxy-addon-analyze-data` | 业务扩展 | 数据查询与分析依赖业务数据和权限，独立于通用 Coding 基础。 |
| `bxy-addon-analyze-error` | 优先补充为可选 | my-debug-code；通用复现、定位、修复、回归，日志后端由项目配置。 |
| `bxy-addon-compare-client-protocol` | 业务扩展 | 可借鉴协议对照方法；现实现与 chat 多端协议和分支约定绑定。 |
| `bxy-addon-conflux-config` | 业务扩展 | 内部配置中心及环境策略，通用个人版不内置。 |
| `bxy-addon-create-skill` | 不纳入基础包 | 个人资产创作按需使用独立工具。 |
| `bxy-addon-design-artifact-svg` | 暂不纳入 | 文档封面属于呈现扩展，对 SDD 交付链没有基础依赖。 |
| `bxy-addon-design-benchmark` | Agent 项目扩展 | 评测集与 rubric 设计，仅 AI/Agent 产品需要该专用能力包。 |
| `bxy-addon-fetch-sls-dataset` | Agent 项目扩展 | 数据采集依赖 SLS、日志格式及数据权限。 |
| `bxy-addon-generate-doc-artifact` | 合并为后续可选 | my-render-doc；Markdown 保持 canonical，阅读视图按需生成。 |
| `bxy-addon-generate-prd-html` | 合并为后续可选 | 归入 my-render-doc 的 PRD 视图，不单建一个默认 Skill。 |
| `bxy-addon-generate-review-html` | 合并为后续可选 | 归入 my-render-doc 的评审视图。 |
| `bxy-addon-generate-tech-design-html` | 合并为后续可选 | 归入 my-render-doc 的方案视图。 |
| `bxy-addon-merge-to-main` | 推荐可选 | my-open-pr；创建和维护 PR，不默认合并、推送或改写历史。 |
| `bxy-addon-optimize-prompt` | Agent 项目扩展 | 面向 Prompt/Agent 产品优化，依赖评测反馈。 |
| `bxy-addon-prompt-eval-loop` | Agent 项目扩展 | 多轮评测优化编排，需费用、终止条件和环境边界。 |
| `bxy-addon-report-benchmark` | Agent 项目扩展 | 评测报告能力随评测能力包提供。 |
| `bxy-addon-run-auto-eval` | Agent 项目扩展 | 独立 Judge、评分与恢复机制可借鉴，模型和费用由项目选择。 |
| `bxy-addon-run-benchmark` | Agent 项目扩展 | 运行环境和测试接口需通用化，独立插件包提供。 |
| `bxy-addon-test-e2e-app` | 按项目可选 | my-test-app；需要设备、平台和测试工具环境。 |
| `bxy-addon-test-e2e-web` | 按项目可选 | my-test-web；接入项目真实浏览器测试工具和验收入口。 |
| `bxy-addon-triage` | 后续可选 | my-triage-repo；巡检有明确需求时再加入，调度不由 Skill 自行创建。 |
| `bxy-addon-trigger-ci` | 按项目可选 | my-run-ci；不预设 Jenkins、凭据或构建参数。 |
| `bxy-addon-umeng-cli-uapm` | 暂不纳入 | 友盟性能指标查询，属于业务运维集成。 |
| `bxy-addon-umeng-cli-uapp-channel-version` | 暂不纳入 | 友盟渠道与版本业务分析。 |
| `bxy-addon-umeng-cli-uapp-core-index` | 暂不纳入 | 友盟产品增长指标。 |
| `bxy-addon-umeng-cli-uapp-retention` | 暂不纳入 | 友盟用户留存分析。 |
| `bxy-addon-validate-html-artifact` | 合并为后续可选 | 归入 my-render-doc 的内容覆盖校验。 |
| `bxy-addon-ios-app-runtime-inspect` | 平台扩展，可选 | 仅 iOS 项目选择；现实现依赖 official-app、Xcode/MCP 或真机环境，不进入通用默认包。 |
| `bxy-addon-ios-create-page` | 平台扩展，可选 | 仅 iOS 项目选择；现实现依赖 official-app、Xcode/MCP 或真机环境，不进入通用默认包。 |
| `bxy-addon-ios-device-logs` | 平台扩展，可选 | 仅 iOS 项目选择；现实现依赖 official-app、Xcode/MCP 或真机环境，不进入通用默认包。 |
| `bxy-addon-ios-directory-layout` | 平台扩展，可选 | 仅 iOS 项目选择；现实现依赖 official-app、Xcode/MCP 或真机环境，不进入通用默认包。 |
| `bxy-addon-ios-lldb-device-debug` | 平台扩展，可选 | 仅 iOS 项目选择；现实现依赖 official-app、Xcode/MCP 或真机环境，不进入通用默认包。 |
| `bxy-addon-ios-release-publish` | 平台扩展，可选 | 仅 iOS 项目选择；现实现依赖 official-app、Xcode/MCP 或真机环境，不进入通用默认包。 |
| `bxy-addon-ios-setup-dev-env` | 平台扩展，可选 | 仅 iOS 项目选择；现实现依赖 official-app、Xcode/MCP 或真机环境，不进入通用默认包。 |
| `bxy-addon-ios-skills-management` | 平台扩展，可选 | 仅 iOS 项目选择；现实现依赖 official-app、Xcode/MCP 或真机环境，不进入通用默认包。 |
| `bxy-addon-ios-test-workflow` | 平台扩展，可选 | 仅 iOS 项目选择；现实现依赖 official-app、Xcode/MCP 或真机环境，不进入通用默认包。 |
| `bxy-addon-ios-xcode-mcp` | 平台扩展，可选 | 仅 iOS 项目选择；现实现依赖 official-app、Xcode/MCP 或真机环境，不进入通用默认包。 |
| `bxy-addon-xcode-cli-tools` | 平台扩展，可选 | 仅 iOS 项目选择；现实现依赖 official-app、Xcode/MCP 或真机环境，不进入通用默认包。 |

## 五个 SDD 脚手架的可复用机制

这部分以课程仓库的 共享研究（课程仓库 `research/shared/sdd-project-comparison/README.md`，不随包分发） 及其固定源码为依据。Spec Kit 是 `6c62e10d5ab1` 开发快照，OpenSpec 是 `9111a7654d78`，cc-sdd 是 `e2a0c671aef3`，BMAD 是 `9f1987169a2e` 的 V7 预览，GSD 是 `a5bf9967da3c` 的 next 快照。名称与机制只代表这些版本；没有把静态设计主张当作学习成本或交付效果证明。

| 项目与相关入口 | 值得借鉴的具体机制 | 在个人版的落点 | 保留的边界 |
|---|---|---|---|
| Spec Kit（课程仓库 `research/shared/sdd-project-comparison/reports/spec-kit.md`，不随包分发）：constitution、specify、clarify、analyze、tasks、implement、converge | 项目原则向下传递；需求与任务可追溯；按 missing/partial/contradicts/unrequested 查验偏差并生成补缺任务 | 澄清嵌入 PRD；任务补需求 ID；在实现与代码审查中追溯需求及当前运行证据 | converge 的模板约束依赖宿主执行，不能仅凭模板或任务勾选宣称收敛 |
| OpenSpec（课程仓库 `research/shared/sdd-project-comparison/reports/openspec.md`，不随包分发）：propose、explore、apply、update、sync、archive，verify 为可选扩展 | 当前稳定规格与本次变更差量分离；修改计划与同步规格是不同动作 | 新增 my-change-spec 候选，明确变更影响；长期规格回写责任放在该 Skill 与归档约定 | 当前工程的 Feature 文档结构继续使用；先定义规范真源，再考虑主 specs，避免双真源 |
| cc-sdd（课程仓库 `research/shared/sdd-project-comparison/reports/cc-sdd.md`，不随包分发）：discovery、steering、spec-quick、spec-tasks、review、debug、verify-completion | 新需求/已有规格扩展/小修路由；任务带边界与依赖；成功声明必须匹配当前代码的新证据 | 路由作为可选 my-start-work；增强 my-create-design；实现与代码审查明确记录通过、未验证或需人工验证 | 不强制固定 subagent API，不照搬审批布尔值为真人批准，不把任务并行标记当执行并行 |
| BMAD（课程仓库 `research/shared/sdd-project-comparison/reports/bmad-method.md`，不随包分发）：bmad-spec、bmad-build、project-context、ticket、review | 五字段规格内核：目标、能力、约束、非目标、成功信号；按规模裁剪路径；变更先修改所属源，再更新派生产物 | 小修保留最小意图契约；my-quick-fix 候选；先增强 BRIEF 和项目上下文，不搬整套角色菜单 | persona 不等于运行的 Agent；V7 预览技能体系不等同稳定线；不按固定行数机械判风险 |
| GSD（课程仓库 `research/shared/sdd-project-comparison/reports/gsd-core.md`，不随包分发）：discuss、plan、execute、verify-work、quick、pause-work、resume-work、next | 明确固定决策与自由裁量；执行和验收分离；交接记录下一动作、阻塞及真实工作区状态 | my-resume-work 候选；小修路径保留验证结果；my-start-work 可导航下一步 | 不复制整套上下文预算、Hooks、模型路由及自动提交假设；中断恢复应先核对当前状态 |

五者的资产计数口径不同：Spec Kit 的 10 个核心命令模板会派生成不同宿主入口；OpenSpec 有 12 个工作流、其中 6 个默认；cc-sdd 每宿主 17 个 Skill；BMAD 33 个顶层 Skill 包含 persona 与模块记录；GSD 的 72 个 Skill 从 72 个命令派生，不能相加为 144 种能力。个人版应按职责去重，按需组合。

2026-10-14 调整：移除独立的 `my-verify-feature`。当前实现与代码审查已覆盖需求一致性、实际运行证据及未验证事项，继续增加验收步骤会重复收集材料和维护报告。`my-implement-code` 负责实现与运行检查，`my-review-code` 独立审查契约、系统风险与证据有效性；完成声明仍须关联当前代码的证据，不能为让检查通过而降低原验收条件。项目确有业务验收要求时沿用其现有约定。

## 补充优先级

方案审查已补齐，独立验收已移除：现有包共 10 个内置 Skill 与 7 个默认选择。其余 P1/P2/P3 保持后续候选。

| 优先级 | 建议 Skill | 默认策略 | 完成标准 |
|---|---|---|---|
| P0 已实现 | `my-review-design` | 默认，可取消 | 对照 PRD、设计和现有代码，输出定位明确的问题与复核结论 |
| P1 | `my-change-spec` | 按需可选，活跃迭代项目常备 | 记录意图变化，分析对设计、任务、测试和实现的影响，先更新权威源再更新下游；不把实现缺陷改写成新需求 |
| P1 | `my-quick-fix` | 可选 | 低风险小修使用简短目标、范围、验收和验证记录；出现权限/协议/迁移等风险时升级完整流程 |
| P1 | `my-resume-work` | 可选 | 恢复目标、已定决策、完成与未完任务、阻塞、真实 Git 状态及下一动作，不盲信旧进度 |
| P1 | `my-start-work` | 可选导航入口 | 根据现有资产与意图区分新需求、变更、小修、排障、恢复；用户无需记忆全部入口 |
| P1 | `my-debug-code` | 推荐可选 | 复现 → 证据 → 根因 → 最小修复 → 回归，保留问题、修改和验证关联 |
| P1 | `my-commit-code` | 推荐可选 | 暂存范围明确，提交信息准确；commit、push、amend、CI 分别遵循授权 |
| P1 | `my-open-pr` | 推荐可选 | 从已验证变更生成评审说明；合并与发布单独执行 |
| P2 | `my-test-web` / `my-test-app` | 按技术栈选择 | 验收场景映射到项目已有 E2E 工具并保留运行结果 |
| P2 | `my-run-ci` / `my-deploy-project` | 按项目选择 | 环境、命令、凭据来源、回滚和结果查询明确 |
| P2 | `my-render-doc` | 可选 | PRD、方案、评审共用阅读视图路由，Markdown 保持真源 |
| P3 | `my-triage-repo` | 可选 | 整理可执行问题，持续调度由用户另行指定 |

当前基础包包含 7 个推荐默认能力：需求、PRD、技术设计、方案审查、业务测试计划、实现与代码审查。业务测试计划可在需求、开发、提测和变更后按需调用。个人仍可取消选择。新需求沿研发主线推进；需求变化走 change-spec，小修走 quick-fix，中断走 resume-work。全局 my-ai-infra 负责工具资产装配，start-work 若实现则负责开发任务导航，二者职责分开。

## 可以先不拆成 Skill 的能力

- **需求澄清与项目原则**：先增强 my-create-feature / my-create-prd，并复用目标项目已有 AGENTS 和架构文档。需要完整交互澄清协议时再拆 my-clarify-feature；不为每个专业视角新增默认入口。
- **任务拆解与执行测试**：my-create-design 已有文件级任务表，包含验收编号、职责边界、依赖和验证方式；暂不另建 my-plan-tasks。my-create-test-plan 聚焦业务验收场景、AI 或人工可执行用例及开发测试缺口，按请求执行业务验收；my-implement-code 读取既有评审与计划并运行检查，my-review-code 核验需求一致性、系统风险与验证证据，代码审查后按项目约定收尾。
- **安全、性能、数据库迁移和依赖更新**：保留在设计与评审的相关维度；特定业务需要专用工具和知识时再拆专项。
- **技术栈与命令**：语言、测试命令、数据库、环境变量属于项目说明和配置。CLI、模板和确定性脚本承担可靠机械操作；Hooks 与 Agent 需要独立适配时才增加。
- **团队审批与遥测**：个人版保留版本和来源即可，暂不引入 code owner、强制晋级、埋点后端和跨项目自动升级。

## 本次发现并修正的现有问题

- 实现 Skill 原先要求每个单元自动提交。现将实现与验证作为默认结果，Git 提交遵循用户已有授权。
- Web 曾重复维护英文名到中文说明的表。现直接读取 catalog 标签，配置别名也由同一登记源解析。

## 验证范围

命名登记、frontmatter、文档与 manifest 路径、递归资源链接，以及 CLI/Web 装配和旧名迁移由自动检查覆盖。脚本行为使用自动回归测试验证。自动装配测试不代表四种商业工具已完成模型行为验收；其余候选仍待实现和验证。

## 阶段结束后的下一步提示

借鉴 Spec Kit 在命令模板中声明后续目标和预填请求的机制，个人版将其落实到 7 个 SDD Skill 的最终回答，不依赖某个宿主支持额外 frontmatter。通用行为写入安装指令，各 Skill 按自身结果定义正常、补缺和结束分支；提示不自动取得授权或推进状态。上游固定提交参考：[Spec Kit plan 模板](https://github.com/github/spec-kit/blob/6c62e10d5ab1/templates/commands/plan.md)。

## 个人记忆 MVP

新增 [my-create-memory](assets/skills/my-create-memory/SKILL.md) 作为辅助能力，默认初始化安装，已有项目需显式选中。以宁缺毋滥为准入原则，7 个 SDD Skill 按条件委派；记忆正文保存在个人库，每个范围一个 memory.md。详见[个人记忆指南](docs/memory.md)。
