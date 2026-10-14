# my-ai-infra 界面设计约束

适用范围：独立的个人 AI Coding 本地工作台，使用 `bxy-core-design-system@0.2.4`。不属于百小医正式产品迭代，不覆盖设计师交付。

## 页面与任务

- 工作台采用 `adaptive` profile；首页在同一套 foundations 下使用 `landing` profile。只提供浅色主题。
- 默认打开首页：说明个人资产如何复用到项目，介绍 SDD 工作流，并通过“配置当前项目”进入实际配置。资产库、个人记忆有独立入口。
- 项目页集中展示工具与 Skill 选择，底部保留选择摘要、检查安装和预览入口。
- 文件变更在原生 `dialog` 中查看：项目路径、冲突策略、摘要、搜索/筛选、文件列表、后续提示。桌面弹窗最大宽度 1100px，移动端接近全屏，正文独立滚动，头部与底部操作始终可见。
- 文件状态、路径、原因分层展示；链接目标按需展开。无需改动的文件默认收起，可切换为全部文件。
- 策略或选择改变后预览失效；应用只能使用当前预览的配置与 revision。未解决冲突禁用应用；部分跳过会明确提示。
- 弹窗打开时焦点进入关闭按钮，Tab 保持在模态中；Esc、关闭按钮和遮罩可关闭并回收焦点至预览入口。正在应用时暂时阻止关闭。加载、错误、成功、空结果均在弹窗内反馈。

## Token 与主题入口

JSON 真源为 [bxy-design-tokens.json](bxy-design-tokens.json)，CSS 映射为 [bxy-design-tokens.css](bxy-design-tokens.css)，由 [web/index.html](../web/index.html) 加载，[web/style.css](../web/style.css) 消费。保留已有项目定制，未用安装器覆盖现有契约。

| 语义 | 实现 |
|---|---|
| 品牌色 | `--bxy-color-brand`，生产橙色 `#FF7918` |
| 正文/辅助文字 | `--bxy-color-text` / `--bxy-color-text-secondary` |
| 页面/卡片/模态 | `--bxy-color-page` / `--bxy-color-card` |
| 边界/表单 | `--bxy-color-divider` / `--bxy-color-control-border` |
| 圆角/阴影 | `--bxy-radius-*` / `--bxy-shadow-modal` |
| 首页正文与标题 | `--bxy-font-landing` / `--bxy-typography-hero` / `--bxy-typography-section` |
| 首页/弹窗布局 | `--bxy-layout-landing` / `--bxy-layout-preview-modal` |
| 首屏背景与齿轮 | `--bxy-color-hero-background` / `--bxy-color-brand` / `--bxy-color-brand-light` / `--bxy-color-gear-soft` / `--bxy-color-gear-pale` |
| 首屏高度与正文宽度 | `--bxy-layout-hero-height` / `--bxy-layout-hero-mobile-height` / `--bxy-layout-hero-copy` |
| 控件反馈 | `--bxy-motion-fast` / `--bxy-motion-slow` |
| 功能图标 | `.bxy-icon`，Material Symbols Rounded |

控件具有 default、hover/pressed、focus-visible、disabled、loading 状态；表单错误有文案和 aria-invalid。手机触控尺寸至少 44px。布局断点、列数与插图变换几何属于有注释的组件布局约束，不承担颜色和文字语义。

## 首页动效

策略为 `expressive`。按负责人提供的 Originkit Cog Train 代码参考，实现原生 Canvas 2D 齿轮背景；保留共同齿距、大小齿轮啮合、相邻反向旋转和鼠标横向移动反馈。来源登记见 [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md)。

- 首屏占视口 100% 宽度，独立于正文内容宽度；桌面高度至少 640px，手机至少 600px。浅色底 `#FFFCF8`，齿轮使用主色橙及三档浅橙。
- 标题、说明与主操作居中，正文区域用同色浅底淡化齿轮线条；动画不影响文字可读性和操作。
- 轮廓路径缓存，绘制上限 30fps；桌面像素比不超过 2，手机不超过 1.5。手机减小齿轮尺寸，使用同一视觉语言。
- “暂停动画 / 继续动画”控制持续运动；滚出首屏、切换工作台或页面不可见时暂停。鼠标横向移动改变转速与方向，触屏无需模拟悬停。
- `prefers-reduced-motion: reduce` 显示静态齿轮并隐藏动画按钮。Canvas 不可用时保留浅底、正文与操作。
- `npm run test:web` 验证多个动画帧不同、暂停画面稳定、离开首页停止、减少动态效果，以及四种宽度下首屏铺满视口。

## 资产与例外

- 保留已有 imagegen Logo：`web/assets/logo.png`，2026-10-13 生成的橙色模块门形标记。不拉伸、旋转或重绘。
- 图标继续自托管：本机 CSP 为 `default-src 'self'`，禁止第三方字体连接。17 个实际使用的 glyph 通过 Google Fonts CSS API `icon_names` 子集下载，来源 URL、大小与清单见 [manifest](bxy-design-manifest.json)，Apache 2.0 许可随包分发。网页运行时不请求 CDN。
- 没有图标路径形态切换；关闭、加载等为独立图标，不额外引入 Morphicons。
- 橙色主按钮使用深色文字以满足对比度；橙色文本为 `#9A4000`，错误文字为 `#AF241A`，成功文字为 `#176B33`，登记在 project tokens。
- 未提供合法本地 MiSans 字体，首页使用系统中文无衬线 fallback。字体与应用均不依赖远程请求。
- 仅浏览器验收使用开发依赖 Playwright；分发包保持零运行时 npm 依赖。

## 验收

执行 `npm run test:web`，检查真实预览、搜索、筛选、链接展开、冲突保护、策略失效、过期响应丢弃、应用及完成反馈。可设置 `MAI_WEB_ARTIFACT_DIR` 将报告与截图写入忽略目录。

目标视口：桌面 1440/1280，手机 390/375。覆盖自然中文标题、中英混排、带空格的路径、长文件路径、空结果、reduced motion、焦点回收与固定操作区。所有状态由图标/文本同时表达；无装饰眉题、单侧彩条、伪指标、随机橙色断句或外部字体请求。
