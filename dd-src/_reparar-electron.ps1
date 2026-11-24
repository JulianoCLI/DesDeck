# Reparo do Electron para o iniciar.bat.
#
# Por que existe: com Node.js 24+, o 'extract-zip' (usado pelo postinstall do
# pacote 'electron') trava silenciosamente no meio da extracao do zip do
# Electron: o npm instala o pacote, "termina com sucesso", mas o dist fica sem
# o electron.exe. A extracao via .NET (System.IO.Compression) nao tem esse
# problema e e usada aqui como um plano B.
#
# Uso: powershell -NoProfile -ExecutionPolicy Bypass -File _reparar-electron.ps1
#   -app "C:\caminho\para\dd-src"
#
# Devolve 0 se o electron.exe existir ao final, 1 se nao deu para reparar.

param(
  [Parameter(Mandatory = $true)]
  [string]$app
)

$ErrorActionPreference = 'Stop'

$electronDir = Join-Path $app 'node_modules\electron'
$dist = Join-Path $electronDir 'dist'
$exe = Join-Path $dist 'electron.exe'

if (Test-Path $exe) {
  Write-Output "[reparo] electron.exe ja existe. Nada a fazer."
  exit 0
}

# O zip baixado pelo npm fica no cache do Electron.
$cache = Join-Path $env:LOCALAPPDATA 'electron\Cache'
$zip = Get-ChildItem -Path $cache -Recurse -Filter 'electron-v*-win32-x64.zip' -File -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1

if (-not $zip) {
  Write-Output "[reparo] nao achei o zip do Electron no cache ($cache). Baixe de novo."
  exit 1
}

Write-Output "[reparo] Electron incompleto apos npm install. Extraindo com .NET..."

# A extracao travada do npm deixou um dist pela metade (ex.: so o
# LICENSES.chromium.html). O ZipFile refusesExtrairToDirectory nao sobrescreve,
# entao descarta a pasta inteira antes de extrair de novo. So toca no dist do
# electron, nunca em outra coisa.
if (Test-Path $dist) { Remove-Item -Path $dist -Recurse -Force }
New-Item -ItemType Directory -Path $dist | Out-Null

try {
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  [System.IO.Compression.ZipFile]::ExtractToDirectory($zip.FullName, $dist)
} catch {
  Write-Output "[reparo] extracao falhou: $($_.Exception.Message)"
  exit 1
}

# O pacote electron espera um path.txt dizendo onde esta o executavel.
Set-Content -Path (Join-Path $electronDir 'path.txt') -Value 'electron.exe' -Encoding ascii -NoNewline

if (Test-Path $exe) {
  Write-Output "[reparo] ok: electron.exe reparado ($((Get-Item $exe).Length) bytes)."
  exit 0
}

Write-Output "[reparo] extraiu, mas o electron.exe nao apareceu."
exit 1
