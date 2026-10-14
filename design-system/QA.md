# UI 验证记录

## 2026-10-14：首页与模态预览

- Profile：adaptive 工作台 + landing 首页，共用原有橙白语义 tokens。主题入口为 web/style.css；图标采用 17 个自托管 Material Symbols Rounded glyph，3,516 bytes，CSP 保持 self。
- 默认首页、主按钮进入项目配置、首页返回入口通过；首屏分层卡片动画在 0/500/1500ms 有不同 transform，首帧/中间态/最终态截图可区分；reduced motion 下无卡片动画。
- 1440/1280/390/375：首页、项目页和预览窗口无页面水平溢出。移动弹窗标题、带空格与中文的项目路径自然换行，底部操作在视口内，正文独立滚动。
- 真实隔离项目验证：文件搜索与搜索空态、状态筛选、链接展开、Esc 与焦点回收、正反向 Tab 焦点循环、策略改变使应用失效、过期请求返回不会重新打开弹窗。
- 模拟项目过期错误在弹窗内显示并禁用应用；重新预览后真实应用成功，配置包含所选工具，完成结果和初始化提示保留在弹窗。
- 手动修改项目 Skill 后使用 abort 策略，冲突阻止应用，项目定制保持原样。
- 浏览器全程无 pageerror、无外部资源请求。截图与报告保存在忽略目录 work/mai-web-qa/results；可由 scripts/check-web.mjs 重建。
- npm test：189 项通过。根级 npm test、源码 lint、资源与链接 validate、git diff --check 通过。
- 补齐 design-system/bxy-design-tokens.json 的精确 Git 忽略例外，确保语义真源随源码维护。

以下保留前次界面验收记录。

2026-10-13，adaptive profile。主题入口 web/style.css 消费 JSON/CSS tokens；现有本机 self CSP 保留。

## 已执行

- 桌面 1440、1280，手机 390、375：配置、资产与偏好视图无页面横向溢出。375 下长文本与中英混排在编辑器内换行。
- 手机可见按钮和非复选框输入高度至少 44px；复选框使用整行 label。键盘焦点 2px 深橙 outline。
- 隔离项目完成预览、应用、doctor；配置变动后旧预览失效。
- 搜索空态、编辑离开时的取消/放弃、新建名称同步头部、名称不一致错误、Ctrl/Meta+S 保存通过。保存默认偏好保留项目未应用选择。
- 测试资产位于 work/my-ai-infra-ui-qa；未添加到用户预览库。
- Logo 透明 RGBA，24/48/256px、浅深背景查看通过。来源及最终提示词见 web/assets/README.md。
- Material Symbols Rounded 字体保留 rlig 必要连字，11 个 glyph，11,732 bytes，Apache 2.0 许可随包分发。
- 46 项自动回归通过；二进制原子写入调整后补跑 runtime 与静态资产 2 项通过。根级 npm test 与 git diff --check 通过。
- npm pack 包含 Logo、字体、许可和 tokens；离线 npx 初始化和包内 Web 静态资源读取通过。

## 检查边界

产品目前只提供浅色主题。Logo 深底检查不代表提供暗色 UI。加载反馈由 aria-busy、按钮禁用和文字实现；reduced motion 由 tokens 媒体查询处理。未进行真实设备读屏、商业工具模型行为或长期用户研究验收。

## 对比度抽样

| 语义 | 对比度 | 最低要求 |
|---|---:|---:|
| 主按钮文字 | 5.77:1 | 4.5:1 |
| 正文 | 15.13:1 | 4.5:1 |
| 说明 | 5.61:1 | 4.5:1 |
| 橙色操作文字 | 6.11:1 | 4.5:1 |
| 错误文字 | 6.26:1 | 4.5:1 |
| 成功文字 | 6.24:1 | 4.5:1 |
| 输入边界 | 3.25:1 | 3:1 |
