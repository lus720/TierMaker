#!/bin/bash

# 修复隐藏作品名不影响搜索结果

cd "$(dirname "$0")"

# 检查是否有未提交的更改
if [ -z "$(git status --porcelain)" ]; then
    echo "没有需要提交的更改"
    exit 0
fi

# 添加所有更改
git add .

# 创建提交
git commit -m "fix: 修复隐藏作品名不影响搜索结果

- 移除搜索结果中的隐藏作品名逻辑
- 搜索结果始终显示作品名和元信息
- 隐藏作品名功能仅影响主页面显示和导出"

# 推送到远程仓库
git push origin main

echo "✅ 提交和推送完成"

