# Verificar se DesDeck (electron.exe) está rodando

$dd_path = "C:\Users\pc\Desktop\DesDeck2\dd-src"
$processes = Get-Process electron -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "$dd_path*" }

if ($processes) {
  Write-Host "✅ DesDeck está rodando!" -ForegroundColor Green
  Write-Host ""
  $processes | Format-Table @{Name="PID"; Expression={$_.Id}}, @{Name="Memória (MB)"; Expression={[math]::Round($_.WorkingSet/1MB, 2)}} -AutoSize
  exit 0
} else {
  Write-Host "❌ DesDeck NÃO está rodando" -ForegroundColor Red
  exit 1
}
