# AGENTS.md

本文件记录 my-ai-infra 的开发入口、资产边界与验收要求，详细契约按任务查阅原文。

## 1. 项目概况

| 项目 | 说明 |
|---|---|
| 项目 | `@easyuseai/my-ai-infra`，提供 SDD 资产装配 CLI 与本地 Web 工作台 |
| 技术栈 | Node.js 22+、JavaScript ESM、原生 HTML/CSS/JS；npm 管理依赖，Playwright 用于浏览器回归 |
| 架构 | 单包独立 Git 仓库，同时作为 geektime-course 的子模块；CLI 与 Web 共用 `src/` 中的装配、存储和记忆实现 |
| 工程取舍 | 运行时无第三方 npm 依赖；统一资产源，通过适配入口支持多工具，并保留用户定制与恢复材料 |

## 2. 仓库结构

```text
bin/my-ai-infra.mjs       # mai / my-ai-infra 共用入口
src/                     # cli/web 入口；project 装配，store 个人库，conflicts 恢复，memory 偏好
assets/                  # 分发资产唯一源：skills、agents、prompts 及扩展类型
catalog/skills.json      # 内置 Skill 名称、别名与类别登记源
templates/mai-specs/     # 分发给目标项目的规格工作区模板
web/、design-system/    # 本地工作台与设计规范、tokens、图标
scripts/、test/          # 检查脚本、自动化回归与行为评测材料
docs/、manifest.yml     # 使用/维护契约与分发资源登记
mai-specs/               # 本仓库的需求、方案和交付记录
.agents/                # 本仓库已安装资产；rules 为项目规则，.generated 为派生入口
dist/                   # 忽略的发行包与检查报告
```

## 3. 开发命令

| 操作 | 命令 | 说明 |
|---|---|---|
| 安装开发依赖 | `npm ci` | 使用 `package-lock.json` |
| 启动工作台 | `npm start` | 启动本地 Web，使用终端给出的链接；默认关联当前项目和个人库 |
| 查看资产 | `npm run check` | 执行 CLI `catalog`，不是综合检查 |
| 检查 Skill 源 | `npm run build:skill` | 只读检查唯一源和附属资源，不复制或生成文件 |
| 源码检查 | `npm run lint` | JavaScript 语法、JSON 与源码空白检查 |
| 资源与文档检查 | `npm run validate` | 检查元信息、manifest、资源链接和 npm 配置 |
| 行为与集成回归 | `npm test` | `node --test test/*.test.mjs`，使用隔离临时目录 |
| 完整代码验证 | `npm run verify` | 依次执行 build:skill、lint、validate、test |
| 浏览器回归 | `npm run test:web` | 首次先运行 `npx playwright install chromium` |
| 分发验收 | `npm run release:check` | 先 verify，再打包并隔离安装验收；产物写入 `dist/`，不发布 |

以上命令在本仓库根目录执行。Node.js 版本要求见 `package.json#engines`；脚本还使用 Git/Bash。没有独立类型检查命令。浏览器可通过 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` 指定，截图输出通过 `MAI_WEB_ARTIFACT_DIR` 指向忽略目录，详见 [检查脚本说明](../../scripts/README.md)。

## 4. 规则与约束

### 业务规则

- `plan`、`doctor` 保持只读；安装与迁移只在显式写入流程执行。`apply` 保留加锁、预览 revision 校验、写入前状态复核、备份和失败回滚。
- 默认冲突策略为 `merge`，保留本地内容并保存候选；`replace` 先备份再替换；`abort` 有冲突时保持现场。未完成的装配不能报告健康，具体边界见 [使用指南](../../docs/usage.md)。
- 项目规则正文由项目维护，安装器不注入 SDD 正文；迁移保留已有独立规则与共享链接关系、用户文件和定制。`doctor` 的装配检查与宿主实际发现验证分别报告。
- 个人记忆不进入资产同步或 npm 包；召回仅使用当前范围和场景的 approved 条目，同 Key 的项目偏好优先，保存必须校验 revision。完整字段与上限见 [个人记忆](../../docs/memory.md)。

### 架构边界

- 可分发 AI 资产统一修改 `assets/`，Skill 唯一可编辑源为 `assets/skills/`。本仓库 `.agents/` 中的安装副本、工具入口和个人 runtime 均不作为分发源码；父课程的 Skill 软链接不得反向复制回来，构建不依赖父目录。
- 项目安装源使用 `.agents/<类型>/`；共享 Skill 入口为普通文件，其他工具按适配规则链接。Agent 原生格式位于 `.agents/.generated/`，修改中立源后同步重建，见 [资产管理](../../assets/README.md)。
- 运行时新增 npm 依赖须经过分发审视；CLI 与 Web 复用现有业务实现。扩展资产只负责文件装配，不自动执行 Hook 或启动 MCP 服务，也不替换整份宿主共享配置。

### 工程约定

- 修改前阅读 [README](../../README.md) 和相关源码；保留无关工作区修改与用户资产。
- Git 操作以本子模块为范围，与课程提交分开；提交前使用开发分支，先推送本仓库提交，再更新父仓库的子模块指针。
- `test/fixtures/legacy-instructions-0.0.2.md` 是冻结历史输入，保持不变；新增历史版本另行登记，见 [夹具说明](../../test/fixtures/README.md)。
- npm 分发排除顶层 `test/`、`scripts/` 与开发生成物；缓存、凭据、个人记忆和 `dist/` 不进 Git。
- 中文陈述直接表达结论，避免先否定一种描述再替换为另一种描述的对比句式。

### 安全与权限

- 个人库与项目目录不得互相嵌套；文件操作保持根目录边界，不沿未知目录软链接写入，不修改外部链接目标。
- Web 仅监听 `127.0.0.1`，保留 Host/Origin 校验和 API 的 `X-My-Ai-Token` 鉴权；应用变更必须提交当前预览的 revision。
- 未获得明确授权不得发布 npm 包。发布使用通过验收且 SHA-256 未变的 tarball，按 [发布指南](../../docs/releasing.md) 核对身份、版本、许可证及 GitHub/npm 顺序，不移动已发布标签。

## 5. 验证要求

| 变更类型 | 必须执行的验证 |
|---|---|
| 文档与资源引用 | `npm run validate`；其扫描范围外的本地链接另行核对 |
| 代码或脚本 | `npm run verify` |
| 打包与分发 | 另运行 `npm run release:check` |
| 浏览器行为 | 另运行 `npm run test:web` |
| Prompt / Skill 行为 | 按对应 `evals/` 或 `test/prompt-evals.md` 核对行为；装配测试不能替代宿主行为评测 |

当前仓库没有 CI workflow，以上入口由维护流程执行。发布前同时完成浏览器与实际安装包检查。测试和分发验收使用隔离项目及个人库，不操作真实用户配置；宿主发现的可选验证条件见发布指南。

交付说明实际执行的检查、结果、未验证项与剩余风险；计划或文件已生成不代表验收通过，本次承诺条件须有当前通过证据才能结项。

## 6. 知识与参考

| 涉及内容 | 查阅入口 |
|---|---|
| 安装、冲突、备份、旧布局与运行规则迁移 | [使用指南](../../docs/usage.md)、[故障排查](../../docs/troubleshooting.md) |
| 新增或修改资产及工具适配 | [资产唯一源](../../assets/README.md)、[Agent](../../docs/custom-agents.md)、[Prompt](../../docs/custom-prompts.md)、[Skill 登记](../../catalog/README.md) |
| 记忆存储、身份隔离、场景与并发 | [个人记忆](../../docs/memory.md)、[存储契约](../../assets/skills/my-create-memory/references/storage.md) |
| Feature 产物与路径 | [规格工作区](../../mai-specs/README.md)、[默认布局契约](../../assets/skills/my-create-feature/template/FEATURE_LAYOUT.json) |
| Web 视觉与资源 | [设计规范](../../design-system/BXY_DESIGN_SYSTEM.md) |
| 检查、发布与授权来源 | [脚本](../../scripts/README.md)、[发布指南](../../docs/releasing.md)、[第三方许可](../../THIRD_PARTY_NOTICES.md) |

## 7. 维护约定

- 需求、设计、测试与交付记录归 `mai-specs/`，随需求变化同步相关规格；Feature 编号交由 `my-create-feature` 脚本计算，产物按布局契约按需创建。
- 资产变更核对 `catalog/skills.json`、`manifest.yml` 与关联文档；分发版本保持 `package.json` 和 `manifest.yml` 一致，发布记录按发布指南更新。
- `docs/` 的相对链接须在实际 npm 安装包内可访问；详细契约保留在原文档，本文件提供入口。
- 根 `AGENTS.md` 当前链接到 `.agents/rules/AGENTS.md`，维护时编辑该正文并保留链接关系。
