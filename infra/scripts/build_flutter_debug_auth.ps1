param(
  [string]$SupabaseUrl = $env:PROJECTPRICE_SUPABASE_URL,
  [string]$SupabaseAnonKey = $env:PROJECTPRICE_SUPABASE_ANON_KEY,
  [string]$FlutterExe = "C:\flutter\bin\flutter.bat",
  [string]$VersionTag = (Get-Date -Format "yyyyMMdd-HHmmss"),
  [string]$OutputDir = "",
  [bool]$UpdateLatestAlias = $true
)

$ErrorActionPreference = "Stop"

$scriptRoot = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
$localConfigPath = Join-Path $scriptRoot "build_flutter_debug_auth.local.ps1"

if (Test-Path $localConfigPath) {
  . $localConfigPath
}

if ([string]::IsNullOrWhiteSpace($SupabaseUrl)) {
  if (Get-Variable -Name ProjectPriceSupabaseUrlDefault -Scope Script -ErrorAction SilentlyContinue) {
    $SupabaseUrl = $script:ProjectPriceSupabaseUrlDefault
  } elseif (Get-Variable -Name ProjectPriceSupabaseUrlDefault -Scope Global -ErrorAction SilentlyContinue) {
    $SupabaseUrl = $global:ProjectPriceSupabaseUrlDefault
  }
}

if ([string]::IsNullOrWhiteSpace($SupabaseAnonKey)) {
  if (Get-Variable -Name ProjectPriceSupabaseAnonKeyDefault -Scope Script -ErrorAction SilentlyContinue) {
    $SupabaseAnonKey = $script:ProjectPriceSupabaseAnonKeyDefault
  } elseif (Get-Variable -Name ProjectPriceSupabaseAnonKeyDefault -Scope Global -ErrorAction SilentlyContinue) {
    $SupabaseAnonKey = $global:ProjectPriceSupabaseAnonKeyDefault
  }
}

if (Get-Variable -Name FlutterExeDefault -Scope Script -ErrorAction SilentlyContinue) {
  $FlutterExe = $script:FlutterExeDefault
} elseif (Get-Variable -Name FlutterExeDefault -Scope Global -ErrorAction SilentlyContinue) {
  $FlutterExe = $global:FlutterExeDefault
}

if ([string]::IsNullOrWhiteSpace($SupabaseUrl) -or $SupabaseUrl.StartsWith("PLACEHOLDER_")) {
  Write-Error "PROJECTPRICE_SUPABASE_URL is missing. Set env var or build_flutter_debug_auth.local.ps1 (ProjectPriceSupabaseUrlDefault)."
  exit 1
}

if ([string]::IsNullOrWhiteSpace($SupabaseAnonKey) -or $SupabaseAnonKey.StartsWith("PLACEHOLDER_")) {
  Write-Error "PROJECTPRICE_SUPABASE_ANON_KEY is missing. Set env var or build_flutter_debug_auth.local.ps1 (ProjectPriceSupabaseAnonKeyDefault)."
  exit 1
}

if (-not (Test-Path $FlutterExe)) {
  Write-Error "Flutter executable not found at $FlutterExe"
  exit 1
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$flutterDir = Join-Path $repoRoot "apps\flutter_app"

if ([string]::IsNullOrWhiteSpace($OutputDir)) {
  $OutputDir = Split-Path -Parent $repoRoot
}

if (-not (Test-Path $flutterDir)) {
  Write-Error "Flutter app directory not found: $flutterDir"
  exit 1
}

Push-Location $flutterDir
try {
  & $FlutterExe pub get
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }

  & $FlutterExe build apk --debug `
    "--dart-define=PROJECTPRICE_SUPABASE_URL=$SupabaseUrl" `
    "--dart-define=PROJECTPRICE_SUPABASE_ANON_KEY=$SupabaseAnonKey"

  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }

  $apkCandidates = @(
    (Join-Path $flutterDir "build\app\outputs\flutter-apk\app-debug.apk"),
    (Join-Path $flutterDir "build\app\outputs\apk\debug\app-debug.apk")
  )

  $apkPath = $apkCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1

  if (Test-Path $apkPath) {
    $apk = Get-Item $apkPath
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null

    $versionedName = "projectprice-debug-v$VersionTag.apk"
    $versionedPath = Join-Path $OutputDir $versionedName

    $suffix = 1
    while (Test-Path $versionedPath) {
      $versionedName = "projectprice-debug-v$VersionTag-$suffix.apk"
      $versionedPath = Join-Path $OutputDir $versionedName
      $suffix++
    }

    Copy-Item -Path $apk.FullName -Destination $versionedPath -Force

    $latestAliasPath = Join-Path $OutputDir "projectprice-debug-latest.apk"
    if ($UpdateLatestAlias) {
      Copy-Item -Path $apk.FullName -Destination $latestAliasPath -Force
    }

    Write-Host "Built APK:" $apk.FullName
    Write-Host "LastWriteTime:" $apk.LastWriteTime
    Write-Host "Size(MB):" ([Math]::Round($apk.Length / 1MB, 2))
    Write-Host "Versioned copy:" $versionedPath
    if ($UpdateLatestAlias) {
      Write-Host "Latest alias:" $latestAliasPath
    }
  } else {
    Write-Warning "Build completed but APK was not found in expected output folders."
  }
}
finally {
  Pop-Location
}
