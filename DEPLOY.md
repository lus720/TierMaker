# GitHub Pages 部署指南

## 部署步骤

### 1. 创建 GitHub 仓库

1. 在 GitHub 上创建一个新仓库（例如：`tier-list-simple`）
2. 不要初始化 README、.gitignore 或 license（因为项目已经有了）

### 2. 初始化 Git 并推送代码

在项目根目录执行以下命令：

```bash
# 初始化 Git（如果还没有）
git init

# 添加所有文件
git add .

# 提交
git commit -m "Initial commit"

# 添加远程仓库（替换 YOUR_USERNAME 和 YOUR_REPO_NAME）
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git

# 推送到 main 分支
git branch -M main
git push -u origin main
```

### 3. 启用 GitHub Pages

1. 进入仓库的 **Settings**（设置）页面
2. 在左侧菜单中找到 **Pages**（页面）
3. 在 **Source**（源）下选择：
   - **Source**: `Deploy from a branch`
   - **Branch**: `gh-pages`（GitHub Actions 会自动创建）
   - **Folder**: `/ (root)`
4. 点击 **Save**（保存）

### 4. 配置仓库名称（重要）

由于项目使用了动态 base path，需要确保仓库名称正确：

1. 在 `vite.config.ts` 中，`base` 配置会根据环境变量 `BASE_URL` 自动设置
2. GitHub Actions workflow 会自动设置 `BASE_URL` 为 `/TierMaker/`
3. 部署后的 URL 将是：
   `https://lushuozju.github.io/TierMaker/`

### 5. 触发部署

推送代码到 `main` 分支后，GitHub Actions 会自动：
1. 安装依赖
2. 构建项目
3. 部署到 GitHub Pages

你可以在仓库的 **Actions**（操作）标签页查看部署进度。

### 6. 访问网站

部署完成后（通常需要几分钟），访问：
`https://YOUR_USERNAME.github.io/YOUR_REPO_NAME/`

## 自定义域名（可选）

如果你想使用自定义域名：

1. 在 `vite.config.ts` 中将 `base` 改为 `'/'`
2. 在仓库的 **Settings** > **Pages** 中添加自定义域名
3. 按照 GitHub 的说明配置 DNS

## 注意事项

- 首次部署可能需要 5-10 分钟
- 每次推送到 `main` 分支都会自动重新部署
- 如果部署失败，检查 **Actions** 标签页中的错误信息
- 确保 `.github/workflows/deploy.yml` 文件已正确创建

## 故障排除

### 部署后页面空白

检查浏览器控制台是否有 404 错误。如果资源路径不正确，可能需要：
1. 确认仓库名称是否正确
2. 检查 `vite.config.ts` 中的 `base` 配置

### 图片无法加载

GitHub Pages 是静态托管，确保：
1. 所有图片资源都在 `public` 目录或通过 URL 引用
2. 跨域图片使用代理服务（如 `wsrv.nl`）

### 构建失败

检查：
1. `package.json` 中的依赖是否正确
2. 代码是否有语法错误
3. GitHub Actions 日志中的错误信息

