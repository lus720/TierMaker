#!/bin/bash

# 提交隐藏作品名功能

cd "$(dirname "$0")"

# 检查是否有未提交的更改
if [ -z "$(git status --porcelain)" ]; then
    echo "没有需要提交的更改"
    exit 0
fi

# 添加所有更改
git add .

# 创建提交
git commit -m "feat: 添加隐藏作品名功能

- 在设置中添加隐藏作品名选项
- 隐藏作品名时，主页面作品名会被隐藏
- 隐藏作品名时，占位符框只显示封面部分（高度133px）
- 隐藏作品名时，添加作品框中的标题区域会被隐藏
- 导出图片和PDF时也会隐藏作品名
- 调整作品项高度和行间距以适应隐藏作品名的状态"

# 推送到远程仓库
git push origin main

echo "✅ 提交和推送完成"

