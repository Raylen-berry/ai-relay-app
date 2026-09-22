param(
    [string]$InstallDir = 'D:\APP\AI-Relay',
    [ValidateSet('chrome','edge')][string]$Browser = 'chrome'
)
$ErrorActionPreference = 'Stop'
$relaySource = $PSScriptRoot
$relayDestination = [IO.Path]::GetFullPath($InstallDir)
if ($relayDestination -eq [IO.Path]::GetPathRoot($relayDestination)) { throw '安装位置不能是磁盘根目录。' }
$relayManifest = Join-Path $relaySource 'extension\manifest.json'
if (!(Test-Path -LiteralPath $relayManifest)) { throw '缺少 extension 文件夹，请完整解压。' }
if (Test-Path -LiteralPath $relayDestination) {
    $existingManifest = Join-Path $relayDestination 'extension\manifest.json'
    if (!(Test-Path -LiteralPath $existingManifest)) { throw '目标目录已有其他内容，请改用空目录。' }
    $oldRelay = Get-Content -Raw -Encoding UTF8 -LiteralPath $existingManifest | ConvertFrom-Json
    $newRelay = Get-Content -Raw -Encoding UTF8 -LiteralPath $relayManifest | ConvertFrom-Json
    if ($oldRelay.key -ne $newRelay.key) { throw '目标目录不是此应用的既有安装。' }
}
New-Item -ItemType Directory -Path $relayDestination -Force | Out-Null
foreach ($relayItem in @('extension','assets','AI互审启动助手.exe','extension-id.txt','开始使用.html','README.md','验证记录.md')) {
    Copy-Item -LiteralPath (Join-Path $relaySource $relayItem) -Destination $relayDestination -Recurse -Force
}
$relayRelative = if ($Browser -eq 'chrome') {'Google\Chrome\Application\chrome.exe'} else {'Microsoft\Edge\Application\msedge.exe'}
$relayBrowserPath = @(
    (Join-Path ${env:ProgramFiles} $relayRelative),
    (Join-Path ${env:ProgramFiles(x86)} $relayRelative),
    (Join-Path $env:LOCALAPPDATA $relayRelative)
) | Where-Object {Test-Path -LiteralPath $_} | Select-Object -First 1
if (!$relayBrowserPath) { throw '没有找到所选浏览器。' }
$relayId = (Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $relayDestination 'extension-id.txt')).Trim()
$relayShell = New-Object -ComObject WScript.Shell
foreach ($relayShortcutDir in @([Environment]::GetFolderPath('Desktop'),[Environment]::GetFolderPath('Programs'))) {
    $relayShortcut = $relayShell.CreateShortcut((Join-Path $relayShortcutDir 'AI 互审.lnk'))
    $relayShortcut.TargetPath = $relayBrowserPath
    $relayShortcut.Arguments = '--app="chrome-extension://' + $relayId + '/app.html"'
    $relayShortcut.WorkingDirectory = $relayDestination
    $relayShortcut.IconLocation = (Join-Path $relayDestination 'assets\relay.ico')
    $relayShortcut.Description = 'AI 互审 Relay：回答、审核、定稿'
    $relayShortcut.Save()
}
Write-Output ('Installed to: '+$relayDestination)
Write-Output ('Extension folder: '+(Join-Path $relayDestination 'extension'))
Write-Output 'Desktop and Start menu shortcuts created. Load the unpacked extension once in the selected browser.'
