# 发布指南

本次发行版本：`@easyuseai/my-ai-infra@0.0.14`，目标 dist-tag 为 `latest`。发布后以 npm registry 的版本和 integrity 核验结果为准。本指南的检查不会自动发布、登录、提交 Git 或创建标签。


`0.0.9` 已于 2026-10-15 发布到 npm，`latest` 与 registry integrity 已核验。213 项自动化测试、浏览器回归、Codex/Claude 发现检查及发布后的固定版本安装、四工具 init、doctor、Web 检查通过；宿主模型行为评测未执行。源码标签为 `v0.0.9`，对应提交 `2215f1f270fdc9a0ece8008b8555c34ccd96eb62`，见 [GitHub Release](https://github.com/shanggqm/my-ai-infra/releases/tag/v0.0.9)。

`0.0.10` 已于 2026-10-17 经负责人明确授权发布到 npm，`latest` 与 registry integrity 已核验。226 项自动测试、浏览器回归、Codex/Claude 发现检查、实际 npm 卸载重装后的个人 Skill 保留，以及发布后的固定版本安装、四工具 init/doctor、个人 Skill 导入复用和 Web 检查通过。源码标签 `v0.0.10` 指向 `08c51fda312c8c8ed2d2760c59da9a40c43bce01`，见 [GitHub Release](https://github.com/shanggqm/my-ai-infra/releases/tag/v0.0.10)。tarball SHA-256 为 `1da01bbcef0cfdc8a8107306765a5c7fb789fa62a4f0f9b8186a0dc3b0bd4f71`；宿主模型行为评测未执行。

`0.0.11` 已于 2026-10-17 经负责人明确授权发布到 npm，`latest` 与 registry integrity 已核验。231 项自动化测试、浏览器回归、实际 tarball 安装、Codex/Claude 资产发现和个人 Skill 卸载重装保留检查通过。发布后固定版本安装、CLI/Web 取消工具的目录清理、真源保留、个人 Skill 复用、doctor 和包内 Prompt 与发行源一致性检查通过。源码标签 `v0.0.11` 指向 `994f1fb2fbad85d1b0c3f8a2d0005e2f6305d1a1`，见 [GitHub Release](https://github.com/shanggqm/my-ai-infra/releases/tag/v0.0.11)。tarball SHA-256 为 `33e7799a3791fb2a86ca85b8228b980abfdb046aff338bc8a8e6fdee9ae823e8`；宿主模型行为评测未执行。

`0.0.12` 已于 2026-10-17 经负责人明确授权发布到 npm，`latest` 与 registry integrity 已核验。233 项自动测试、6 组浏览器回归、15 项实际 tarball 检查通过，包含 Codex/Claude 发现与个人 Skill 保留；发布后固定版本安装、四工具装配、个人 Skill 导入/编辑/同步、包内 Skill 一致性和 Web 认证共 5 组检查通过。入口 Skill 完成 6 个只读决策演练，未执行宿主模型真实业务调用。源码标签 `v0.0.12` 指向 `f7482aabe1008207ee52537c30d3473f285096b5`，见 [GitHub Release](https://github.com/shanggqm/my-ai-infra/releases/tag/v0.0.12)。tarball SHA-256 为 `64a191831d763c7caee3a0b455fca60d22d171de05224a74ead99447ff848627`。

`0.0.13` 已于 2026-10-19 经负责人明确授权发布到 npm，`latest` 与 registry integrity 已核验。249 项自动化测试、7 组浏览器回归及 16 组实际 tarball 检查通过，包含 Codex/Claude 资产发现；包内 105 个文件与合入提交逐字节一致。发布后固定版本下载/安装、四工具 init/doctor、包内容一致性、simple 初始化、个人 Skill 导入/同步及 Web 鉴权共 5 组通过。源码标签 `v0.0.13` 指向 `9ecc1dd500608bc84364b5bb3c0f1f527f8f9663`，见 [GitHub Release](https://github.com/shanggqm/my-ai-infra/releases/tag/v0.0.13)。tarball SHA-256 为 `ad09c107ce58b923b290b924e81c3b8e525a91eb16ccc4ae61aa4d5df995e9a4`，GitHub 附件与 npm 下载包一致。新增自适应 SDD 流程、技术债分析及兼容修复；两个实际 Codex 附录定向场景通过，AC-21 全组、部分跨宿主行为与 994 R-05 继续待验，Feature 保持原状态。原始复制资产的来源与许可登记继续如实保留。

`0.0.14` 已于 2026-10-25 经负责人明确授权发布到 npm，`latest` 与 registry integrity 已核验。276 项自动化测试、8 组浏览器回归及 17 组实际 tarball 检查通过，包含 Codex/Claude 对 15 个 Skill 的资产发现；包内 114 个文件与合入提交逐字节一致。发布后 7 组固定版本检查通过，覆盖 registry 与下载包、隔离安装和四工具 init/doctor、旧 Prompt 清理、当前工作流 Skill、simple 初始化、个人 Skill 导入/同步、格式化脚本执行与 Web 鉴权。源码标签 `v0.0.14` 指向 `4e2012b468180c80fab678a3d4a9da8b038b61c1`，见 [GitHub Release](https://github.com/shanggqm/my-ai-infra/releases/tag/v0.0.14)。tarball SHA-256 为 `4f747ccca20b446384b2449769e742ecddfffe17fc4887cafb44f2e30ea7ee49`，GitHub 附件与 npm 下载包一致。升级后执行 `mai init`，旧 Prompt 正文和入口会被丢弃并替换为当前包的同名 Skill。模型端到端行为、Cursor/Copilot 真实菜单和格式化 Hook 的真实宿主事件触发继续待验，Feature 992 / 993 保持 review。原始复制资产的来源与许可登记继续如实保留。

## 发布前的负责人事项

- 决定发行版本和 dist-tag，确认该 npm 名称/版本可由当前账号发布。
- 确认[复制资产的分发授权与许可证](../THIRD_PARTY_NOTICES.md)。项目采用 MIT 许可证；复制资产的上游分发授权仍需核实。
- 源码仓库为 [shanggqm/my-ai-infra](https://github.com/shanggqm/my-ai-infra)，当前可见性为 public，可通过仓库 Issues 反馈。
- 核对[版本记录](../CHANGELOG.md)、Node.js 支持范围及使用指南，保留证据中的已测/未测边界。

正式发布前查询目标包并核对登录身份：

```bash
npm view @easyuseai/my-ai-infra name versions --registry=https://registry.npmjs.org/
npm whoami --registry=https://registry.npmjs.org/
```

## 从源码完成检查

在本项目源码目录运行：

```bash
npm ci
npx playwright install chromium
npm run test:web
npm run release:check
```

这个命令顺序执行 Skill 源检查、源码检查、元信息/资源校验、完整测试，再创建并验收实际 `.tgz`。`prepack` 只检查当前分发快照。直接对源码执行 `npm publish` 时，`prepublishOnly` 会先运行 `verify`。

发布前可使用本机 Codex 引擎追加真实发现检查（不发起模型请求）：

```bash
MAI_CODEX_BIN="$(command -v codex)" MAI_CLAUDE_BIN="$(command -v claude)" npm run release:check
```

也可将 `MAI_CODEX_BIN` 指向 ChatGPT 自带的 Codex 可执行文件。`MAI_CLAUDE_BIN` 启用 Claude SDK 初始化检查，核对项目 Skill 和角色；禁用 hooks 与 MCP，不发送模型请求。检查对实际安装包运行全局 `mai init` 和重复 `sync`，调用 `skills/list` 并核对所有选中 Skill 均已启用、路径位于目标项目中。显式配置后，发现失败会使发布检查失败；未配置时仍强制检查每个共享 `SKILL.md` 是普通文件。`doctor` 检查装配一致性，宿主发现检查验证客户端实际识别，两者分别保留验证结果。

产物位于 `dist/`：

- `easyuseai-my-ai-infra-0.0.14.tgz`：通过验收的实际安装包。
- `release-report.json`：文件清单、大小、SHA-256、npm integrity 与实际装配检查结果。

检查使用独立临时目录与 npm cache，不触碰真实个人库或全局工具目录。它验证 npx 入口、四种工具安装、重复同步、冲突保护、Feature 脚本/模板及包内 Web 的 Logo、字体、tokens 与认证。结束后清理临时安装环境，保留发行包和报告。

源码开发使用 Node.js 22+、npm 与 Git/Bash；没有运行时 npm 依赖。代码检查覆盖 JavaScript 语法、JSON 解析和源码空白，自动测试覆盖脚本行为与文件装配。所有 Skill 的唯一源均位于本仓库 `assets/skills/`；独立克隆与课程 submodule 使用相同源码和检查流程，课程侧仅通过软链引用。

## 本地预演与正式发布

先安装已检查的本地包试用：

```bash
npx --yes --package=/absolute/path/to/dist/easyuseai-my-ai-infra-0.0.14.tgz my-ai-infra --version
npx --yes --package=/absolute/path/to/dist/easyuseai-my-ai-infra-0.0.14.tgz my-ai-infra web --port 0
```

需要时预演发布，再由维护者显式执行正式发布：

```bash
npm publish ./dist/easyuseai-my-ai-infra-0.0.14.tgz --dry-run --access public --registry=https://registry.npmjs.org/
# 确认授权、身份、版本及检查报告后，再执行：
npm publish ./dist/easyuseai-my-ai-infra-0.0.14.tgz --access public --registry=https://registry.npmjs.org/
```

发布已检查的 tarball 可以避免重新从变化后的源码打包。npm 对 tarball 发布不会替你运行源码的 `prepublishOnly`，因此必须先完成 `release:check` 并确认 SHA-256 未变。dry-run 不替代真实账号权限和服务端规则检查。参见 [npm lifecycle](https://docs.npmjs.com/cli/v11/using-npm/scripts/) 与 [npm publish](https://docs.npmjs.com/cli/v11/commands/npm-publish/)。

预发布版本使用语义版本号（例如 `0.0.14-beta.1`）和明确的 `--tag beta`；稳定版本通常使用 latest。npm 不能用同一个名称/版本覆盖已发布内容；发现问题时修复后发布新的补丁版本。

发布后核对 registry 版本、integrity，并在空目录中运行固定版本 npx 的版本查询、init、doctor 和 web。更新本节的发布状态与 CHANGELOG 日期，再按独立仓库约定创建对应 Git 标签；不要把生成的 cache、个人库、测试项目或凭证提交到源码。

## GitHub 与 npm 同步发行

1. 在发布分支整理变更记录与版本号，完成源码、浏览器和实际安装包检查，通过 PR 合入默认分支。
2. 确认最终安装包内容与合入提交一致，创建并推送带注释的 `v<版本>` 标签；标签创建后保持不变。
3. 创建同名 GitHub Release 草稿，写明变更、升级方式和验证结果，附上已验证的 npm `.tgz` 与 `SHA256SUMS`。
4. 将同一 `.tgz` 发布到 npm，核对版本、latest、integrity 和固定版本安装；确认后发布 GitHub Release。
5. 提交发布状态记录，再更新课程仓库的 submodule 引用。任一平台失败时保留已完成的记录，从失败步骤重试，避免覆盖版本或移动已发布标签。
