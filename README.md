# 极简 Tier List - 动画评分表生成器

一个黑白极简风格的动画评分表生成器，支持自定义评分等级和多行布局，集成多个数据源 API 搜索功能。

## ✨ 特性

- 🎨 **黑白极简风格** - 简洁的黑白设计，专注于内容
- 📊 **自定义评分等级** - 支持自定义评分等级（S, A, B, C, D 等）
- 📝 **多行布局** - 每个评分等级可以有多行，灵活排列
- 🔍 **多数据源支持** - 集成 Bangumi 作品和角色搜索，支持本地上传
- 🌐 **NSFW 内容支持** - Bangumi API 支持 Access Token 访问 NSFW 内容
- 💾 **本地存储** - 数据自动保存到浏览器本地存储
- 🎯 **拖拽排序** - 支持拖拽调整动画顺序
- 📱 **响应式设计** - 适配不同屏幕尺寸

## 🚀 快速开始

### 环境要求

- Node.js >= 16.0.0
- npm >= 7.0.0

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

访问 http://localhost:5173

### 构建生产版本

```bash
npm run build
```

构建产物将输出到 `dist` 目录。

### 预览生产版本

```bash
npm run preview
```

## 📖 使用说明

### 1. 配置评分等级

1. 点击页面右上角的"配置评分等级"按钮
2. 在弹窗中可以：
   - 添加新的评分等级
   - 修改等级 ID、标签和颜色
   - 调整等级顺序（使用 ↑ ↓ 按钮）
   - 删除不需要的等级

### 2. 添加作品

1. 点击任意空位（显示 "+" 的地方）
2. 在弹出的搜索框中：
   - 选择数据源（Bangumi 作品 / Bangumi 角色 / 本地上传）
   - 输入作品名称进行搜索，或上传本地图片
   - 从搜索结果中选择要添加的作品
3. 作品会自动添加到对应位置

### 2.1 编辑作品

- 点击作品卡片可以编辑作品信息
- 支持修改图片、名称、日期等
- 支持图片裁剪和预览

### 3. 添加新行

1. 点击评分等级标签旁的 "+" 按钮
2. 会在该等级下添加一个新行
3. 每个等级可以有多个行，方便分类排列

### 4. 删除操作

- **删除作品**：鼠标悬停在作品卡片上，点击右上角的 "×" 按钮
- **删除行**：点击行右侧的 "×" 按钮（每个等级至少保留一行）

### 5. 拖拽排序

- 在同一行内拖动作品卡片可以调整顺序
- 支持拖拽到同一等级的其他行

### 6. 数据保存

所有数据会自动保存到浏览器本地存储，刷新页面后数据不会丢失。

## 🔍 数据源说明

### Bangumi（番组计划）

- **支持内容类型**：书籍、动画、音乐、游戏、三次元
- **搜索功能**：支持通过作品名称搜索
- **角色搜索**：支持搜索 Bangumi 角色
- **NSFW 支持**：配置 Access Token 后可访问 NSFW 内容
- **API 文档**：[https://bangumi.github.io/api/](https://bangumi.github.io/api/)
- **扩展链接资源**：[BangumiExtLinker](https://github.com/Rhilip/BangumiExtLinker) - Bangumi 与其他元数据网站的 ID 关联数据

**配置 Access Token**（可选，用于访问 NSFW 内容）：
1. 访问 https://next.bgm.tv/demo/access-token 获取 Access Token
2. 在设置页面中配置 Access Token，或直接在 `src/utils/bangumi.ts` 中修改 `BGM_ACCESS_TOKEN` 常量

### 本地上传

- **支持功能**：上传本地图片作为作品封面
- **自定义标题**：可以为上传的图片设置自定义标题
- **图片裁剪**：支持图片裁剪和预览功能

## 🛠️ 技术栈

- **Vue 3** - 渐进式 JavaScript 框架（组合式 API）
- **TypeScript** - 类型安全的 JavaScript
- **Vite** - 下一代前端构建工具
- **SortableJS** - 拖拽排序功能
- **html2canvas** - 图片导出功能
- **jsPDF** - PDF 导出功能
- **Bangumi API** - 番组计划 API

## 📝 项目结构

```
tier-list-simple/
├── src/
│   ├── components/          # Vue 组件
│   │   ├── TierList.vue    # 主列表组件
│   │   ├── TierRow.vue     # 行组件（支持拖拽）
│   │   ├── SearchModal.vue # 搜索模态框（支持多数据源）
│   │   ├── EditItemModal.vue # 编辑作品模态框
│   │   └── ConfigModal.vue # 配置模态框
│   ├── utils/              # 工具函数
│   │   ├── bangumi.ts      # Bangumi API 封装
│   │   ├── storage.ts      # 本地存储工具
│   │   └── url.ts          # URL 处理工具
│   ├── types.ts            # TypeScript 类型定义
│   ├── App.vue             # 根组件
│   ├── main.ts             # 入口文件
│   └── style.css           # 全局样式
├── index.html              # HTML 模板
├── package.json            # 项目配置
├── vite.config.ts          # Vite 配置
├── tsconfig.json           # TypeScript 配置
└── README.md               # 项目说明
```

## 🔧 配置说明

### Bangumi API

**基本使用**：
- 项目使用 Bangumi 公开 API，无需配置即可使用
- 默认支持搜索书籍、动画、音乐、游戏、三次元等内容
- 支持搜索 Bangumi 角色

**NSFW 内容支持**（可选）：
1. 访问 https://next.bgm.tv/demo/access-token 获取 Access Token
2. 在设置页面中配置 Access Token，或编辑 `src/utils/bangumi.ts`，修改 `BGM_ACCESS_TOKEN` 常量：
   ```typescript
   const BGM_ACCESS_TOKEN = 'YOUR_ACCESS_TOKEN_HERE'
   ```
3. 配置后即可搜索和访问 NSFW 内容

## 📊 数据格式

### Tier 数据结构

```typescript
{
  id: "S",           // 等级 ID
  rows: [            // 行数组
    {
      id: "S-row-0", // 行 ID
      items: [        // 作品数组
        {
          id: 12345,
          name: "作品名称",
          name_cn: "中文名称",
          image: "图片URL",
          date: "2024-01-01",
          score: 8.5
        }
      ]
    }
  ]
}
```

### 配置数据结构

```typescript
[
  {
    id: "S",
    label: "S",
    color: "#000000",
    order: 0
  }
]
```

## 🌐 API 端点

### Bangumi API

- **搜索端点**：`POST https://api.bgm.tv/v0/search/subjects`
- **角色搜索端点**：`POST https://api.bgm.tv/v0/search/characters`
- **详情端点**：`GET https://api.bgm.tv/v0/subjects/{id}`
- **API 文档**：[https://bangumi.github.io/api/](https://bangumi.github.io/api/)
- **扩展资源**：[BangumiExtLinker](https://github.com/Rhilip/BangumiExtLinker) - Bangumi 与其他元数据网站的 ID 关联数据

## ⚠️ 注意事项

1. **API 限制**：
   - Bangumi API 有频率限制，频繁请求可能被限制
   - 建议合理控制搜索频率，避免触发限制

2. **数据存储**：
   - 数据存储在浏览器本地存储（localStorage）
   - 清除浏览器数据会丢失所有数据
   - 建议定期导出数据备份

3. **NSFW 内容**：
   - 需要配置 Bangumi Access Token 才能访问 NSFW 内容
   - Token 可能过期，需要定期更新
   - 可在设置页面中配置 Token

4. **图片处理**：
   - 本地上传的图片支持裁剪功能
   - 图片会转换为 base64 格式存储在本地
   - 大量图片可能影响页面性能

## 🔮 未来计划

- [ ] 跨行拖拽功能
- [ ] 更多搜索筛选选项
- [ ] 作品详情查看
- [ ] 多语言支持
- [ ] 更多导出格式支持

## 📄 许可证

MIT License

## 🙏 致谢

- [Bangumi](https://bgm.tv/) - 动画数据来源
- [Vue.js](https://vuejs.org/) - 优秀的框架
- [Vite](https://vitejs.dev/) - 快速的构建工具
- [SortableJS](https://sortablejs.github.io/Sortable/) - 拖拽排序库

## 📞 问题反馈

如果遇到问题或有功能建议，欢迎提交 Issue 或 Pull Request。
