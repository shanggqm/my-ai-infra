# 发布指南

当前公开版本：`@easyuseai/my-ai-infra@0.0.6`，dist-tag 为 `latest`（2026-10-15 发布）；[GitHub Release v0.0.6](https://github.com/shanggqm/my-ai-infra/releases/tag/v0.0.6) 附带同一安装包和 SHA-256 校验文件。本指南的检查不会自动发布、登录、提交 Git 或创建标签。

## 发布前的负责人事项

- 决定发行版本和 dist-tag，确认该 npm 名称/版本可由当前账号发布。
- 确认[复制资产的分发授权与许可证](../THIRD_PARTY_NOTICES.md)。项目采用 MIT 许可证；复制资产的上游分发授权仍需核实。
- 源码仓库为 [shanggqm/my-ai-infra](https://github.com/shanggqm/my-ai-infra)，可见性为 private；公开 npm 使用者无源码仓库访问权限时，反馈渠道由维护者另行提供。
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

产物位于 `dist/`：

- `easyuseai-my-ai-infra-0.0.6.tgz`：通过验收的实际安装包。
- `release-report.json`：文件清单、大小、SHA-256、npm integrity 与实际装配检查结果。

检查使用独立临时目录与 npm cache，不触碰真实个人库或全局工具目录。它验证 npx 入口、四种工具安装、重复同步、冲突保护、Feature 脚本/模板及包内 Web 的 Logo、字体、tokens 与认证。结束后清理临时安装环境，保留发行包和报告。

源码开发使用 Node.js 22+、npm 与 Git/Bash；没有运行时 npm 依赖。代码检查覆盖 JavaScript 语法、JSON 解析和源码空白，自动测试覆盖脚本行为与文件装配。所有 Skill 的唯一源均位于本仓库 `assets/skills/`；独立克隆与课程 submodule 使用相同源码和检查流程，课程侧仅通过软链引用。

## 本地预演与正式发布

先安装已检查的本地包试用：

```bash
npx --yes --package=/absolute/path/to/dist/easyuseai-my-ai-infra-0.0.6.tgz my-ai-infra --version
npx --yes --package=/absolute/path/to/dist/easyuseai-my-ai-infra-0.0.6.tgz my-ai-infra web --port 0
```

需要时预演发布，再由维护者显式执行正式发布：

```bash
npm publish ./dist/easyuseai-my-ai-infra-0.0.6.tgz --dry-run --access public --registry=https://registry.npmjs.org/
# 确认授权、身份、版本及检查报告后，再执行：
npm publish ./dist/easyuseai-my-ai-infra-0.0.6.tgz --access public --registry=https://registry.npmjs.org/
```

发布已检查的 tarball 可以避免重新从变化后的源码打包。npm 对 tarball 发布不会替你运行源码的 `prepublishOnly`，因此必须先完成 `release:check` 并确认 SHA-256 未变。dry-run 不替代真实账号权限和服务端规则检查。参见 [npm lifecycle](https://docs.npmjs.com/cli/v11/using-npm/scripts/) 与 [npm publish](https://docs.npmjs.com/cli/v11/commands/npm-publish/)。

预发布版本使用语义版本号（例如 `0.0.6-beta.1`）和明确的 `--tag beta`；稳定版本通常使用 latest。npm 不能用同一个名称/版本覆盖已发布内容；发现问题时修复后发布新的补丁版本。

发布后核对 registry 版本、integrity，并在空目录中运行固定版本 npx 的版本查询、init、doctor 和 web。更新本节的发布状态与 CHANGELOG 日期，再按独立仓库约定创建对应 Git 标签；不要把生成的 cache、个人库、测试项目或凭证提交到源码。

## GitHub 与 npm 同步发行

1. 在发布分支整理变更记录与版本号，完成源码、浏览器和实际安装包检查，通过 PR 合入默认分支。
2. 确认最终安装包内容与合入提交一致，创建并推送带注释的 `v<版本>` 标签；标签创建后保持不变。
3. 创建同名 GitHub Release 草稿，写明变更、升级方式和验证结果，附上已验证的 npm `.tgz` 与 `SHA256SUMS`。
4. 将同一 `.tgz` 发布到 npm，核对版本、latest、integrity 和固定版本安装；确认后发布 GitHub Release。
5. 提交发布状态记录，再更新课程仓库的 submodule 引用。任一平台失败时保留已完成的记录，从失败步骤重试，避免覆盖版本或移动已发布标签。
