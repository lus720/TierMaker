#!/bin/bash
# Bash 脚本：推送到 GitHub
# 使用方法：chmod +x push-to-github.sh && ./push-to-github.sh

echo "=== 检查 Git 状态 ==="
git status

echo ""
echo "=== 添加所有更改的文件 ==="
git add .

echo ""
echo "=== 提交更改 ==="
git commit -m "移除 AniDB 搜索功能"

echo ""
echo "=== 推送到 GitHub ==="
echo "请确保已配置远程仓库："
echo "  git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git"
echo ""
echo "正在推送到 main 分支..."

BRANCH=$(git branch --show-current)
if [ "$BRANCH" != "main" ] && [ "$BRANCH" != "master" ]; then
    echo "当前分支: $BRANCH"
    echo "切换到 main 分支..."
    git checkout -b main 2>/dev/null || git checkout main
fi

git push -u origin main

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ 推送成功！"
    echo "GitHub Actions 将自动开始构建和部署..."
else
    echo ""
    echo "❌ 推送失败，请检查错误信息"
fi

