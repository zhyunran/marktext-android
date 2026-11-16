<#
  MarkText Android · 手工构建 APK（不用 Gradle/AGP）
  依赖：JDK 17 + Android SDK build-tools(aapt2/d8/apksigner/zipalign) + platforms/android-34
#>
$ErrorActionPreference = 'Stop'

$proj = $PSScriptRoot
$tc   = if ($env:ANDROID_TOOLCHAIN) { $env:ANDROID_TOOLCHAIN } else { Join-Path $env:USERPROFILE 'android-toolchain' }
$jdk  = Join-Path $tc 'jdk'
$sdk  = Join-Path $tc 'sdk'
$bt   = Join-Path $sdk 'build-tools\34.0.0'
$jar  = Join-Path $sdk 'platforms\android-34\android.jar'
$build = Join-Path $proj 'build'
$dist  = Join-Path $proj 'dist'

$env:JAVA_HOME = $jdk
$java    = Join-Path $jdk 'bin\java.exe'
$javac   = Join-Path $jdk 'bin\javac.exe'
$keytool = Join-Path $jdk 'bin\keytool.exe'

function Step($m) { Write-Host ("[build] " + $m) -ForegroundColor Cyan }

foreach ($f in @($java, $javac, $keytool, (Join-Path $bt 'aapt2.exe'), (Join-Path $bt 'zipalign.exe'), $jar)) {
    if (-not (Test-Path $f)) { throw ("缺少依赖: " + $f) }
}

if (Test-Path $build) { Remove-Item $build -Recurse -Force }
New-Item -ItemType Directory -Force -Path $build, $dist, (Join-Path $build 'gen'), (Join-Path $build 'classes') | Out-Null

Step '1/7 aapt2 compile 资源'
& (Join-Path $bt 'aapt2.exe') compile --dir (Join-Path $proj 'res') -o (Join-Path $build 'res.zip')
if ($LASTEXITCODE) { throw 'aapt2 compile 失败' }

Step '2/7 aapt2 link（含 assets）'
$base = Join-Path $build 'base.apk'
& (Join-Path $bt 'aapt2.exe') link -o $base `
    --manifest (Join-Path $proj 'AndroidManifest.xml') `
    -I $jar `
    -A (Join-Path $proj 'assets') `
    --java (Join-Path $build 'gen') `
    --min-sdk-version 24 --target-sdk-version 34 `
    --version-code 5 --version-name '0.3.0' `
    --no-version-vectors `
    (Join-Path $build 'res.zip')
if ($LASTEXITCODE) { throw 'aapt2 link 失败' }

Step '3/7 javac 编译 Java'
$srcFiles = @(Get-ChildItem (Join-Path $proj 'src') -Recurse -Filter *.java | ForEach-Object { $_.FullName })
$rJava = @(Get-ChildItem (Join-Path $build 'gen') -Recurse -Filter *.java | ForEach-Object { $_.FullName })
Write-Host ("    源文件 " + $srcFiles.Count + " + R.java " + $rJava.Count)
& $javac -encoding UTF-8 -source 8 -target 8 -nowarn `
    -bootclasspath $jar -classpath $jar `
    -d (Join-Path $build 'classes') ($srcFiles + $rJava)
if ($LASTEXITCODE) { throw 'javac 失败' }

Step '4/7 d8 生成 classes.dex'
$classFiles = @(Get-ChildItem (Join-Path $build 'classes') -Recurse -Filter *.class | ForEach-Object { $_.FullName })
Write-Host ("    class 文件 " + $classFiles.Count)
$d8 = Join-Path $bt 'd8.bat'
$d8out = Join-Path $build 'dex'
New-Item -ItemType Directory -Force -Path $d8out | Out-Null
$d8Args = @('--lib', $jar, '--min-api', '24', '--output', $d8out) + $classFiles
& cmd /c "`"$d8`" $($d8Args -join ' ')"
if ($LASTEXITCODE) { throw 'd8 失败' }

Step '5/7 把 classes.dex 塞进 APK'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::Open($base, 'Update')
$dex = Join-Path $d8out 'classes.dex'
$entry = $zip.CreateEntry('classes.dex', [System.IO.Compression.CompressionLevel]::Optimal)
$in = [System.IO.File]::OpenRead($dex)
$outS = $entry.Open()
$in.CopyTo($outS)
$outS.Dispose(); $in.Dispose(); $zip.Dispose()
Write-Host ("    APK 大小 = " + [math]::Round((Get-Item $base).Length / 1MB, 2) + " MB")

Step '6/7 zipalign + 签名'
$aligned = Join-Path $build 'aligned.apk'
& (Join-Path $bt 'zipalign.exe') -f 4 $base $aligned
if ($LASTEXITCODE) { throw 'zipalign 失败' }

$ks = Join-Path $proj 'debug.keystore'
if (-not (Test-Path $ks)) {
    # keytool 把提示写到 stderr，PS 5.1 在 Stop 模式会误判成异常，故走 cmd /c
    & cmd /c "`"$keytool`" -genkeypair -keystore `"$ks`" -storepass android -keypass android -alias marktext -keyalg RSA -keysize 2048 -validity 10000 -dname `"CN=MarkText Android, O=local, C=CN`" 2>&1" | Out-Null
    if ($LASTEXITCODE -or -not (Test-Path $ks)) { throw 'keytool 失败' }
    Write-Host '    已生成 debug.keystore'
}
$apk = Join-Path $dist 'MarkText-Android-0.3.0.apk'
& cmd /c "`"$bt\apksigner.bat`" sign --ks `"$ks`" --ks-pass pass:android --key-pass pass:android --out `"$apk`" `"$aligned`""
if ($LASTEXITCODE) { throw 'apksigner 失败' }

Step '7/7 校验'
& cmd /c "`"$bt\apksigner.bat`" verify --print-certs `"$apk`"" 2>&1 | Select-Object -First 4
& (Join-Path $bt 'aapt2.exe') dump badging $apk 2>&1 | Select-Object -First 6

$f = Get-Item $apk
Write-Host ''
Write-Host ('  产物: ' + $f.FullName)
Write-Host ('  大小: ' + [math]::Round($f.Length / 1MB, 2) + ' MB')
Write-Host ('  SHA256: ' + (Get-FileHash $f -Algorithm SHA256).Hash.ToLower())
