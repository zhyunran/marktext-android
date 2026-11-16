package com.marktext.android;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.DialogInterface;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Bundle;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.util.Base64;
import android.view.KeyEvent;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.JsPromptResult;
import android.webkit.JsResult;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.Toast;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * MarkText for Android —— 单 Activity + WebView。
 * 无第三方依赖：文件读写走 Storage Access Framework，编辑/排版在前端 assets 里自写。
 */
public class MainActivity extends Activity {

    private static final int REQ_OPEN = 1001;
    private static final int REQ_SAVE = 1002;
    private static final int REQ_IMAGE = 1003;
    private static final int REQ_PDF = 1004;

    private WebView web;
    private WebView printWeb;          // 打印用的离屏 WebView，必须持有引用防 GC
    private String pendingSave = "";
    private byte[] pendingPdf;
    private String pendingPdfName = "MarkText";

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        if ((getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            WebView.setWebContentsDebuggingEnabled(true);   // 仅 debug 构建：便于 adb forward + CDP 量真机布局
        }

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setTextZoom(100);
        s.setSupportZoom(false);
        web.setBackgroundColor(0xFF1B1B1F);
        web.setWebViewClient(new WebViewClient());
        web.setWebChromeClient(new Chrome());
        web.addJavascriptInterface(new Bridge(), "Android");

        setContentView(web);
        web.loadUrl("file:///android_asset/index.html");

        handleIncoming(getIntent(), 400);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleIncoming(intent, 200);
    }

    /** JS 的 alert/confirm/prompt 必须有 WebChromeClient，否则 confirm 返回 false、prompt 返回 null */
    private class Chrome extends WebChromeClient {
        @Override
        public boolean onJsAlert(WebView v, String url, String message, final JsResult result) {
            new AlertDialog.Builder(MainActivity.this)
                .setMessage(message)
                .setPositiveButton("好", new DialogInterface.OnClickListener() {
                    public void onClick(DialogInterface d, int w) { result.confirm(); }
                })
                .setOnCancelListener(new DialogInterface.OnCancelListener() {
                    public void onCancel(DialogInterface d) { result.cancel(); }
                })
                .show();
            return true;
        }

        @Override
        public boolean onJsConfirm(WebView v, String url, String message, final JsResult result) {
            new AlertDialog.Builder(MainActivity.this)
                .setMessage(message)
                .setPositiveButton("确定", new DialogInterface.OnClickListener() {
                    public void onClick(DialogInterface d, int w) { result.confirm(); }
                })
                .setNegativeButton("取消", new DialogInterface.OnClickListener() {
                    public void onClick(DialogInterface d, int w) { result.cancel(); }
                })
                .setOnCancelListener(new DialogInterface.OnCancelListener() {
                    public void onCancel(DialogInterface d) { result.cancel(); }
                })
                .show();
            return true;
        }

        @Override
        public boolean onJsPrompt(WebView v, String url, String message, String defaultValue, final JsPromptResult result) {
            final EditText input = new EditText(MainActivity.this);
            input.setText(defaultValue == null ? "" : defaultValue);
            input.setSelection(input.getText().length());
            new AlertDialog.Builder(MainActivity.this)
                .setTitle(message)
                .setView(input)
                .setPositiveButton("确定", new DialogInterface.OnClickListener() {
                    public void onClick(DialogInterface d, int w) { result.confirm(input.getText().toString()); }
                })
                .setNegativeButton("取消", new DialogInterface.OnClickListener() {
                    public void onClick(DialogInterface d, int w) { result.cancel(); }
                })
                .setOnCancelListener(new DialogInterface.OnCancelListener() {
                    public void onCancel(DialogInterface d) { result.cancel(); }
                })
                .show();
            return true;
        }
    }

    /** 处理外部进来的内容：打开 .md 文件，或接收其他应用分享的文本 */
    private void handleIncoming(Intent intent, final long delay) {
        if (intent == null) return;
        final String action = intent.getAction();
        if (action == null) return;

        if (Intent.ACTION_SEND.equals(action) && intent.getType() != null
                && intent.getType().startsWith("text/")) {
            final String text = intent.getStringExtra(Intent.EXTRA_TEXT);
            if (text != null) {
                web.postDelayed(new Runnable() {
                    public void run() {
                        web.evaluateJavascript("window.__onFileOpened('分享内容.md'," + jsStr(text) + ")", null);
                    }
                }, delay);
            }
            return;
        }

        if (Intent.ACTION_VIEW.equals(action)) {
            final Uri uri = intent.getData();
            if (uri == null) return;
            web.postDelayed(new Runnable() {
                public void run() { deliverFile(uri); }
            }, delay);
        }
    }

    private void deliverFile(Uri uri) {
        try (InputStream in = getContentResolver().openInputStream(uri)) {
            if (in == null) throw new IllegalStateException("无法打开");
            String text = new String(readAll(in), StandardCharsets.UTF_8);
            if (text.startsWith("\uFEFF")) text = text.substring(1);   // 去掉 UTF-8 BOM，否则首个标题失效
            web.evaluateJavascript("window.__onFileOpened(" + jsStr(safeName(uri)) + "," + jsStr(text) + ")", null);
        } catch (Exception e) {
            Toast.makeText(this, "打开失败：" + e.getMessage(), Toast.LENGTH_LONG).show();
        }
    }

    private static byte[] readAll(InputStream in) throws Exception {
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        byte[] buf = new byte[16 * 1024];
        int n;
        while ((n = in.read(buf)) > 0) bos.write(buf, 0, n);
        return bos.toByteArray();
    }

    /** SAF 的 lastPathSegment 是 document:123456，必须查 DISPLAY_NAME 才是文件名 */
    private String safeName(Uri uri) {
        try (android.database.Cursor c = getContentResolver().query(uri,
                new String[]{android.provider.OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                String dn = c.getString(0);
                if (dn != null && !dn.trim().isEmpty()) return dn.trim();
            }
        } catch (Exception ignored) {}
        return legacyName(uri);
    }

    private static String legacyName(Uri uri) {
        String p = uri.getLastPathSegment();
        if (p == null || p.trim().isEmpty()) return "untitled.md";
        int slash = p.lastIndexOf('/');
        return slash >= 0 ? p.substring(slash + 1) : p;
    }

    /** JSON 字符串转义（不引第三方 JSON 库） */
    private static String jsStr(String s) {
        if (s == null) s = "";
        StringBuilder sb = new StringBuilder(s.length() + 16);
        sb.append('"');
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"':  sb.append("\\\""); break;
                case '\\': sb.append("\\\\"); break;
                case '\n': sb.append("\\n");  break;
                case '\r': sb.append("\\r");  break;
                case '\t': sb.append("\\t");  break;
                case '\u2028': sb.append("\\u2028"); break;
                case '\u2029': sb.append("\\u2029"); break;
                default:
                    if (c < 0x20) sb.append(String.format("\\u%04x", (int) c));
                    else sb.append(c);
            }
        }
        return sb.append('"').toString();
    }

    /** 把图片压到最长边 1600px 的 JPEG，再 base64 内联进 Markdown */
    private String encodeImage(Uri uri) throws Exception {
        byte[] raw = readAll(getContentResolver().openInputStream(uri));

        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        BitmapFactory.decodeByteArray(raw, 0, raw.length, bounds);
        int w = bounds.outWidth, h = bounds.outHeight;
        if (w <= 0 || h <= 0) throw new IllegalStateException("不是有效图片");

        int sample = 1;
        int longest = Math.max(w, h);
        while (longest / sample > 1600) sample *= 2;

        BitmapFactory.Options opt = new BitmapFactory.Options();
        opt.inSampleSize = sample;
        Bitmap bmp = BitmapFactory.decodeByteArray(raw, 0, raw.length, opt);
        if (bmp == null) throw new IllegalStateException("解码失败");

        int outW = bmp.getWidth(), outH = bmp.getHeight();
        if (Math.max(outW, outH) > 1600) {
            float scale = 1600f / Math.max(outW, outH);
            Bitmap scaled = Bitmap.createScaledBitmap(bmp, Math.round(outW * scale), Math.round(outH * scale), true);
            if (scaled != bmp) bmp.recycle();
            bmp = scaled;
            outW = bmp.getWidth(); outH = bmp.getHeight();
        }

        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        bmp.compress(Bitmap.CompressFormat.JPEG, 82, bos);
        byte[] jpg = bos.toByteArray();
        int quality = 82;
        while (jpg.length > 700 * 1024 && quality > 40) {
            quality -= 12;
            bos.reset();
            bmp.compress(Bitmap.CompressFormat.JPEG, quality, bos);
            jpg = bos.toByteArray();
        }
        bmp.recycle();

        String b64 = Base64.encodeToString(jpg, Base64.NO_WRAP);
        return "data:image/jpeg;base64," + b64 + "|" + outW + "×" + outH + " · " + Math.round(jpg.length / 1024.0) + " KB";
    }

    /** A4 @96dpi */
    private static final int PDF_W = 794;
    private static final int PDF_H = 1123;

    private void buildPdf(final String html0) {
        String html = html0;
        if (html.length() > 300 * 1024) {
            html = html.replaceAll("src=\"data:image/[^\"]+\"", "src=\"\" alt=\"[图片已省略]\"");
        }
        final String finalHtml = html;
        Toast.makeText(MainActivity.this, "正在生成 PDF…", Toast.LENGTH_SHORT).show();
        new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(new Runnable() {
            public void run() { doBuildPdf(finalHtml); }
        }, 350);
    }

    private void doBuildPdf(String html) {
        final WebView pv = new WebView(this);
        printWeb = pv;
        pv.getSettings().setJavaScriptEnabled(false);
        pv.getSettings().setLoadWithOverviewMode(true);
        pv.getSettings().setUseWideViewPort(true);
        pv.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView v, String url) {
                try {
                    int widthSpec = View.MeasureSpec.makeMeasureSpec(PDF_W, View.MeasureSpec.EXACTLY);
                    int heightSpec = View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED);
                    v.measure(widthSpec, heightSpec);
                    int contentH = Math.max(v.getMeasuredHeight(), PDF_H);
                    v.layout(0, 0, PDF_W, contentH);

                    int pages = (int) Math.ceil(contentH / (double) PDF_H);
                    if (pages > 20) pages = 20;   // 上限，避免大文档把主线程拖死
                    android.graphics.pdf.PdfDocument doc = new android.graphics.pdf.PdfDocument();
                    for (int i = 0; i < pages; i++) {
                        android.graphics.pdf.PdfDocument.PageInfo info =
                                new android.graphics.pdf.PdfDocument.PageInfo.Builder(PDF_W, PDF_H, i + 1).create();
                        android.graphics.pdf.PdfDocument.Page page = doc.startPage(info);
                        android.graphics.Canvas canvas = page.getCanvas();
                        canvas.drawColor(android.graphics.Color.WHITE);
                        canvas.translate(0, -i * PDF_H);
                        v.draw(canvas);
                        doc.finishPage(page);
                    }
                    java.io.ByteArrayOutputStream bos = new java.io.ByteArrayOutputStream();
                    doc.writeTo(bos);
                    doc.close();
                    pendingPdf = bos.toByteArray();

                    java.io.File dir = new java.io.File(getExternalFilesDir(null), "导出");
                    if (!dir.exists()) dir.mkdirs();
                    java.io.File outFile = new java.io.File(dir, pendingPdfName + ".pdf");
                    try (java.io.FileOutputStream fos = new java.io.FileOutputStream(outFile)) {
                        fos.write(pendingPdf);
                    }
                    Toast.makeText(MainActivity.this, "已保存 PDF：" + outFile.getName() + "（" + pages + " 页）", Toast.LENGTH_LONG).show();
                    web.evaluateJavascript("window.__onPdfSaved(" + jsStr(outFile.getName()) + ")", null);
                } catch (Exception e) {
                    Toast.makeText(MainActivity.this, "生成 PDF 失败：" + e.getMessage(), Toast.LENGTH_LONG).show();
                }
            }
        });
        pv.loadDataWithBaseURL(null, html, "text/html", "utf-8", null);
    }
    /** 暴露给 JS 的原生能力 */
    public class Bridge {

        @JavascriptInterface
        public void toast(final String msg) {
            runOnUiThread(new Runnable() {
                public void run() { Toast.makeText(MainActivity.this, msg, Toast.LENGTH_SHORT).show(); }
            });
        }

        @JavascriptInterface
        public void openFile() {
            Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            i.addCategory(Intent.CATEGORY_OPENABLE);
            i.setType("*/*");
            i.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"text/markdown", "text/plain", "text/x-markdown"});
            startActivityForResult(i, REQ_OPEN);
        }

        @JavascriptInterface
        public void saveFile(String name, String content) {
            pendingSave = content == null ? "" : content;
            String title = (name == null || name.trim().isEmpty()) ? "untitled.md" : name.trim();
            Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            i.addCategory(Intent.CATEGORY_OPENABLE);
            i.setType("text/markdown");
            i.putExtra(Intent.EXTRA_TITLE, title);
            startActivityForResult(i, REQ_SAVE);
        }

        @JavascriptInterface
        public void share(String text) {
            Intent i = new Intent(Intent.ACTION_SEND);
            i.setType("text/plain");
            i.putExtra(Intent.EXTRA_TEXT, text == null ? "" : text);
            startActivity(Intent.createChooser(i, "分享 Markdown"));
        }

        @JavascriptInterface
        public void pickImage() {
            Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            i.addCategory(Intent.CATEGORY_OPENABLE);
            i.setType("image/*");
            startActivityForResult(i, REQ_IMAGE);
        }

        /** 用系统打印框架把文档变成 PDF / 直接打印 */
        @JavascriptInterface
        public void print(final String html, final String jobName) {
            runOnUiThread(new Runnable() {
                public void run() {
                    if (printWeb != null) { printWeb.destroy(); printWeb = null; }
                    printWeb = new WebView(MainActivity.this);
                    printWeb.getSettings().setJavaScriptEnabled(false);
                    printWeb.setWebViewClient(new WebViewClient() {
                        @Override
                        public void onPageFinished(WebView view, String url) {
                            try {
                                PrintManager pm = (PrintManager) getSystemService(Context.PRINT_SERVICE);
                                String name = (jobName == null || jobName.isEmpty()) ? "MarkText" : jobName;
                                PrintDocumentAdapter adapter = view.createPrintDocumentAdapter(name);
                                pm.print(name, adapter, new PrintAttributes.Builder().build());
                            } catch (Exception e) {
                                Toast.makeText(MainActivity.this, "打印失败：" + e.getMessage(), Toast.LENGTH_LONG).show();
                            }
                        }
                    });
                    printWeb.loadDataWithBaseURL(null, html, "text/html", "utf-8", null);
                }
            });
        }

        /** 自绘 PDF：离屏 WebView 按 A4 分页 draw 到 PdfDocument，再由用户选保存位置 */
        @JavascriptInterface
        public void exportPdf(final String html, final String fileName) {
            runOnUiThread(new Runnable() {
                public void run() {
                    pendingPdfName = (fileName == null || fileName.isEmpty()) ? "MarkText" : fileName;
                    try {
                        buildPdf(html);
                    } catch (Exception e) {
                        Toast.makeText(MainActivity.this, "生成 PDF 失败：" + e.getMessage(), Toast.LENGTH_LONG).show();
                    }
                }
            });
        }
        @JavascriptInterface
        public String loadDraft() {
            return getSharedPreferences("draft", MODE_PRIVATE).getString("text", "");
        }

        @JavascriptInterface
        public String loadDraftName() {
            return getSharedPreferences("draft", MODE_PRIVATE).getString("name", "untitled.md");
        }

        @JavascriptInterface
        public void clearDraft() {
            getSharedPreferences("draft", MODE_PRIVATE).edit().clear().apply();
        }
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (res != RESULT_OK || data == null) return;
        Uri uri = data.getData();
        if (uri == null) return;

        if (req == REQ_OPEN) {
            deliverFile(uri);
        } else if (req == REQ_SAVE) {
            try (OutputStream out = getContentResolver().openOutputStream(uri)) {
                if (out == null) throw new IllegalStateException("无法写入");
                out.write(pendingSave.getBytes(StandardCharsets.UTF_8));
                out.flush();
                web.evaluateJavascript("window.__onFileSaved(" + jsStr(safeName(uri)) + ")", null);
            } catch (Exception e) {
                Toast.makeText(this, "保存失败：" + e.getMessage(), Toast.LENGTH_LONG).show();
            }
        } else if (req == REQ_PDF) {
            try (OutputStream out = getContentResolver().openOutputStream(uri)) {
                if (out == null || pendingPdf == null) throw new IllegalStateException("无内容");
                out.write(pendingPdf);
                out.flush();
                web.evaluateJavascript("window.__onPdfSaved(" + jsStr(safeName(uri)) + ")", null);
            } catch (Exception e) {
                Toast.makeText(this, "保存 PDF 失败：" + e.getMessage(), Toast.LENGTH_LONG).show();
            }
        } else if (req == REQ_IMAGE) {
            try {
                final String[] parts = encodeImage(uri).split("\\|", 2);
                web.evaluateJavascript("window.__onImage(" + jsStr(parts[0]) + "," + jsStr(parts.length > 1 ? parts[1] : "") + ")", null);
            } catch (Exception e) {
                Toast.makeText(this, "插入图片失败：" + e.getMessage(), Toast.LENGTH_LONG).show();
            }
        }
    }

    @Override
    public boolean onKeyDown(int code, KeyEvent e) {
        if (code == KeyEvent.KEYCODE_BACK) {
            web.evaluateJavascript("(window.__handleBack && window.__handleBack()) ? 'true' : 'false'",
                new android.webkit.ValueCallback<String>() {
                    public void onReceiveValue(String v) { if (!"true".equals(v)) finish(); }
                });
            return true;
        }
        return super.onKeyDown(code, e);
    }

    @Override
    protected void onDestroy() {
        if (printWeb != null) { printWeb.destroy(); printWeb = null; }
        super.onDestroy();
    }
}
