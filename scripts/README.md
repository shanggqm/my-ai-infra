# 开发辅助

- `build-skill.mjs`：兼容已有 `npm run build:skill` 入口，只读检查 `assets/skills/` 中的唯一源及附属资源，不从父仓库复制或覆盖内容。
- `validate.mjs`：检查内置 Skill 清单、中文头部格式、作者和来源、附属脚本、manifest 交付项、本地链接与 npm 分发配置，不访问全局工具配置。
- `check-skill-resources.mjs`：核对各 Skill 的必需入口及递归 Markdown 资源链接；命令示例及目标项目产物路径不视为包内资源。
- `validate.py`：兼容入口，委托同一 Node.js 检查器。

```bash
npm run build:skill
npm run validate
python3 scripts/validate.py
```

行为与集成回归通过本项目的 `npm test` 执行，全部使用隔离临时目录。

- `lint.mjs`：零依赖语法、JSON 与源码空白检查。
- `release-check.mjs`：对实际 tarball 运行隔离安装、资源、CLI/Web 和文档检查；`npm run release:check` 先执行完整 verify。

发行与维护者流程见 [发布指南](../docs/releasing.md)。预览产物位于忽略的 dist/，开发审视报告与源码 tests/scripts 不随 npm 分发。

## 浏览器交互回归

`check-web.mjs` 使用开发依赖 Playwright，在隔离项目与个人库中验证首页、动画、预览弹窗、搜索筛选、焦点回收、冲突、过期预览、真实应用与响应式布局。无需启动用户项目。首次安装 Chromium 后运行：

```bash
npx playwright install chromium
npm run test:web
```

`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` 可指定已有 Chromium；`MAI_WEB_ARTIFACT_DIR` 可指定忽略目录保存 1440/1280/390/375 截图、动画时间点和报告。浏览器测试单独执行，不影响无浏览器环境中的 `npm test`。浏览器及测试产物不随 npm 分发。
