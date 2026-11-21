# marktext-android

[<kbd>中文</kbd>](README.md) · **English**

MarkText for Android: a WYSIWYG Markdown editor. One small APK, no third-party dependencies (no AndroidX, no Gradle, no npm).

No shared code with the desktop MarkText: the desktop app is Electron + Muya, while this is a re-implemented editor model.

## Features

- **WYSIWYG**: type directly on the rendered page (contenteditable); the document is serialized to Markdown on save
- Toolbar: H1/H2, bold, italic, strikethrough, inline code, quote, ordered/unordered lists, task list, code block, table, link, image, horizontal rule
- Open `.md` files (`file://` and `content://`), and set the app as the system default handler
- Save / Save as (SAF), share the body text, receive text shared from other apps
- Insert images from the gallery: longest edge 1600, JPEG 82, inlined as base64
- Export PDF: off-screen WebView paginated to A4 → `PdfDocument`, written to the app directory
- Dark / light / follow-system theme, font size A±, undo/redo, source view, auto-saved drafts

## Build

Requires JDK 17, Android SDK `platforms/android-34` and `build-tools/34.0.0` (aapt2 / d8 / zipalign / apksigner).

```powershell
$env:ANDROID_TOOLCHAIN = "D:\android-toolchain"   # must contain jdk\ and sdk\
powershell -ExecutionPolicy Bypass -File build.ps1
```

Pipeline: `aapt2 compile` → `aapt2 link` (with assets) → `javac` → `d8` → inject `classes.dex` → `zipalign` → `apksigner`. Output goes to `dist\`; the first build creates `debug.keystore`.

## Layout

```
AndroidManifest.xml           single Activity; .md handler; share receiver
src/com/marktext/android/
  MainActivity.java           WebView shell + JS bridge (open/save/image/PDF/draft)
assets/
  index.html                  top bar + toolbar + editor + bottom sheet
  style.css                   two themes, typography, editor area
  app.js                      Markdown ⇄ HTML, edit commands, file actions
res/                          adaptive icon and colors
tools/                        CDP screenshot and layout checks (dev only)
build.ps1                     manual APK build
```

## Known limitations

- No recent-files list, no tabs, no image paste
- Debug signing only; not published on any app store

## License

Project code is MIT. Android platform components follow their own licenses.

---

[<kbd>中文版</kbd>](README.md)
