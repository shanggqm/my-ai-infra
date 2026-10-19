# Feature 998 验收记录

> 日期：2026-10-18 | Profile：standard | Phase：review

[返回需求简报](../BRIEF.md) · [测试计划](TEST_PLAN.md) · [代码评审](../review/code_review.md)

## 当前结论

T-01～T-07 已实现，242 项自动化测试与实际 npm 包隔离安装验收通过，独立代码评审发现均已修复并复查。W-01 的资源与实际行为复查已关闭。T-08 已完成 30 个 Codex 场景，结合自动化覆盖 AC-01～20，Claude Code、Cursor、Copilot 的模型行为仍待验证；本 Feature 保持 review，不结项。

实现包含七个原子阶段 Skill 的动态输入输出、共享阶段契约、simple PRD/技术方案模板、三个场景 Prompt 的组合规则，以及唯一 Profile 注册表、稳定目录、新旧 ROADMAP 兼容和中断恢复规则。`my-simple-feature` 为新增 Prompt，未增加同名源 Skill。未修改 Web 行为、运行时依赖或版本，未提交、推送或发布。

## 被测基线与证据

- 仓库基线：`b82c0733c1a67c618a2c7becd71f82fa6b5ea460`；工作分支：`feature/998-adaptive-sdd-workflows`；包版本：`0.0.12`。
- 独立代码复查的 37 个非规格变更文件聚合 SHA-256：`460ef4cafa1bb5ebeb33842c91e17f8a135960937e6306ebc27988012c1bc7db`，见代码评审记录。
- 分发包 SHA-256：`d933edb57edd51ccd0b330710e84a2163bb23ac82799bce9517f71b39163ffd2`，90 个条目；[分发报告](../../../dist/release-report.json)时间为 `2026-10-17T16:19:41.078Z`（本地 10 月 18 日）。
- Codex CLI：`0.154.0-alpha.6.2`；同配置元信息探针显示模型 `gpt-6-astra`、provider `openai`、reasoning effort `none`。每例使用 `--ignore-user-config --ephemeral --sandbox workspace-write`、`approval_policy="never"`，独立临时项目与个人库，安装当前项目资产。
- 每例记录输入、fixture Git 基线、资产哈希、实际命令与输出、diff、产物哈希。原始轨迹及产物快照保存在忽略目录 `dist/feature-998/codex/<case>/`；元信息在 `dist/feature-998/host-probes/`。持久摘要收录到 [EVIDENCE.json](EVIDENCE.json)。退出码 0 只表示 Agent 结束，场景结论依据实际轨迹与差异。
- 最终分发验收后只维护本 Feature 规格与结果记录。较早 fixture 使用的初始化脚本版本在机器证据中单独记录；旧模板与动态 default 的边界修复由最终自动化回归验证，相关新 fixture 使用最终脚本。

## 自动化与分发

执行 `MAI_CODEX_BIN=codex MAI_CLAUDE_BIN=claude npm run release:check`，其前置完整执行 `build:skill → lint → validate → test`，最终 **242/242 通过**，无跳过。测试包含注册表非法值/缺失/损坏、合法默认变化、旧无 Profile 模板、四列/五列/混合分区/歧义表头、CRLF、原行保护、编号与路径、锁、并发复核及失败回滚。

打包检查通过资源白名单、离线安装、四工具装配、模板与 simple 初始化、移动、重复同步、升级、冲突保留及 Web API 鉴权等既有检查。Codex `skills/list` 实际发现 10 个 Skill 加 4 个 Prompt 入口，Claude SDK 初始化实际发现项目入口及评审角色。入口发现与模型执行分别记录。分发检查不等于发布授权，也不等于浏览器交互回归；本次未改 Web 行为，未额外执行 `test:web`。

收尾检查：`npm run validate`、Feature 测试计划/代码评审路径校验、89 个本地文档引用及 `git diff --check` 均通过；30 个场景记录齐全，37 个实现文件与安装包哈希仍匹配上述通过基线。

## AC 实际结果

下表限定为当前 Codex 运行与自动化证据；其他宿主见后文。

| AC | 场景 / 证据 | 当前判定 |
|---|---|---|
| AC-01 | `tiny` 只改圆角和 placeholder，精确差异断言通过，无 Feature / ROADMAP 新增 | 通过；最终答复声称的 1/1 缺捕获日志，不作为证据 |
| AC-02 | `demo` 记录输入充分性，跳过 PRD，独立 simple 设计、实现、代码评审；6/6 与三个 CLI 结果 | 通过 |
| AC-03 | `isolation` 先设计及方案评审，旧实现复现 12 项失败，修复后 14/14，再代码评审 | 通过，含授权、越权和空授权反例 |
| AC-04 | `prototype` 交付自由文本与预设按钮静态原型，比较问题/标准/观察齐全；无查询，Phase=draft | 通过；区分静态观察与未验证的浏览器体验/用户判断 |
| AC-05 | `explore` 仅本地实验，12 次结果与文件一致，记录容量/授权未知及后续阶段退出；源码未变、draft 保持 | 通过；未将小样本结果外推为五百万行生产结论 |
| AC-06 | `risk` 保持 ID/simple/dev，补契约缺口与设计评审；1/1 只证明样例，两个授权反例暴露越权，暂停实施 | 通过；旧计划原文保留，当前设计/BRIEF/评审明确旧证据待复核，未宣称生产权限通过 |
| AC-07 | `legacy_prd` 无 Profile 且已有 PRD/设计/批注；旧参数初始化自动化通过 | 通过；旧 PRD/BRIEF/Phase/批注不变，另保留无 PRD 的旧设计增量维护证据 |
| AC-08 | `override` 自定义 layout/模板；`partial` 缺模板明确受阻草案；`badtemplate` 冲突模板零写入；`registry_missing` 缺注册表停止创建 | 通过；保留用户模板，无跨作用域补缺 |
| AC-09 | `create_only`、`prd_only`、`standard_new`、`review_only`、`w01` 单阶段；`full`、`auto_feature` 完整组合；`auto_design` 接续有效方案 | 通过；完整路径分别 3/3、4/4 和 4/4，有真实导入验收 |
| AC-10 | `fail` 真实命令退出 1，1 通过/1 失败，明确未通过；实现/规格/状态零改动。`insufficient` 与宿主缺环境保留待验 | 通过；未降低 AC 或伪造完成 |
| AC-11 | `multislice` 先第一段 3/3，再第二段 7/7，再第三段 8/8，最终五个 CLI 子进程断言通过 | 通过；保持 simple。`demo` 仅作最终联调证据 |
| AC-12 | 无 PRD：`w01`、`review_only`、`auto_design`；有 PRD：`fuzzy`、`full`，设计引用 PRD 的 AC | 通过；按登记源接续，未造占位 PRD |
| AC-13 | `fuzzy` 独立 simple PRD 与设计，PRD 为 AC-01～06 真源，设计引用，5/5 与真实终端交互通过 | 通过；两文档同批落盘，不声称两个独立工具调用 |
| AC-14 | `override`、`explicit`、`standard`、`standard_new`、`prd_only`、`badtemplate`、`partial` 和装配回归 | 通过；模板优先级、批注与原路径保留 |
| AC-15 | `insufficient` 权限/AC 未定仅交受阻草案；`review_only` 回传目标函数测试缺口，只写评审；完整组合接续 | 通过 |
| AC-16 | `migrate` 后补 PRD；`migrate_resume` 中断恢复，保留 AC/批注/历史证据，统一 PRD 真源并标待复验 | 通过；两场景均只维护规格，当前业务证据保持未验证 |
| AC-17 | 最终初始化回归覆盖合法/非法值、坏资源/默认值；`registry_missing` 在写入前停止；`create_only` simple 创建 | 通过 |
| AC-18 | 自动化同编号池和稳定目录；`explicit` 单文档标准模板不改 simple；`profile` 改档位不改 ID/路径 | 通过 |
| AC-19 | 最终自动化覆盖新旧表与歧义；`profile` 保留旧四列 CRLF 与备注；`profile_move` 四列到五列移动 | 通过；跨区重渲染且 CRLF、用户备注及外部 998 行保持 |
| AC-20 | `profile_readonly` 识别差异零写入；`profile` 以 BRIEF standard 修目标行，保留外部 998 备注、CRLF，前后复读 | 通过；模拟中断现场，未声称注入模型写入过程中的并发竞争 |

独立评审 Agent 只读复核了 tiny、demo、isolation、explore、override、standard、explicit、create_only、prd_only、badtemplate、profile_readonly，并追加核对 multislice/fuzzy 的实际阶段与产物，以及 risk、legacy_prd、profile_move、migrate、migrate_resume 的证据边界。原 Demo 未逐段验证、tiny 缺测试捕获输出的证据限制保留；随后 multislice 补齐 AC-11。部分场景最初误用重复 `--artifact` 参数，轨迹内已有逐个 artifact 正确重跑，未把失败检查计为通过。

## W-01 复查

- W-01a：`w01` 在无 PRD、旧项目测试模板固定“PRD AC”表头条件下，计划正确引用设计 AC-01/02 并解释表头语义；模板、BRIEF、设计、ROADMAP、源码及测试逐字节不变，仅生成计划。该调用明确只规划，业务运行证据由其他无 PRD 完整场景提供。
- W-01b：`standard_new` 用旧 standard 设计模板生成新方案，固定 PRD 字段填实际 BRIEF 来源；无占位 PRD，只新增设计及 BRIEF 索引，原批注/模板/Phase 保留。
- W-01c：acceptance-cases、delegation、Skill 元信息及分发 standard 模板已统一有效来源；已安装项目模板按 preserve 保留。资源回归与分发通过。

以上由独立评审 Agent 逐字节复核并在[方案评审](../review/design_review.md)第 8 节和[代码评审](../review/code_review.md)第 7 节记录关闭。

## 宿主矩阵与剩余工作

| 宿主 | 入口 / 装配 | 模型行为 | 继续条件 |
|---|---|---|---|
| Codex | 实际 skills/list 及重复同步通过 | 30 个场景覆盖本表全组，已核对轨迹与差异 | 当前通过；资产变更后按影响复验 |
| Claude Code | SDK 初始化实际发现全部入口与角色 | 未执行；CLI 返回 `Not logged in · Please run /login` | 在已登录宿主对隔离项目执行直接设计、PRD＋设计、高风险三例 |
| Cursor | 原生入口文件/链接装配通过 | 未执行；CLI 返回 `Authentication required`；UI 读取返回 AXError | 可用登录会话；先验证实际入口发现，再执行三例 |
| Copilot | 原生入口文件/链接装配通过 | 未执行；本环境无 Copilot CLI，现有 VS Code 扩展列表仅见 Copilot Labs | 可用 Copilot 宿主；验证实际入口发现并执行三例 |

复验按 [Prompt 行为评测](../../../test/prompt-evals.md) 和本测试计划，在安装同一资产基线的隔离项目执行；记录宿主/模型、输入、实际阶段、产物/差异、运行结果及哈希。未获得其余宿主代表路径证据前，T-08 保持未全部验收，BRIEF/ROADMAP 不更新为 done。无须重新实现已通过部分；资产变更后重跑受影响案例及规定自动化。

## 2026-10-19 修复定向验收

CR-W-03 / CR-W-04 已修复并复核关闭。当前资产执行 `npm run verify`，249/249 测试通过；其后在隔离副本执行 release-check 安装包阶段，13 组通过。两个实际 Codex 场景分别证明主文/候选名被占用时另选安全名称、其他阶段登记 basename 时复用已有合法附录；每组 41 个非目标条目保持，批注及 Phase 保留，路径校验与合计 27 处链接检查通过。

输入、调用、产物及摘要位于 `dist/feature-998/review-fixes-20261019/`。版本、命令、资源与包哈希以及证据边界详见[代码评审 §9](../review/code_review.md#9-两项兼容缺陷修复与复核2026-10-19)。本轮未改 Web 行为，未重跑浏览器；未修改真实安装副本或发布。

上述结果只更新 AC-17～20 的初始化兼容回归和 AC-21 的指定自定义命名/已有产物组合。AC-21 六类尚未全部执行，其他宿主矩阵继续待验，不能据此将 Feature 标为 done。
