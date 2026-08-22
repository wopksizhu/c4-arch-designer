# ArchLens 单二进制构建脚本
# 用法：powershell -ExecutionPolicy Bypass -File build.ps1
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

Write-Host "[1/3] 构建前端 (Vite)..." -ForegroundColor Cyan
Push-Location "$root\web"
pnpm install
pnpm build
Pop-Location

Write-Host "[2/3] 拷贝前端产物到服务端嵌入目录..." -ForegroundColor Cyan
$src = "$root\web\dist"
$dst = "$root\server\internal\web\dist"
if (Test-Path $dst) { Remove-Item -Recurse -Force $dst }
New-Item -ItemType Directory -Force -Path $dst | Out-Null
Copy-Item -Recurse -Force "$src\*" $dst

Write-Host "[3/3] 构建服务端单二进制..." -ForegroundColor Cyan
Push-Location "$root\server"
go build -trimpath -ldflags "-s -w" -o "$root\archlens.exe" .
Pop-Location

Write-Host "完成：$root\archlens.exe" -ForegroundColor Green
Write-Host "启动：.\archlens.exe  (默认 http://127.0.0.1:8080)" -ForegroundColor Green
