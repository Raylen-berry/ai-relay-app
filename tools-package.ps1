$ErrorActionPreference = 'Stop'
$relayRoot = $PSScriptRoot
$relayManifest = Get-Content -LiteralPath (Join-Path $relayRoot 'extension\manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$relayVersion = $relayManifest.version
$relayStage = Join-Path $relayRoot ('dist\AI-Relay-' + $relayVersion + '-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $relayStage -Force | Out-Null
foreach ($relayItem in @('extension','AI互审启动助手.exe','extension-id.txt','Install.ps1','安装到本机.cmd','开始使用.html','换机安装.md','README.md','README.en.md','更新记录.md','验证记录.md')) {
    Copy-Item -LiteralPath (Join-Path $relayRoot $relayItem) -Destination $relayStage -Recurse -Force
}
New-Item -ItemType Directory -Path (Join-Path $relayStage 'assets') | Out-Null
foreach ($relayAsset in @('relay-128.png',('relay-' + $relayVersion + '.ico'))) {
    Copy-Item -LiteralPath (Join-Path $relayRoot ('assets\' + $relayAsset)) -Destination (Join-Path $relayStage 'assets')
}
$relayArchive = Join-Path $relayRoot ('AI-Relay-' + $relayVersion + '-Windows.zip')
Compress-Archive -Path (Join-Path $relayStage '*') -DestinationPath $relayArchive -Force
$relayHasher = [Security.Cryptography.SHA256]::Create()
$relayStream = [IO.File]::OpenRead($relayArchive)
try {$relayHash = ([BitConverter]::ToString($relayHasher.ComputeHash($relayStream))).Replace('-','').ToLowerInvariant()}
finally {$relayStream.Dispose(); $relayHasher.Dispose()}
[IO.File]::WriteAllText(($relayArchive + '.sha256'),($relayHash + '  ' + [IO.Path]::GetFileName($relayArchive) + "`n"),[Text.Encoding]::ASCII)
Write-Output ('Package: ' + $relayArchive)
Write-Output ('SHA256: ' + $relayHash)
