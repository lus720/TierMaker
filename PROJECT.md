# TierMaker — 动漫/视觉小说 Tier List 生成器

TierMaker 是一款面向 ACG 爱好者的 **Tier List（评分表）在线生成工具**，支持通过拖拽的方式对动画、视觉小说、角色等内容进行分级排列，并一键导出为高清图片。

---

## 功能概览

### 🎯 核心功能

- **拖拽排序**：自定义拖放管理器，支持跨行、跨列任意拖拽，流畅无抖动
- **分级评分**：内置可自定义的评分等级（Tier），支持修改标签文字、颜色、字号及顺序
- **多数据源搜索**：
  - [Bangumi](https://bgm.tv) — 动画、书籍、游戏、音乐数据
  - [VNDB](https://vndb.org) — 视觉小说数据
  - Bangumi 角色数据
  - 本地图片上传
- **图片裁剪**：支持自动、居中、自定义坐标等多种裁剪模式，适配竖版封面图
- **高清导出**：基于 `html2canvas` 渲染，可调导出比例（1–6×），支持 PNG / PDF 格式
- **数据导入/导出**：支持完整 Tier List 数据的 JSON 导入导出，方便备份与分享

### 🖼️ 模板系统

- **模板画廊**：浏览并一键加载社区上传的图片模板集合
- **模板投稿**：用户可上传自定义模板到待审核队列，经审核后公开展示
- 基于 [CloudFlare ImgBed](https://github.com/MarSeventh/CloudFlare-ImgBed) 图床提供图片存储服务

### ⚙️ 个性化设置

- **主题切换**：支持亮色 / 暗色 / 跟随系统三种模式
- **紧凑模式**：去除卡片间距，最大化展示密度
- **显示/隐藏作品名称**：导出时可选择是否附带文字标注
- **容器尺寸调整**：自由调整图片卡片宽高比与行高
- **多语言支持**：中文 / 英文界面（`vue-i18n`）

---

## 技术栈

> 本项目为**纯前端 SPA**，无自建服务器。所有数据在浏览器本地存储，"后端"指项目对接的外部第三方 API 服务。

---

### 前端

#### 🧩 核心框架

| 技术 | 版本 | 说明 |
|------|------|------|
| [Vue 3](https://vuejs.org/) | ^3.5 | Composition API + `<script setup>` 语法，全部组件为单文件组件（SFC） |
| [TypeScript](https://www.typescriptlang.org/) | ~5.9 | 全项目类型覆盖，核心数据结构（`AnimeItem`、`TierRow`、`TierConfig` 等）定义于 `src/types.ts` |
| [vue-i18n](https://vue-i18n.intlify.dev/) | ^9.14 | 国际化，支持中文 / 英文切换；切换时自动同步默认等级标签，自定义标签保持不变 |

#### 🔨 构建工具链

| 技术 | 版本 | 说明 |
|------|------|------|
| [Vite](https://vitejs.dev/) | ^7.2 | 开发服务器（端口 3000）+ 生产构建，产物输出至 `dist/` |
| [@vitejs/plugin-vue](https://github.com/vitejs/vite-plugin-vue) | ^6.0 | Vue SFC 编译插件 |
| [vue-tsc](https://github.com/johnsoncodehk/volar) | ^3.1 | 构建时 Vue 组件的 TypeScript 类型检查 |
| 路径别名 | — | `~` 映射到 `src/`，简化深层目录导入 |
| 部署适配 | — | `BASE_URL` 环境变量动态配置 `base` 路径，同时兼容 GitHub Pages 子路径与自定义域名根路径 |

#### 🗄️ 本地数据存储

| 存储方式 | 用途 |
|----------|------|
| **IndexedDB**（via [localforage](https://localforage.github.io/localForage/) ^1.10） | 持久化 Tier 作品数据；图片以原生 `Blob` 存储，避免 Base64 字符串膨胀 |
| **LocalStorage** | 轻量级配置项：Tier 等级设置、主题偏好、导出倍率、Bangumi Token、最近搜索源 |
| **数据迁移** | 首次加载时检测旧 LocalStorage Base64 图片，自动转为 Blob 写入 IndexedDB 后删除旧键 |
| **导入/导出格式** | 导出时 Blob → Base64 嵌入 JSON 供备份；导入时 Base64 → Blob 恢复，跨设备兼容 |

#### 🖼️ 图片处理与导出

| 技术 | 版本 | 说明 |
|------|------|------|
| [html2canvas](https://html2canvas.hertzen.com/) | ^1.4 | DOM → Canvas 渲染，支持 1–6× 倍率（默认 4×）实现高分辨率图片导出 |
| [jsPDF](https://artskydj.github.io/jsPDF/) | ^4.0 | Canvas → PDF 导出 |
| Canvas API（原生） | — | `cropUtils.ts` 实现多种裁剪模式：`auto`、`center top/center/bottom`、`left/right center`、自定义像素坐标 |
| Blob URL | — | 运行时图片通过 `URL.createObjectURL()` 渲染，避免多次解码；保存时还原为 Blob 防止内存泄漏 |

#### 🔌 自定义拖放引擎

完全自研，基于原生 [Pointer Events API](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events)，**不依赖任何第三方拖拽库**（`dragManager.ts`）：

| 特性 | 实现方式 |
|------|----------|
| 跨行拖拽 | 全局注册所有行容器（`registerContainer`），实时计算最近目标容器 |
| 网格定位算法 | 依据鼠标坐标和容器宽度动态计算列数 `n` 与目标插入索引 |
| Ghost 元素 | 克隆源元素以 `position: fixed` 跟手显示 |
| Placeholder | 目标位置显示半透明占位预览 |
| 阈值触发 | 位移 > 5 px 才进入真正拖拽，否则 `pointerup` 识别为点击 |
| 滚动同步 | 监听 `scroll` 事件，以最后鼠标坐标刷新 Ghost 位置 |

#### ⚙️ 配置系统

| 技术 | 说明 |
|------|------|
| [yaml](https://eemeli.org/yaml/) ^2.8 | 解析 `config.yaml`，集中定义默认尺寸（图片宽高、间距、按钮等）、全局设置（主题、导出倍率）及 Tier 等级预设 |
| `configManager.ts` | 提供 `getConfig()` / `getSetting()` / `getDefaultTiers()` 统一访问接口 |
| 双语 Tier 预设 | 中文（夯 / 顶级 / 人上人 / NPC / 拉完了）与英文（S / A / B / C / D）分别维护，切换语言仅替换默认标签 |

---

### 后端（外部服务）

> 项目无自建后端，以下为前端直接调用的第三方 REST API。

#### 📦 内容数据 API

| 服务 | 接口形式 | 用途 |
|------|----------|------|
| [Bangumi API](https://bangumi.github.io/api/) | REST，Bearer Token 鉴权（用户自填） | 动画、书籍、游戏、音乐条目搜索及角色搜索 |
| [VNDB API](https://api.vndb.org/kana) | REST，无需鉴权 | 视觉小说搜索（`vndb.ts` 封装） |
| [bgmlist.com](https://bgmlist.com/) | REST，无需鉴权 | 获取各季度新番列表（`bangumiList.ts` 封装） |

#### 🖼️ 图床服务（CloudFlare ImgBed）

托管于 Cloudflare Pages，为模板系统提供图片存储：

| 端点 | 方法 | 功能 |
|------|------|------|
| `/upload` | POST | 上传图片到指定目录（`uploadFolder` 参数），返回 `/file/<path>` 路径 |
| `/api/manage/list` | GET | 列出目录下的文件与子目录 |
| `/api/manage/delete/<path>` | DELETE | 删除单个文件；`?folder=true` 递归删除整个目录 |

**目录结构约定：**
- `tiermaker_templates/<name>/` — 已审核公开模板
- `tiermaker_templates/_pending/<name>/` — 用户投稿待审核模板

**鉴权：** 所有写操作通过 `Authorization: Bearer <token>` 鉴权，Token 内置于前端代码（图床为项目专用实例）。

**用户身份：** 前端使用 `crypto.randomUUID()` 生成持久化匿名用户 ID（存于 LocalStorage），用于追踪本人投稿的待审核模板，无需注册登录。

---

## 项目结构

```
TierMaker/
├── src/
│   ├── components/          # Vue 组件
│   │   ├── TierList.vue     # 主列表（容器）
│   │   ├── TierRow.vue      # 单行（拖拽目标区域）
│   │   ├── SearchModal.vue  # 多数据源搜索弹窗
│   │   ├── EditItemModal.vue  # 作品详情编辑弹窗
│   │   ├── ConfigModal.vue  # 全局配置弹窗
│   │   ├── ExportModal.vue  # 导出弹窗
│   │   ├── ImportModal.vue  # 导入弹窗
│   │   ├── TemplateGallery.vue  # 模板画廊
│   │   ├── TemplateDetail.vue   # 模板详情
│   │   ├── ThemeToggle.vue  # 主题切换按钮
│   │   └── LanguageSelector.vue # 语言选择器
│   ├── utils/               # 工具模块
│   │   ├── bangumi.ts       # Bangumi API 封装
│   │   ├── vndb.ts          # VNDB API 封装
│   │   ├── bangumiList.ts   # 季度新番列表
│   │   ├── dragManager.ts   # 自定义拖放引擎
│   │   ├── exportUtils.ts   # 导出逻辑
│   │   ├── storage.ts       # IndexedDB 存储工具
│   │   ├── imgbed.ts        # 图床 API 封装
│   │   ├── configManager.ts # YAML 配置管理
│   │   ├── cropUtils.ts     # 图片裁剪工具
│   │   ├── colors.ts        # 颜色工具
│   │   ├── constants.ts     # 全局常量
│   │   ├── url.ts           # URL 处理工具
│   │   └── db.ts            # 数据库初始化
│   ├── i18n/                # 国际化
│   │   └── locales/         # zh.json / en.json
│   ├── types.ts             # 全局 TypeScript 类型定义
│   ├── App.vue              # 根组件
│   ├── main.ts              # 入口
│   └── style.css            # 全局样式
├── config.yaml              # 默认配置（尺寸、主题、Tier 预设）
├── index.html
├── package.json
└── vite.config.ts
```

---

## 快速开始

**环境要求**：Node.js ≥ 16，npm ≥ 7

```bash
# 安装依赖
npm install

# 启动开发服务器（访问 http://localhost:5173）
npm run dev

# 构建生产包
npm run build
```

---

## 数据源

| 数据源 | 内容 | 文档 |
|--------|------|------|
| Bangumi API | 动画、书籍、游戏、音乐、角色 | [bangumi.github.io/api](https://bangumi.github.io/api/) |
| VNDB API | 视觉小说 | [api.vndb.org](https://api.vndb.org/kana) |
| bgmlist.com | 季度新番列表 | [bgmlist.com](https://bgmlist.com/) |

> 使用 Bangumi 搜索需在设置中填写个人 Access Token（[获取地址](https://next.bgm.tv/demo/access-token)）。
