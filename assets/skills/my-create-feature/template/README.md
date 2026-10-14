# Feature 最小模板与路径规范

新需求目录使用 NNN-slug，编号由初始化脚本计算：999 起递减，低于 000 回到 999，并跳过已占用编号。目录与 ID 省略 Feature- 前缀；旧规范或其他冲突保留现场并让用户选择。

[feature/](feature/) 是初始化结构的可编辑真源，由 [初始化脚本](../scripts/init-feature.mjs) 替换占位符。旧 Skill 副本的模板残留 .gitkeep 会被初始化脚本跳过并原样保留。初始 Feature 只包含 [BRIEF.md](feature/BRIEF.md) 和 [context/_INDEX.md](feature/context/_INDEX.md)，不提前创建 spec、design、test、review 或图表目录，不使用目录占位文件。

[FEATURE_LAYOUT.json](FEATURE_LAYOUT.json) 集中登记初始文件和后续产物路径。初始化脚本核对模板与 initialFiles 一致；更改最小结构需同时修改此契约和模板并运行回归。项目安装器将契约首次写入 mai-specs/FEATURE_LAYOUT.json，已有副本归项目维护，后续安装保留其修改。[ROADMAP.md](ROADMAP.md) 服务项目级索引，安装器与初始化脚本使用同一真源。

后续 Skill 读取项目路径契约，在实际写入产物时创建父目录；缺少后续目录不表示错误，目录或文档存在也不代表阶段完成。辅助图表、原型和附录仅在本次确有产出时建立。项目契约与既有产物或适用规则冲突时保留现场，让用户选择。

初始化脚本在发布 ROADMAP 前自动核对生成文件内容并执行路径校验。成功返回即完成创建，无需手工补写或再运行校验。后续阶段可单独使用 [只读路径校验脚本](../scripts/validate-feature.mjs)：

```bash
node <本Skill目录>/scripts/validate-feature.mjs --feature /path/to/mai-specs/999-record-search
node <本Skill目录>/scripts/validate-feature.mjs --feature /path/to/mai-specs/999-record-search --artifact prd
```

默认使用 Feature 所在 mai-specs/FEATURE_LAYOUT.json；缺少项目契约时使用随 Skill 的默认值，也可用 --layout 指定。普通检查只要求初始文件存在，核对已出现的登记文件位置和重复情况；--artifact 要求指定的本次产物存在。退出 0 为路径通过，1 为路径问题或执行错误，stdout 给出 JSON。该检查不评价内容、阶段状态或验收结果。

context 中的原始素材可以与产物同名；未登记的辅助文件允许保留。已有空目录与 .gitkeep 仅提示，不自动删除，也不判作缺少阶段。软链不跟随并记为路径问题，项目刻意使用软链时需按实际规则确认，不能据此认定功能未完成。

占位符：FEATURE_ID、TITLE、PRIORITY、OWNER、TARGET_DATE、MODULES、SUMMARY、BACKGROUND、MATERIAL_ROWS、FINDINGS、QUESTIONS，使用 {{KEY}} 语法。未知占位符令初始化失败，用户参数中的占位符文字保留原样。目标项目已有 _templates/ 服务后续规格、设计和测试文档，旧版 BRIEF 模板保留为用户文件。

## 初始化前预检

- 完整初始化命令加 `--check`，只检查，不创建文件、锁或目录，也不预占编号。
- 检查参数、模板、素材、可写目录、路径契约、已有编号和 ROADMAP 布局；成功返回 `ready: true, created: false`。
- 业务范围与素材含义由 AI 在执行前澄清。负责人优先使用显式 `--owner`；省略时在目标项目目录读取本机 Git 配置 `user.name`（仓库配置优先，全局配置兜底），去除首尾空白后使用。未配置、名称为空或读取失败时保留“待填”；日期等非关键字段也可留待填，不凭空补齐。
- 通过后以相同参数去掉 `--check` 执行。脚本在锁内复核编号和索引，发现并发冲突停止并保留外部修改。
- 退出码 `1` 为输入或执行错误；`2` 为需要用户选择的冲突。预检成功不代表后续写入必然成功。

## 上下文清单

有素材或已整理的上下文时，将 JSON 清单通过 `--context /absolute/path/context.json` 传入预检与初始化。清单放在临时工作区，脚本只读取；无素材时省略。

```json
{
  "materials": [
    {
      "path": "/absolute/path/访谈.pdf",
      "source": "用户提供的访谈原件",
      "summary": "已核验的主要需求"
    },
    {
      "path": "/absolute/path/访谈提取.md",
      "derivedFrom": "访谈.pdf",
      "summary": "从原件提取的文本"
    }
  ],
  "findings": ["已确认的关键发现"],
  "questions": ["不影响本次创建、留待 PRD 阶段明确的问题"]
}
```

- `materials`、`findings`、`questions` 均可省略。发现与问题为字符串数组。
- 素材 `path` 为可读普通文件的绝对路径；`source`、`summary`、`derivedFrom` 可选。未提供摘要时标记为“未解析”。
- 脚本按原名、原扩展名和原始字节复制到 `context/`，统一写入素材索引及发现、问题。解析和含义判断在执行前完成。
- 重名（忽略大小写）、初始文件名冲突、软链或缺失文件会阻止执行。先解决输入冲突，脚本不自动改名或覆盖。
- 写入或校验失败时，撤回仍属于本次操作的文件，保留外部修改；ROADMAP 在校验完成后登记。
