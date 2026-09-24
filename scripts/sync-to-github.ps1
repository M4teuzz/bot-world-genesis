$ErrorActionPreference = 'Stop'

$repositoryUrl = 'https://github.com/M4teuzz/bot-world-genesis.git'
$branch = 'main'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

if (-not (Get-Command git.exe -ErrorAction SilentlyContinue)) {
  throw 'Git nao esta instalado ou nao esta no PATH. Instale o Git for Windows e abra um novo terminal.'
}

if (-not (Test-Path -LiteralPath (Join-Path $projectRoot '.git'))) {
  git init
}

$originExists = git remote | Select-String -SimpleMatch 'origin'
$remote = if ($originExists) { git remote get-url origin } else { $null }
if (-not $originExists) {
  git remote add origin $repositoryUrl
} elseif ($remote -ne $repositoryUrl) {
  git remote set-url origin $repositoryUrl
}

git branch -M $branch
if (-not (git config user.name)) {
  git config user.name 'M4teuzz'
}
if (-not (git config user.email)) {
  git config user.email 'M4teuzz@users.noreply.github.com'
}

function Sync-Changes {
  git add --all
  $pending = git status --porcelain
  if (-not $pending) {
    return
  }

  $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
  git commit -m "Atualizacao automatica $timestamp"
  if ($LASTEXITCODE -ne 0) {
    throw 'O commit Git falhou.'
  }
  git push --set-upstream origin $branch
  if ($LASTEXITCODE -ne 0) {
    throw 'O push para o GitHub falhou.'
  }
  Write-Host "Sincronizado com GitHub em $timestamp"
}

Sync-Changes

$watcher = New-Object System.IO.FileSystemWatcher
$watcher.Path = $projectRoot
$watcher.IncludeSubdirectories = $true
$watcher.EnableRaisingEvents = $true
$watcher.NotifyFilter = [IO.NotifyFilters]'FileName, LastWrite, DirectoryName'

$ignoredSegments = @('\.git\', '\node_modules\', '\dist\', '\data\')
$ignoredFiles = @('\.env', '\.env\.')
$timer = New-Object System.Timers.Timer
$timer.Interval = 3000
$timer.AutoReset = $false
$syncPending = $false

$scheduleSync = {
  $path = $Event.SourceEventArgs.FullPath
  $relativePath = $path.Substring($projectRoot.Length)
  if (($ignoredSegments | Where-Object { $relativePath -like "*$_*" }) -or ($ignoredFiles | Where-Object { $relativePath -match $_ })) {
    return
  }

  $script:syncPending = $true
  $timer.Stop()
  $timer.Start()
}

$timer.add_Elapsed({
  if (-not $script:syncPending) {
    return
  }

  $script:syncPending = $false
  try {
    Sync-Changes
  } catch {
    Write-Error "Falha ao sincronizar: $($_.Exception.Message)"
  }
})

$created = Register-ObjectEvent $watcher Created -Action $scheduleSync
$changed = Register-ObjectEvent $watcher Changed -Action $scheduleSync
$deleted = Register-ObjectEvent $watcher Deleted -Action $scheduleSync
$renamed = Register-ObjectEvent $watcher Renamed -Action $scheduleSync

Write-Host 'Sincronizacao automatica ativa. Deixe esta janela aberta.'
Write-Host 'Pressione Ctrl+C para encerrar.'
try {
  while ($true) {
    Wait-Event -Timeout 5 | Out-Null
  }
} finally {
  $watcher.Dispose()
  $timer.Dispose()
  Unregister-Event -SourceIdentifier $created.Name -ErrorAction SilentlyContinue
  Unregister-Event -SourceIdentifier $changed.Name -ErrorAction SilentlyContinue
  Unregister-Event -SourceIdentifier $deleted.Name -ErrorAction SilentlyContinue
  Unregister-Event -SourceIdentifier $renamed.Name -ErrorAction SilentlyContinue
}