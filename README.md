# marktext-android

MarkText 的 Android 版：所见即所得 Markdown 编辑器。单 APK，零第三方依赖（无 AndroidX / Gradle / npm）。

与桌面版 MarkText 无代码关系：桌面版是 Electron + Muya，这里是重新实现的编辑器语义。

## 功能

- **所见即所得**：直接编辑排版后的页面（contenteditable），保存时序列化为 Markdown
- 工具栏：H1/H2、粗体、斜体、删除线、行内代码、引用、有序/无序列表、任务、代码块、表格、链接、图片、分隔线
- 打开 `.md`（`file://` 与 `content://`），可在系统里设为默认打开方式
- 保存 / 另存为（SAF）、分享正文、接收其他应用分享的文本
- 相册选图：压到最长边 1600、JPEG 82，base64 内联进文档
- 存 PDF：离屏 WebView 按 A4 分页 → `PdfDocument`，输出到应用目录
- 深色 / 浅色 / 跟随系统、字号 A±、撤销重做、源码视图、草稿自动保存

## 构建

依赖：JDK 17、Android SDK `platforms/android-34` 与 `build-tools/34.0.0`（aapt2 / d8 / zipalign / apksigner）。

```powershell
$env:ANDROID_TOOLCHAIN = "D:\android-toolchain"   # 内含 jdk\ 与 sdk\
powershell -ExecutionPolicy Bypass -File build.ps1
```

流程：`aapt2 compile` → `aapt2 link`（含 assets）→ `javac` → `d8` → 塞入 `classes.dex` → `zipalign` → `apksigner`。产物在 `dist\`，首次构建会生成 `debug.keystore`。

## 目录

```
AndroidManifest.xml           单 Activity；.md 打开方式；接收分享
src/com/marktext/android/
  MainActivity.java           WebView 壳 + JS Bridge（打开/保存/选图/PDF/草稿）
assets/
  index.html                  顶栏 + 工具栏 + 编辑区 + 底部菜单
  style.css                   双主题、排版、编辑区
  app.js                      Markdown ⇄ HTML、编辑命令、文件动作
res/                          自适应图标与颜色
tools/                        CDP 截图与布局校验脚本（开发辅助）
build.ps1                     手工构建 APK
```

## 已知限制

- 无最近文件列表、无多标签、无图片粘贴
- debug 签名，未上架应用商店

## 许可

本项目代码 MIT。编辑器依赖的 Android 平台组件遵循各自许可。
