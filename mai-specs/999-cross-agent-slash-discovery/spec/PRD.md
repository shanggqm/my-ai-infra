# PRD：四工具资产发现与调用

> 状态：draft；2026-10-15；需求负责人：用户

[返回需求简报](../BRIEF.md)

## 1. 背景与目标

用户已确认按各工具原生入口完整发现与调用：支持 `/` 使用 `/`，其他明确展示 `@`、`$`、角色选择或自动触发方式。0.0.8 的三个 Prompt 已装配但 ChatGPT 无菜单入口。目标是在目标目录 init 后，让用户找到全部已安装资产的正确入口、知道配置缺口，并能使用项目内正文。

## 2. 用户与场景

| ID | 场景 | 用户目标 | 关联 |
|---|---|---|---|
| US-01 | 首次 init，选择任意四工具子集 | 找到所选 Skill、三个 Prompt 与原生 Agent | FR-01/02 |
| US-02 | 旧项目 sync、定制 Prompt、导入新 Prompt | 入口跟随项目内容，保留定制与恢复能力 | FR-01/03 |
| US-03 | 安装 Hook、MCP 或扩展资产 | 知道实际文件、触发方式及配置要求 | FR-02/04 |

## 3. 业务流程

选择工具和 Skill → 只读预览与冲突处理 → 写入源及原生入口 → 展示入口说明 → 在宿主刷新或新建会话 → 选择并调用。安装缺失使用 doctor 检查后 sync 修复；配置依赖与宿主实测结果分别报告。

## 4. 功能需求

| ID | 触发与输入 | 预期行为与输出 |
|---|---|---|
| FR-01 | init/sync，内置或导入 Prompt | 保留名称和唯一正文；为 ChatGPT/Codex 提供可发现 Skill 入口，为其他工具提供支持的原生入口；不要求用户手动复制或全局 setup |
| FR-02 | plan/init/sync/doctor | 按工具列出选中 Skill、Prompt、Agent、规则及扩展资产的路径、调用方式、装配状态与配置限制 |
| FR-03 | 旧安装或定制内容 | 迁移受管旧入口，保留定制正文、未知文件、预览、备份、回滚及重复执行语义；名称冲突明确报错 |
| FR-04 | Hook/MCP/未知扩展 | 保留原生事件和权限语义，说明额外配置；仅复制文件不能标为已激活。当前通用扩展清单缺少注册协议，输出 configuration-required |

## 5. 交互与文案

沿用终端现有结果分组，新增“资产入口”，每行工具、资产名称、调用方式。末尾说明“此处检查文件装配；宿主菜单与实际调用需在对应客户端验证。” doctor JSON 新增 discovery，healthy 仍表示文件装配一致性，hostVerified 固定 false；宿主实测证据单独保存在验收记录。

## 6. 规则与约束

- BR-01：用户确认原生入口口径，不承诺统一 `/`。ChatGPT 使用 `@名称`；Codex CLI/IDE 使用 `$名称` 或 `/skills`。Claude Code、Cursor、VS Code Copilot 使用 `/名称`。
- BR-02：Prompt 源维持 `.agents/prompts/`，入口读取当前安装作用域的正文；项目移动、正文修改后有效。
- BR-03：Agent 保持角色委派/选择，规则自动加载；Hook/MCP 保持配置驱动。不自动调用模型、执行 hook 或连接 MCP 验证。
- BR-04：文件一致性、官方文档支持、宿主发现、真实调用四类证据分开；没有客户端证据的组合保持待验。
- NFR-01：无新增运行时依赖，保留全部现有冲突与备份保障，无法访问的链接不跟随写入。

## 7. 范围与依赖

本次实现覆盖项目 init/sync、既有全局 setup 兼容、doctor 与终端说明。四工具目标面为 ChatGPT 桌面/Codex、Claude Code CLI、Cursor IDE、VS Code Copilot。CLI 变体能力单列，不推定 IDE 证据适用于其他客户端。Hook/MCP 的自动注册器、宿主 UI 改造、发布新 npm 版本不在本次实现内；配置缺口仍计入发现报告。

## 8. 官方依据

- [OpenAI Skills](https://learn.chatgpt.com/docs/build-skills)、[旧 custom prompts](https://learn.chatgpt.com/docs/custom-prompts)
- [Claude Code Skills](https://code.claude.com/docs/en/skills)
- [Cursor Skills](https://cursor.com/help/customization/skills)
- [VS Code Copilot Skills](https://code.visualstudio.com/docs/agent-customization/agent-skills)

以上于本次对话查阅。Cursor 与 VS Code 支持共享 `.agents/skills`；Claude Code 保留 commands。最低版本只使用实际运行版本作为证据，不推定全历史版本兼容。

## 9. 验收标准

| ID | Given / When / Then | 验证方式 |
|---|---|---|
| AC-01 | 空目录 init 四工具后，全部选中 Skill 与三个 Prompt 有可发现原生入口，菜单名与调用语义正确 | 自动装配 + 四宿主发现/调用实测 |
| AC-02 | 导入自定义 Prompt、正文定制与项目移动后，调用读取当前项目正文；无多份可编辑正文 | 自动测试 + 只读调用证据 |
| AC-03 | 0.0.8 旧入口 sync 后安全迁移；重复 sync 无漂移，未知和定制文件可保留/恢复；被阻塞依赖不会误报就绪 | 迁移、冲突、回滚测试 |
| AC-04 | 当前目录、--project、中文及空格路径初始化与重复运行一致 | CLI/打包回归 |
| AC-05 | plan/init/sync/doctor 覆盖全部资产与工具组合，路径、入口、配置缺口和未实测状态明确 | JSON/终端测试 |
| AC-06 | 同名 Skill/Prompt 或本地入口冲突显式报告；不覆盖用户资产、不静默制造同名不同正文 | 冲突/预检测试 |
| AC-07 | npm run verify 与 release:check 通过；四宿主无运行证据项列待验，整体不能宣称验收通过 | 自动检查 + 验收矩阵 |

## 待确认事项

业务口径已由用户确认。宿主安装、登录及发现/调用验证能力在实施时核实；未取得证据的条件保留待验。

## 变更记录

2026-10-15：根据用户答复，把严格统一 `/` 修订为各工具原生发现与调用。
