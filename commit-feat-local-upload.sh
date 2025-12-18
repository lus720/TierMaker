#!/bin/bash

# 提交本地上传功能

# 检查是否有未提交的更改
if [ -z "$(git status --porcelain)" ]; then
    echo "没有需要提交的更改"
    exit 0
fi

# 显示当前状态
echo "当前 Git 状态："
git status --short

# 添加所有更改
echo ""
echo "添加文件到暂存区..."
git add .

# 提交（使用规范化提交信息）
echo ""
echo "提交更改..."
git commit -m "feat(search): 添加本地上传图片和自定义标题功能

- 在搜索框中新增"本地上传"选项
- 支持点击选择或拖拽上传本地图片
- 支持自定义标题输入，未输入时自动使用文件名
- 图片转换为 base64 格式存储
- 添加图片预览和移除功能
- 文件类型和大小验证（最大 10MB）
- 优化用户交互体验"

# 推送到远程仓库
echo ""
echo "推送到 GitHub..."
git push

echo ""
echo "✅ 提交和推送完成！"

