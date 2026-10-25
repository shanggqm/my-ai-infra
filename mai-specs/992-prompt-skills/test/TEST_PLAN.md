# 992：验证记录

## 验收覆盖

| 验收 | 验证方式 |
|---|---|
| AC-01 | 四工具普通文件/相对链接与显式调用配置、移动与幂等回归；实际安装包文件检查 |
| AC-02 | 目录与清单检查、旧类型导入拒绝、CLI / Web 展示与只读测试 |
| AC-03 | 已修改/未登记旧 Prompt 清理，三种冲突策略，同名正文刷新，个人库与全局 setup 回归 |
| AC-04 | 只读预览、目录变化导致 revision 失效、写入失败回滚、外部链接和无关文件保留 |
| AC-05 | npm run verify、npm run test:web、npm run release:check；宿主行为按 test/workflow-evals.md 分别记录 |

## 执行结果

2026-10-25，于仓库根目录完成以下检查，均使用隔离项目及个人库：

| 检查 | 当前结果 | 证据 |
|---|---|---|
| `npm run verify` | 15 个 Skill 资源、源码/元信息/链接检查及 276 项自动化测试通过，0 失败、0 跳过 | `dist/feature-992/verify.log` |
| `npm run test:web` | 8 组通过；使用本机 Chrome，覆盖工作流分组、只读资产、真实预览/应用、工具清理、冲突和四个视口 | `dist/feature-992/web-check.log`、`dist/workflow-web/report.json` |
| `npm run release:check` | 通过；实际 tarball 安装的 init 丢弃旧库/项目 Prompt 并安装当前 Skill，重复 sync / doctor、卸载重装和其他已有检查通过 | `dist/feature-992/release-check.log`、`dist/feature-992/release-report.json` |
| 实际宿主发现 | Codex app-server 与 Claude SDK 均识别 15 个项目 Skill；Codex 重复 sync 后仍完整 | 随上述 release:check 执行，未发送模型任务 |
| 增补专项 | 14 项通过，包含只有个人库残留时补入旧固定选择、嵌套旧包装丢弃、项目/全局失败回滚 | `dist/feature-992/targeted.log` |
| 正文比对 | 四份旧正文与新 SKILL.md 正文逐一比对，除“当前 Prompt”改为“当前 Skill”外一致 | 对照变更前 Git HEAD 与当前文件 |
| 其他检查 | Feature 布局校验、变更 Markdown 本地链接、git diff --check 通过；安装包中 97 个相关文件与最终源码逐字节一致 | 本次执行记录 |

浏览器首次运行缺少 Playwright 自带 Chromium，设置 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` 后通过。前轮回归发现的旧测试选择预期和未选工具链接探测问题已修复，上表记录最终复验结果。

`release:check` 自带完整回归为 275 项；随后增补个人库固定选择用例，最终 `verify` 为 276 项。已核对 tarball 包含最终源码。tarball SHA-256：`cb428276eb24eadad0360cc7fb2d718eb2deb35c123264c7fad92784491b7575`。该产物只用于本地验收，未发布 npm。

## 验证边界

AC-01 至 AC-04 的装配、存储和事务行为已验证；AC-05 的工程、浏览器、安装包检查已通过。对 test/workflow-evals.md 完成了资产路径及原正文一致性核对，本次未重新执行四个工作流的模型行为评测，也未验证 Cursor / Copilot 的真实菜单与执行行为。宿主发现成功不代表模型端到端行为通过。

已有格式化 Hook 改动保留并通过本次回归。未修改真实个人库、其他项目或父仓库指针；未提交、推送或发布。独立代码评审尚未执行，Feature 保持 review。
