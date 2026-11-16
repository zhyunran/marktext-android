# Changelog

### 图片插入：只保留相册选图

- 一度尝试支持剪贴板粘贴图片（paste 事件 + 原生剪贴板桥），**已按要求整体移除**，代码里不再有 paste 监听与 eadClipboardImage 桥
- 保留相册选图：工具栏「图片」→ 系统图片选择器 → 压缩到最长边 1600、JPEG 82 → base64 内联
- 实机验证（移除后复测）：点「图片」能正常拉起系统图片选择器（出现「最近 / 取消」），Java 侧 eadClipboardImage 已不存在
### v0.3.0 收尾（全项真机验证）

- 修：SAF 的 getLastPathSegment() 返回 document:123456，保存后标题会变成这串数字 → 改用 OpenableColumns.DISPLAY_NAME 取真实文件名
- 修：读文件未去 UTF-8 BOM，导致首行标题渲染成普通段落 → 读入后 strip \uFEFF
- 实机验证通过：主题切换、字号 A±、撤销/重做、源码视图往返、分享接收、打开 .md、保存（写出 	est-open_1.md 109 B，文件名正确）、相册插图、存 PDF


## v0.3.0 — 2026-11-16

### v0.3.0 补丁（实机验证后）

- **存 PDF 改自绘**：ColorOS/Android 16 的系统打印服务没有「另存为 PDF」打印机，PrintManager 路线不可用 →
  改为离屏 WebView 按 A4 分页 draw() 到 PdfDocument，直接写到 Android/data/com.marktext.android/files/导出/<文件名>.pdf
- **修卡死**：原实现把分页绘制全放在 UI 线程且不设上限，文档含大图时会长时间无响应 →
  生成前提示「正在生成 PDF…」并延后 350ms、页数上限 20、HTML 超 300 KB 时剔除 base64 大图占位
- 实机验证：导出 5,089 B 的 未打开文档.pdf，%PDF-1.4 合法文件（示例见 截图\导出示例.pdf）

### Changed（方向修正）

- **改成所见即所得**：去掉半屏分屏预览，编辑器就是排版后的页面本身（contenteditable），
  输入即渲染，Markdown 只在保存/分享/导出时由 DOM 序列化生成 —— 与桌面版的核心体验对齐
- 顶部只剩「保存 / ⋯」；格式按钮变成对选区的真实排版命令（粗体、H1/H2、列表、引用、表格、代码块）
- 阅读与编辑不再分家：打开 .md 直接进排版视图
- 新增「看源码」开关（⋯ → 工具 → 看源码），随时看/改 Markdown 原文
- 注册为 .md 默认打开程序：content:// text/markdown、text/x-markdown、text/plain 与 file:// *.md

### Fixed

- 事件绑定早于 DOM 初始化导致首帧白屏（doc undefined 抛 TypeError）
- 存档：图片、任务清单、表格的 Markdown 往返序列化

### Verified（真机）

- 实机渲染与编辑正常；把排版内容序列化回 Markdown 的结果：
  # 测试标题 / - [x] 已完成任务 / 表格管道格式 / 引用块，全部正确
- 截图：截图\实机-编辑.png、截图\实机-源码视图.png
## v0.2.1 — 2026-11-16

### Fixed

- **WebView 里 `confirm()` 恒返回 false、`prompt()` 恒返回 null** —— 没有设置 `WebChromeClient`，JS 对话框直接失败：
  导致「新建」被静默取消、重命名/图片说明弹不出输入框 → 新增 `Chrome` 扩展 `WebChromeClient`，
  用 `AlertDialog` 实现 alert/confirm/prompt 三件套
- 工具栏插入后撤销栈基线未更新，会产生一步重复的撤销记录 → `afterEdit()` 里同步 `lastSnapshot`

## v0.2.0 — 2026-11-16

### Added

- **主题**：深色 / 浅色 / 跟随系统 三态循环，设置持久化（localStorage）
- **字号**：A− / A+ / 默认，编辑区与预览区各自缩放（11–24px），持久化
- **撤销 / 重做**：自实现快照栈（200 步上限），不依赖输入法的 undo
- **查找**：预览内高亮全部命中、显示 `n/m` 计数、↑↓ 循环跳转并滚动定位
- **打印 / 导出 PDF**：生成独立 HTML → 系统打印框架（`PrintManager` + 离屏 WebView），可「另存为 PDF」
- **插入图片**：从相册选择 → 自动压到最长边 1600px、JPEG 82（>700 KB 继续降质）→ base64 内联进 Markdown
- **分享接收**：其他应用「分享文本」到 MarkText 即可开新文档（`ACTION_SEND` text/plain）
- **自适应图标**（Android 8+）：`mipmap-anydpi-v26` + 前景层
- 顶栏菜单化：顶栏只留「分屏」「⋯」，其余操作收进底部抽屉，避免窄屏挤压

### Changed

- 顶栏在 390px 宽下 5 个按钮已放不下 → 改为菜单，实测 `actionsRight=382 < 390`
- 菜单网格 390px 宽下 4 列（断点 356px）
- 欢迎文档改为介绍菜单与常用写法

### Verified

- Markdown 渲染单测 **13/13 通过**（Node 直接跑 `app.js` 内的解析器）
- CDP 移动端（390×844）实测：`scrollWidth=390` 无横向溢出；主题切换生效（`data-theme=light`）；
  查找命中 1/1；撤销/重做三态全部正确；字号 14→16→14；打印 HTML 1319 字符且以 `<!DOCTYPE` 开头
- APK：`apksigner verify` 通过、`aapt2 dump badging` 显示 `versionCode=2 versionName=0.2.0`、
  自适应图标被识别（`application-icon-*` 指向 `mipmap-anydpi-v26/ic_launcher.xml`）

## v0.1.0 — 2026-11-16

### Added

- 首版：单 Activity + WebView 壳，自写 Markdown 解析器（标题/列表/任务/表格/引用/代码块/链接/图片/转义）
- 编辑 / 分屏 / 预览 三态；14 个格式按钮
- 打开、另存（SAF）、分享正文、草稿自动保存与恢复
- 从文件管理器打开 `.md`（Manifest `VIEW` + `text/markdown`）
