param(
    [string]$InstallDir = (Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'Programs\AI-Relay'),
    [ValidateSet('auto','chrome','edge')][string]$Browser = 'auto',
    [switch]$SkipShortcuts,
    [switch]$ShowGuide
)
$ErrorActionPreference = 'Stop'
$relaySource = $PSScriptRoot
$relayDestination = [IO.Path]::GetFullPath($InstallDir)
if ($relayDestination -eq [IO.Path]::GetPathRoot($relayDestination)) { throw '安装位置不能是磁盘根目录。' }
$relayManifest = Join-Path $relaySource 'extension\manifest.json'
if (!(Test-Path -LiteralPath $relayManifest)) { throw '缺少 extension 文件夹，请完整解压。' }
$newRelay = Get-Content -Raw -Encoding UTF8 -LiteralPath $relayManifest | ConvertFrom-Json
$relayCandidates = if ($Browser -eq 'auto') {@('edge','chrome')} else {@($Browser)}
$relayBrowserPath = $null
foreach ($relayCandidate in $relayCandidates) {
    $relayRelative = if ($relayCandidate -eq 'chrome') {'Google\Chrome\Application\chrome.exe'} else {'Microsoft\Edge\Application\msedge.exe'}
    $relayBrowserPath = @(
        (Join-Path ${env:ProgramFiles} $relayRelative),
        (Join-Path ${env:ProgramFiles(x86)} $relayRelative),
        (Join-Path $env:LOCALAPPDATA $relayRelative)
    ) | Where-Object {Test-Path -LiteralPath $_} | Select-Object -First 1
    if ($relayBrowserPath) {$Browser = $relayCandidate; break}
}
if (!$relayBrowserPath) { throw '没有找到 Edge 或 Chrome，请先安装浏览器。' }
if (Test-Path -LiteralPath $relayDestination) {
    $existingManifest = Join-Path $relayDestination 'extension\manifest.json'
    if (!(Test-Path -LiteralPath $existingManifest)) { throw '目标目录已有其他内容，请改用空目录。' }
    $oldRelay = Get-Content -Raw -Encoding UTF8 -LiteralPath $existingManifest | ConvertFrom-Json
    if ($oldRelay.key -ne $newRelay.key) { throw '目标目录不是此应用的既有安装。' }
}
New-Item -ItemType Directory -Path $relayDestination -Force | Out-Null
foreach ($relayItem in @('extension','assets','AI互审启动助手.exe','extension-id.txt','开始使用.html','README.md','README.en.md','更新记录.md','验证记录.md','三项流程试用指南.md','示例资料','换机安装.md','Install.ps1','安装到本机.cmd')) {
    if ([IO.Path]::GetFullPath($relaySource).TrimEnd('\') -ne $relayDestination.TrimEnd('\')) {
        Copy-Item -LiteralPath (Join-Path $relaySource $relayItem) -Destination $relayDestination -Recurse -Force
    }
}
Set-Content -LiteralPath (Join-Path $relayDestination 'installed.txt') -Value $newRelay.version -Encoding UTF8
$relayId = (Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $relayDestination 'extension-id.txt')).Trim()
if ($relayId -notmatch '^[a-p]{32}$') {throw '扩展标识无效，请重新完整下载。'}
if (!$SkipShortcuts) {
$relayShell = New-Object -ComObject WScript.Shell
foreach ($relayShortcutDir in @([Environment]::GetFolderPath('Desktop'),[Environment]::GetFolderPath('Programs'))) {
    $relayShortcut = $relayShell.CreateShortcut((Join-Path $relayShortcutDir 'AI 互审.lnk'))
    $relayShortcut.TargetPath = $relayBrowserPath
    $relayShortcut.Arguments = '--app="chrome-extension://' + $relayId + '/open.html"'
    $relayShortcut.WorkingDirectory = $relayDestination
    $relayShortcut.IconLocation = (Join-Path $relayDestination ('assets\relay-' + $newRelay.version + '.ico'))
    $relayShortcut.Description = 'AI 互审 Relay：回答、审核、定稿'
    $relayShortcut.Save()
}
}
if ($ShowGuide) {
    Start-Process -FilePath $relayBrowserPath -ArgumentList ('"' + (Join-Path $relayDestination '开始使用.html') + '"') -WindowStyle Hidden
}
Write-Output ('Installed to: '+$relayDestination)
Write-Output ('Extension folder: '+(Join-Path $relayDestination 'extension'))
if (!$SkipShortcuts) {Write-Output 'Desktop and Start menu shortcuts created.'}
Write-Output 'Load the unpacked extension once in the selected browser.'
