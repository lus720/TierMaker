# 排行榜详情视图（Detail View）方案

为 TierMaker 新增「详情视图」模式，每个作品占满一行：左侧放图片+富文本，右侧放作品信息+富文本评论。支持与原有卡片视图自由切换，导出为 PNG，架构预留 Markdown/PDF/HTML 扩展点。

## User Review Required

> [!NOTE]
> **已确认**：使用 [Tiptap](https://tiptap.dev/) 作为富文本编辑器（ProseMirror 内核，Vue 3 官方支持）。需安装 `@tiptap/vue-3`、`@tiptap/starter-kit`、`@tiptap/extension-link` 等依赖。

> [!NOTE]
> **已确认**：详情视图使用单独的导出分辨率配置（`detail-export-scale`），与卡片视图的 `export-scale` 独立。

---

## Proposed Changes

### 数据模型 (Data Model)

#### [MODIFY] [types.ts](file:///c:/Users/12192/TierMaker/src/types.ts)

为 `AnimeItem` 接口添加：

```diff
 export interface AnimeItem {
   // ... existing fields
+  comment?: string       // 富文本 HTML 评论内容
+  leftContent?: string   // 左侧富文本内容（图片下方）
 }
```

新增视图模式类型：

```diff
+export type ViewMode = 'card' | 'detail'
```

---

### 持久化 (Storage)

#### [MODIFY] [storage.ts](file:///c:/Users/12192/TierMaker/src/utils/storage.ts)

- 序列化/反序列化时包含 `comment` 和 `leftContent` 字段
- 新增 `saveViewMode` / `loadViewMode` 函数
- 新增 `saveDetailExportScale` / `loadDetailExportScale` 函数
- 导出数据 (`exportAllData`) 包含 comment 数据

---

### 富文本编辑器组件

需安装依赖：`npm install @tiptap/vue-3 @tiptap/starter-kit @tiptap/extension-link @tiptap/extension-underline @tiptap/extension-placeholder`

#### [NEW] [RichTextEditor.vue](file:///c:/Users/12192/TierMaker/src/components/RichTextEditor.vue)

基于 Tiptap（ProseMirror）的富文本编辑器：

- 工具栏：加粗 (B)、斜体 (I)、下划线 (U)、列表、链接
- Props: `modelValue: string` (HTML)、`placeholder: string`、`readonly: boolean`
- Emit: `update:modelValue`
- 支持导出模式（只读渲染，无工具栏）
- 使用 Tiptap StarterKit + Link + Underline + Placeholder 扩展

---

### 详情视图组件

#### [NEW] [DetailTierRow.vue](file:///c:/Users/12192/TierMaker/src/components/DetailTierRow.vue)

单个作品的详情行，左右两栏布局：

```
┌──────────────────────────────────────────────┐
│ ┌─────────────┐  ┌────────────────────────┐  │
│ │             │  │ 作品名 · 日期 · 评分   │  │
│ │   封面图    │  │ ─────────────────────── │  │
│ │             │  │ [富文本评论编辑器]      │  │
│ │             │  │                        │  │
│ ├─────────────┤  │                        │  │
│ │ [左侧富文本]│  │                        │  │
│ └─────────────┘  └────────────────────────┘  │
└──────────────────────────────────────────────┘
```

- **左侧 slot 区域** (`detail-left`)：图片容器 + `RichTextEditor`（用于左侧富文本）+ 预留 slot
- **右侧 slot 区域** (`detail-right`)：作品信息展示 + `RichTextEditor`（用于评论）+ 预留 slot
- Props 复用现有 `AnimeItem`，不侵入现有逻辑

#### [NEW] [DetailTierList.vue](file:///c:/Users/12192/TierMaker/src/components/DetailTierList.vue)

详情视图的 Tier 列表容器：

- 遍历 tiers → 每个 tier 显示 label + 遍历 items 渲染 `DetailTierRow`
- Tier label 样式沿用现有配色方案
- 不支持拖拽排序（详情视图中拖拽体验差，排序在卡片视图完成）

---

### 视图切换

#### [MODIFY] [App.vue](file:///c:/Users/12192/TierMaker/src/App.vue)

- 新增 `viewMode` ref（`'card' | 'detail'`）
- Header 区域添加视图切换按钮（卡片图标 / 列表图标）
- 条件渲染：`viewMode === 'card'` 时显示现有 `TierList`，`viewMode === 'detail'` 时显示 `DetailTierList`
- 两者共享同一个 `tiers` / `tierConfigs` 数据源
- 切换时保存 viewMode 到 localStorage

---

### 导出架构

#### [MODIFY] [ExportModal.vue](file:///c:/Users/12192/TierMaker/src/components/ExportModal.vue)

- 接收当前 `viewMode` prop
- 当 `viewMode === 'detail'` 时，导出目标改为详情视图的 DOM
- PNG 导出：复用现有 `html2canvas` 管道

#### [NEW] [exportStrategies.ts](file:///c:/Users/12192/TierMaker/src/utils/exportStrategies.ts)

导出策略接口，为未来扩展做准备：

```typescript
export interface ExportStrategy {
  name: string
  export(data: ExportData): Promise<Blob | string>
}

// 已实现
export class PngExportStrategy implements ExportStrategy { ... }

// 预留接口（暂不实现）
// export class MarkdownExportStrategy implements ExportStrategy { ... }
// export class HtmlExportStrategy implements ExportStrategy { ... }
```

---

## Verification Plan

### Automated Tests

现有测试只有一个 sanity check（`src/test/sanity.test.ts`），无实质性测试。本次不新增自动化测试（组件依赖 DOM、html2canvas 等浏览器 API，不适合纯单元测试）。

### Manual Verification (Browser)

使用浏览器工具进行验证：

1. **启动开发服务器**：`cd c:\Users\12192\TierMaker && npm run dev`
2. **视图切换验证**：
   - 在 header 找到视图切换按钮
   - 点击切换到「详情视图」，确认每个作品显示为左图右评论的布局
   - 点击切回「卡片视图」，确认恢复原有卡片布局
   - 数据在两个视图之间保持一致
3. **富文本编辑验证**：
   - 在详情视图中点击评论区域，输入文字，使用工具栏加粗/斜体
   - 刷新页面，确认评论内容持久化
   - 切换到卡片视图再切回，确认评论不丢失
4. **导出验证**：
   - 在详情视图中点击导出 → 图片(PNG)
   - 检查生成的图片包含详情视图布局
5. **响应式验证**：缩小窗口宽度，确认详情视图不崩溃/溢出
