# PowerShell 脚本：推送到 GitHub
# 使用方法：在 PowerShell 中运行 ./push-to-github.ps1

Write-Host "=== 检查 Git 状态 ===" -ForegroundColor Cyan
git status

Write-Host "`n=== 添加所有更改的文件 ===" -ForegroundColor Cyan
git add .

Write-Host "`n=== 提交更改 ===" -ForegroundColor Cyan
$commitMessage = "移除 AniDB 搜索功能"
git commit -m $commitMessage

Write-Host "`n=== 推送到 GitHub ===" -ForegroundColor Cyan
Write-Host "请确保已配置远程仓库：" -ForegroundColor Yellow
Write-Host "  git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git" -ForegroundColor Yellow
Write-Host "`n正在推送到 main 分支..." -ForegroundColor Green

$branch = git branch --show-current
if ($branch -ne "main" -and $branch -ne "master") {
    Write-Host "当前分支: $branch" -ForegroundColor Yellow
    Write-Host "切换到 main 分支..." -ForegroundColor Yellow
    git checkout -b main 2>$null
    if ($LASTEXITCODE -ne 0) {
        git checkout main
    }
}

git push -u origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✅ 推送成功！" -ForegroundColor Green
    Write-Host "GitHub Actions 将自动开始构建和部署..." -ForegroundColor Green
} else {
    Write-Host "`n❌ 推送失败，请检查错误信息" -ForegroundColor Red
}

