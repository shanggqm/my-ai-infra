# 993 技术方案

## 结构与边界

`assets/hooks/my-format/` 是唯一分发源，独立 Node ESM 脚本导出 detectFormatting / runFormatting。project plan 复用只读检测；安装副本自定位项目根目录，不使用事件输入指定执行目录。

`src/format-hook.mjs` 为此内置资产提供四工具的结构化注册适配。只识别自身带固定标记的命令；state 保存上次受管 handler，定制或未知结构保持现场。通用扩展清单仍不能替换宿主共享配置。

检测快照进入 plan revision；注册 action 依赖资产源，复用现有锁、备份、写前复查、回滚和冲突报告。格式化运行另用项目 format.lock，20 秒超时并清理子进程组；标准输出仅返回空 Hook JSON，脚本诊断走 stderr。

## 任务与验证映射

| 任务 | 文件 | 验收 |
|---|---|---|
| 根目录配置与既有脚本检测 | assets/hooks/my-format/run.mjs | AC-01、03、04 |
| 条件安装与宿主注册 | src/format-hook.mjs、src/project.mjs | AC-02、05、06 |
| 诊断与 CLI 展示 | src/discovery.mjs、src/terminal.mjs | AC-06、07 |
| 执行、跳过、并发与超时 | assets/hooks/my-format/run.mjs | AC-03、04、07 |
| 自动回归与分发 | test/format-hook.test.mjs、scripts/release-check.mjs | AC-01～07 |

基础验证：npm run verify；分发验证：npm run release:check。Web 复用 plan/apply，需要浏览器回归确认资产列表与安装预览兼容。宿主实际调度单独报告，不从模拟输入与装配成功推断。

## 取舍

- 检测使用固定文件名和明确配置节，保持零运行时 npm 依赖，不运行配置代码或构建工具。
- 只合并标准 JSON，JSONC 共享配置保持现场并返回未完成。
- 采用每轮结束事件，脚本保留原有全项目范围；不引入修改文件追踪与文件参数推断。
- 注册引用项目绝对路径，移动后 sync 更新；脚本运行再次检测，配置已移除时立即跳过。
- 由宿主处理信任和权限；不改变开关、不预批准、不创建后台任务。
