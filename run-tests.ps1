# ArchLens 系统性 API 集成测试
# 前提：服务已在 http://127.0.0.1:8080 运行（单独终端跑 .\archlens.exe）
# 用法：
#   powershell -ExecutionPolicy Bypass -File run-tests.ps1             # 普通测试
#   powershell -ExecutionPolicy Bypass -File run-tests.ps1 -AI         # 含 AI 测试（走 DeepSeek，较慢）
param(
  [string]$Base = "http://127.0.0.1:8080",
  [switch]$AI
)
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

# 0) 确认服务可连
try { Invoke-WebRequest -Uri "$Base/api/projects" -UseBasicParsing -TimeoutSec 5 | Out-Null }
catch { Write-Host "无法连接服务 $Base —— 请先启动 .\archlens.exe" -ForegroundColor Red; exit 1 }

Push-Location "$root\server"
try {
  if ($AI) {
    go run ./scripts/apitest -base $Base -ai
  } else {
    go run ./scripts/apitest -base $Base
  }
  if ($LASTEXITCODE -ne 0) { Write-Host "测试未全部通过。" -ForegroundColor Red; exit 1 }
} finally {
  Pop-Location
}
