param(
  [int]$Port = 8776,
  [switch]$Once
)

$ErrorActionPreference = "Stop"

$Root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$Address = [Net.IPAddress]::Parse("127.0.0.1")
$Listener = [Net.Sockets.TcpListener]::new($Address, $Port)

function Get-ContentType {
  param([string]$Path)

  switch ([IO.Path]::GetExtension($Path).ToLowerInvariant()) {
    ".html" { "text/html; charset=utf-8"; break }
    ".css" { "text/css; charset=utf-8"; break }
    ".js" { "text/javascript; charset=utf-8"; break }
    ".mjs" { "text/javascript; charset=utf-8"; break }
    ".json" { "application/json; charset=utf-8"; break }
    ".md" { "text/markdown; charset=utf-8"; break }
    ".png" { "image/png"; break }
    ".jpg" { "image/jpeg"; break }
    ".jpeg" { "image/jpeg"; break }
    default { "application/octet-stream"; break }
  }
}

function Send-Response {
  param(
    [Net.Sockets.NetworkStream]$Stream,
    [int]$Status,
    [string]$StatusText,
    [string]$ContentType,
    [byte[]]$Body
  )

  $Header = "HTTP/1.1 $Status $StatusText`r`nContent-Type: $ContentType`r`nContent-Length: $($Body.Length)`r`nConnection: close`r`n`r`n"
  $HeaderBytes = [Text.Encoding]::ASCII.GetBytes($Header)
  $Stream.Write($HeaderBytes, 0, $HeaderBytes.Length)
  $Stream.Write($Body, 0, $Body.Length)
}

function Resolve-RequestPath {
  param([string]$RequestLine)

  if ($RequestLine -notmatch "^GET\s+([^\s?]+)") {
    return $null
  }

  $RequestPath = [Uri]::UnescapeDataString($Matches[1])
  if ($RequestPath -eq "/") {
    $RequestPath = "/index.html"
  }

  $RelativePath = $RequestPath.TrimStart("/").Replace("/", [IO.Path]::DirectorySeparatorChar)
  $Candidate = Join-Path $Root $RelativePath
  $Resolved = Resolve-Path -LiteralPath $Candidate -ErrorAction SilentlyContinue

  if (-not $Resolved) {
    return $null
  }

  $ResolvedPath = $Resolved.Path
  if (-not $ResolvedPath.StartsWith($Root, [StringComparison]::OrdinalIgnoreCase)) {
    return $null
  }

  if ((Get-Item -LiteralPath $ResolvedPath).PSIsContainer) {
    return $null
  }

  return $ResolvedPath
}

function Handle-Client {
  param([Net.Sockets.TcpClient]$Client)

  $Stream = $Client.GetStream()
  $Buffer = New-Object byte[] 4096
  $BytesRead = $Stream.Read($Buffer, 0, $Buffer.Length)

  if ($BytesRead -le 0) {
    return
  }

  $RequestText = [Text.Encoding]::ASCII.GetString($Buffer, 0, $BytesRead)
  $RequestLine = ($RequestText -split "`r?`n")[0]
  $FilePath = Resolve-RequestPath $RequestLine

  if (-not $FilePath) {
    $Body = [Text.Encoding]::UTF8.GetBytes("Not found")
    Send-Response $Stream 404 "Not Found" "text/plain; charset=utf-8" $Body
    return
  }

  $Body = [IO.File]::ReadAllBytes($FilePath)
  Send-Response $Stream 200 "OK" (Get-ContentType $FilePath) $Body
}

$Listener.Start()
Write-Host "Serving ESP32 Timelapse Box configurator at http://127.0.0.1:$Port/"
Write-Host "Close this window to stop the local web server."

try {
  do {
    $Client = $Listener.AcceptTcpClient()
    try {
      Handle-Client $Client
    } finally {
      $Client.Close()
    }
  } while (-not $Once)
} finally {
  $Listener.Stop()
}
