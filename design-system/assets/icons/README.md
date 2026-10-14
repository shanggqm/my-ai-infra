# Icon 自托管兜底

- 默认从 [Google Fonts Icons](https://fonts.google.com/icons) 选择 Material Symbols Rounded，并通过 Google Fonts CSS API CDN 接入；这些文件不会被默认安装。
- `material-symbols-rounded.woff2`：仅用于离线、内网或 CSP/隐私策略禁止远程字体时的自托管兜底。
- `material-symbols-rounded.css`：自托管 `@font-face` 与 `.bxy-icon` 适配器。运行安装器时显式追加 `--self-host-icons`，并保持字体相对路径不变。
- `APACHE-2.0.txt`：上游许可证。

示例：

```html
<span class="bxy-icon" aria-hidden="true">search</span>
```

Icon-only 按钮需要在按钮上提供 `aria-label`。不要把字体 glyph 当作 Morphicons 的路径输入。

本项目保留本机 CSP，使用自托管字体。分发文件由 Google Fonts CSS API 的 icon_names 参数获取实际使用的 17 个 glyph 子集，保留连字映射及原 Apache 2.0 许可；glyph 名单见 bxy-design-manifest.json。
