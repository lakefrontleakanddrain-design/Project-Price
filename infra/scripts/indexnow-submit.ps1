param(
  [string]$HostName = "projectpriceapp.com",
  [string]$KeyFilePath = "J:\My Drive\OLD FILES\Secrets\indexnow.key",
  [string]$SitemapPath = "web/public/sitemap.xml",
  [string]$KeyLocation,
  [string[]]$UrlList
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($KeyFilePath) -or -not (Test-Path -LiteralPath $KeyFilePath)) {
  $candidatePaths = @(
    $KeyFilePath,
    $env:INDEXNOW_KEY_FILE,
    "J:\My Drive\OLD FILES\Secrets\indexnow.key",
    "secrets/indexnow.key"
  ) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }

  $KeyFilePath = $candidatePaths | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
}

if (-not (Test-Path -LiteralPath $KeyFilePath)) {
  throw "IndexNow key file not found at '$KeyFilePath'."
}

$key = (Get-Content -LiteralPath $KeyFilePath -Raw).Trim()
if ([string]::IsNullOrWhiteSpace($key)) {
  throw "IndexNow key in '$KeyFilePath' is empty."
}

if ([string]::IsNullOrWhiteSpace($KeyLocation)) {
  $KeyLocation = "https://$HostName/$key.txt"
}

$urls = @()
if ($UrlList -and $UrlList.Count -gt 0) {
  $urls = $UrlList
} else {
  if (-not (Test-Path -LiteralPath $SitemapPath)) {
    throw "Sitemap not found at '$SitemapPath'."
  }

  $sitemap = Get-Content -LiteralPath $SitemapPath -Raw
  $matches = [regex]::Matches($sitemap, "<loc>(.*?)</loc>")
  $urls = $matches | ForEach-Object { $_.Groups[1].Value.Trim() } | Where-Object { $_ } | Select-Object -Unique
}

if (-not $urls -or $urls.Count -eq 0) {
  throw "No URLs found to submit."
}

foreach ($url in $urls) {
  if ($url -notmatch "^https://") {
    throw "Invalid URL '$url'. All submitted URLs must start with https://"
  }
  if ($url -notlike "https://$HostName/*" -and $url -ne "https://$HostName") {
    throw "URL '$url' does not belong to host '$HostName'."
  }
}

$payload = @{
  host = $HostName
  key = $key
  keyLocation = $KeyLocation
  urlList = $urls
} | ConvertTo-Json -Depth 4

$response = Invoke-WebRequest `
  -Uri "https://api.indexnow.org/IndexNow" `
  -Method POST `
  -UseBasicParsing `
  -ContentType "application/json; charset=utf-8" `
  -Body $payload

Write-Host "IndexNow submit status: $($response.StatusCode)"
Write-Host "Submitted URL count: $($urls.Count)"
Write-Host "Host: $HostName"
