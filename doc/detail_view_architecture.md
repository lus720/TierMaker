# 详情视图 (Detail View) 架构文档

## 概述

详情视图是 TierMaker 项目的第二种视图模式，为用户提供更详细的每个作品信息展示和评论功能。该视图采用左右分栏布局，左侧展示作品图片和基本信息，右侧提供富文本评论编辑器。

## 架构概览

### 核心概念
- **双视图模式**: 支持 `card`（卡片视图）和 `detail`（详情视图）两种视图模式
- **数据一致性**: 两种视图共享同一份数据源（`tiers`），确保数据同步
- **独立配置**: 详情视图拥有独立的尺寸、字体、导出配置
- **富文本评论**: 基于 Tiptap 的专业富文本编辑器
- **响应式设计**: 根据配置动态调整布局和尺寸

### 文件结构
```
src/
├── components/
│   ├── DetailTierRow.vue      # 详情视图单个作品行组件
│   ├── DetailTierList.vue     # 详情视图Tier列表容器组件
│   └── RichTextEditor.vue     # 富文本编辑器组件
├── App.vue                    # 主应用，集成视图切换逻辑
├── types.ts                   # 类型定义，包含详情视图相关类型
└── utils/
    ├── storage.ts             # 存储管理，包含视图模式持久化
    └── configManager.ts       # 配置管理
doc/
└── plans/
    └── deatil-view-plan.md    # 详情视图设计方案文档
```

## 组件架构

### 1. DetailTierRow.vue - 单个作品详情行

**职责**: 渲染单个作品的详情视图行，提供左右两栏布局

**数据结构**:
```typescript
interface DetailTierRowProps {
  item: AnimeItem          // 作品数据
  tierId: string           // 所属Tier ID
  index: number            // 在Tier中的索引
  isExporting?: boolean    // 是否处于导出模式
}
```

**布局结构**:
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

**关键功能**:
1. **图片显示与裁剪**: 支持自定义裁剪位置，响应式图片尺寸
2. **富文本评论**: 集成 `RichTextEditor` 组件
3. **长按编辑**: 支持500ms长按触发编辑模式
4. **删除功能**: 右上角删除按钮
5. **链接跳转**: 支持作品外部链接

**配置驱动**:
- `detail-image-width`: 图片宽度（默认320px）
- `detail-image-height`: 图片高度（默认auto）
- `detail-image-aspect-ratio`: 宽高比（默认0.75）
- `detail-title-font-size`: 标题字号（默认32px）
- `detail-text-font-size`: 文本框字号（默认24px）

### 2. DetailTierList.vue - Tier列表容器

**职责**: 渲染详情视图中的Tier分组

**数据结构**:
```typescript
interface DetailTierListProps {
  tiers: Tier[]            // Tier数据数组
  tierConfigs: TierConfig[] // Tier配置数组
  isExporting?: boolean    // 是否处于导出模式
  hideTierLabels?: boolean // 是否隐藏Tier标签
}
```

**功能特性**:
1. **Tier标签显示**: 显示Tier标签，使用配置的颜色
2. **空Tier过滤**: 自动过滤掉没有作品的空Tier
3. **事件代理**: 代理子组件的事件到父组件
4. **响应式布局**: 根据内容动态调整

### 3. RichTextEditor.vue - 富文本编辑器

**职责**: 提供基于Tiptap的富文本编辑功能

**技术栈**:
- **核心**: Tiptap (基于 ProseMirror)
- **扩展**: StarterKit, Link, Underline, Placeholder
- **功能**: 加粗、斜体、下划线、列表、链接

**特性**:
1. **工具栏控制**: 可隐藏工具栏（详情视图中隐藏）
2. **只读模式**: 导出时自动切换到只读模式
3. **自动保存**: 内容变更时自动触发更新事件
4. **高度自适应**: 支持填充可用高度

## 数据流架构

### 1. 数据模型扩展

**AnimeItem 接口扩展** (`src/types.ts`):
```typescript
export interface AnimeItem {
  // ... 原有字段
  comment?: string       // 富文本 HTML 评论内容（详情视图右侧）
  leftContent?: string   // 左侧富文本内容（详情视图图片下方）
}

export type ViewMode = 'card' | 'detail'  // 视图模式类型
```

### 2. 状态管理

**核心状态** (`App.vue`):
```typescript
// 视图模式状态
const viewMode = ref<ViewMode>(loadViewMode())

// 详情视图导出倍率
const detailExportScale = ref<number>(1)
```

**状态持久化** (`storage.ts`):
```typescript
// 视图模式持久化
export function saveViewMode(mode: ViewMode): void
export function loadViewMode(): ViewMode

// 详情视图导出倍率持久化
export function saveDetailExportScale(scale: number): void
export function loadDetailExportScale(): number
```

### 3. 事件流

**数据更新流程**:
```
DetailTierRow (评论更新)
  → emit('update-comment', index, comment)
  → DetailTierList (事件代理)
    → emit('update-comment', tierId, rowId, index, comment)
    → App.vue (handleDetailUpdateComment)
      → 更新对应 item.comment
      → 自动持久化到 storage.ts
```

## 配置系统

### 1. 配置结构 (`config.yaml`)

```yaml
sizes:
  # 详情视图专属配置
  detail-image-width: 320           # 详情视图左侧图片宽度
  detail-image-height: auto         # 详情视图左侧图片高度
  detail-image-aspect-ratio: 0.75   # 详情视图宽高比
  detail-title-font-size: 32        # 详情视图标题字号(px)
  detail-text-font-size: 24         # 详情视图文本框字号(px)

settings:
  detail-export-scale: 1            # 详情视图导出倍率 (1-6)
```

### 2. 配置管理

**配置读取** (`DetailTierRow.vue`):
```typescript
const dimensionStyles = computed(() => {
  const wConfig = getSize('detail-image-width')
  const hConfig = getSize('detail-image-height')
  const rConfig = getSize('detail-image-aspect-ratio')
  // ... 计算逻辑
})
```

**配置界面** (`ConfigModal.vue`):
- 独立的详情视图配置区域
- 实时配置更新
- localStorage 覆盖机制

## 视图切换机制

### 1. 切换逻辑 (`App.vue`)

```typescript
function toggleViewMode() {
  viewMode.value = viewMode.value === 'card' ? 'detail' : 'card'
  saveViewMode(viewMode.value)
}
```

### 2. 条件渲染

```vue
<template>
  <!-- 卡片视图 -->
  <template v-if="viewMode === 'card'">
    <TierList ... />
  </template>

  <!-- 详情视图 -->
  <template v-else>
    <DetailTierList ... />
  </template>
</template>
```

### 3. UI切换按钮

```vue
<button @click="toggleViewMode" :title="viewMode === 'card' ? '切换到详情视图' : '切换到卡片视图'">
  {{ viewMode === 'card' ? '📋' : '🃏' }}
</button>
```

## 导出系统集成

### 1. 差异化导出

**导出配置选择** (`ExportModal.vue`):
```typescript
const widthKey = props.viewMode === 'detail' ? 'detail-image-width' : 'image-width'
const heightKey = props.viewMode === 'detail' ? 'detail-image-height' : 'image-height'
```

**导出倍率独立**:
```typescript
:initial-export-scale="viewMode === 'detail' ? detailExportScale : exportScale"
```

### 2. 导出处理

**富文本内容处理**:
- 导出时自动切换到只读模式
- 保持HTML结构，确保导出内容一致
- 处理图片引用，避免导出失败

**布局适配**:
- 根据详情视图布局调整导出逻辑
- 保持响应式设计的一致性

## 国际化支持

### 1. 翻译键定义

**英文** (`en.json`):
```json
"detailView": {
  "commentPlaceholder": "Write your review...",
  "detailView": "Detail View",
  "cardView": "Card View"
}
```

**中文** (`zh.json`):
```json
"detailView": {
  "commentPlaceholder": "写下你的评价...",
  "detailView": "详情视图",
  "cardView": "卡片视图"
}
```

### 2. 组件中使用

```vue
<RichTextEditor
  :placeholder="t('detailView.commentPlaceholder') || '写下你的评价...'"
/>
```

## 交互特性

### 1. 长按编辑
- **触发时间**: 500ms
- **视觉效果**: 半透明遮罩 + 进度环动画
- **触发事件**: `edit-item` with `isLongPress: true`

### 2. 删除功能
- **位置**: 图片右上角
- **交互**: 悬停显示，点击删除
- **确认**: 直接删除，无二次确认（与卡片视图一致）

### 3. 链接跳转
- **触发**: 点击作品标题
- **目标**: 在新标签页中打开作品链接
- **备选**: 使用原始URL或自定义URL

## 性能考虑

### 1. 渲染优化
- **虚拟滚动**: 未实现，适用于大量作品的情况
- **懒加载**: 图片懒加载，减少初始加载时间
- **组件复用**: 复用现有Tier数据，避免重复请求

### 2. 内存管理
- **富文本实例**: 自动销毁，避免内存泄漏
- **图片缓存**: 复用现有图片缓存机制
- **状态清理**: 切换视图时清理不必要的状态

### 3. 存储优化
- **增量更新**: 评论内容增量保存
- **压缩存储**: HTML内容原样存储，未压缩
- **备份机制**: 复用现有数据备份机制

## 扩展点设计

### 1. 预留插槽
```vue
<!-- 左侧额外内容 -->
<slot name="detail-left-extra" />

<!-- 右侧额外内容 -->
<slot name="detail-right-extra" />
```

### 2. 配置扩展
- **字体样式**: 支持更多字体配置选项
- **布局变体**: 支持左右布局切换
- **主题适配**: 支持暗色模式优化

### 3. 功能扩展
- **评论模板**: 预定义评论模板
- **批量操作**: 批量编辑评论
- **导入导出**: 评论内容单独导入导出

## 依赖关系图

```mermaid
graph TD
    App[App.vue] --> DetailTierList[DetailTierList.vue]
    DetailTierList --> DetailTierRow[DetailTierRow.vue]
    DetailTierRow --> RichTextEditor[RichTextEditor.vue]
    DetailTierRow --> ConfigManager[utils/configManager.ts]
    DetailTierRow --> Storage[utils/storage.ts]

    App --> Types[types.ts]
    App --> Storage

    RichTextEditor --> Tiptap[@tiptap/vue-3]

    ConfigManager --> ConfigYAML[config.yaml]

    Storage --> LocalStorage[localStorage API]

    DetailTierRow --> CropUtils[utils/cropUtils.ts]
    DetailTierRow --> UrlUtils[utils/url.ts]
```

## 设计决策与权衡

### 1. 架构选择
- **双向数据流**: 选择事件冒泡而非全局状态，保持组件独立性
- **配置驱动**: 使用配置而非硬编码，提高灵活性
- **渐进增强**: 在现有架构上扩展，最小化影响

### 2. 技术选型
- **富文本编辑器**: 选择Tiptap而非Quill，因为更好的Vue 3集成和ProseMirror基础
- **布局方案**: 选择绝对定位而非Flex布局，确保右侧评论区域高度自适应
- **存储策略**: 复用现有存储系统，保持数据一致性

### 3. 用户体验
- **无拖拽**: 详情视图不支持拖拽排序，因为行布局不适合拖拽交互
- **即时保存**: 评论内容即时保存，避免数据丢失
- **视觉反馈**: 长按提供明确视觉反馈，提高可发现性

## Commit 623e5aec 架构评审

以下对提交 `623e5aec100f5b23e0513412f1ef1030fd0ddbe7` ("feat: 评论模式") 进行架构分析，评估其是否符合开闭原则、模块化和插件化设计。

### 1. 开闭原则 (Open/Closed Principle) 符合度分析

**优秀实践**:
- **扩展而非修改**: 在现有 `AnimeItem` 接口上添加可选字段 (`comment`, `leftContent`)，而非修改原有字段结构
- **新增视图模式**: 通过 `ViewMode` 类型添加 `'detail'` 视图，而非修改现有 `'card'` 视图逻辑
- **独立组件**: 创建全新的 `DetailTierList`、`DetailTierRow`、`RichTextEditor` 组件，未修改现有 `TierList`、`TierRow` 组件
- **配置扩展**: 在 `config.yaml` 中添加 `detail-*` 配置键，而非覆盖现有配置
- **存储层扩展**: 添加 `saveViewMode`、`loadViewMode` 等函数，而非修改现有存储逻辑

**潜在改进**:
- `App.vue` 中新增了 `handleDetailUpdateComment`、`handleDetailUpdateLeftContent` 等函数，这些函数逻辑与现有的 `handleUpdateComment` 类似，未来可考虑抽象为通用函数

**总体评价**: **高度符合**开闭原则。现有功能完全不受影响，所有新增功能通过扩展实现。

### 2. 模块化 (Modularity) 符合度分析

**优秀实践**:
- **职责分离**:
  - `DetailTierRow.vue`: 单个作品行渲染、图片显示、富文本评论
  - `DetailTierList.vue`: Tier分组容器、事件代理
  - `RichTextEditor.vue`: 富文本编辑功能
  - `ExportModal.vue`: 根据视图模式差异化导出
- **高内聚**: 每个组件聚焦于单一职责，相关功能高度集中
- **低耦合**:
  - 组件间通过 props/events 通信
  - 配置通过 `configManager` 统一管理
  - 数据通过共享的 `tiers` 状态流传递
- **接口清晰**: 所有组件都有明确的 TypeScript 类型定义
- **依赖注入**: 配置管理、存储工具通过导入使用，易于测试和替换

**潜在改进**:
- `App.vue` 仍然承担过多职责（状态管理、事件处理、视图切换），可考虑提取为 composable

**总体评价**: **良好符合**模块化原则。组件边界清晰，职责明确，耦合度较低。

### 3. 插件化 (Pluggability) 符合度分析

**优秀实践**:
- **配置驱动架构**:
  - 视图模式通过 `viewMode` 状态切换
  - 详情视图拥有独立的尺寸、字体、导出配置
  - 配置可通过 `config.yaml` 和 localStorage 覆盖
- **可插拔组件**:
  - `RichTextEditor` 基于 Tiptap，支持扩展更多编辑器功能
  - `DetailTierRow` 提供预留插槽 (`detail-left-extra`, `detail-right-extra`)
  - 导出系统支持根据视图模式选择不同策略
- **扩展点设计**:
  - 数据模型扩展 (`comment`, `leftContent` 字段)
  - 存储层扩展 (新增视图模式持久化)
  - 配置系统扩展 (`detail-*` 配置键)
- **松耦合集成**:
  - 富文本编辑器可独立使用
  - 详情视图组件可独立于卡片视图运行
  - 导出逻辑根据 `viewMode` 动态适配

**潜在改进**:
- 视图切换逻辑硬编码为 `'card' | 'detail'`，未来添加新视图模式需要修改类型定义
- 导出策略选择基于条件判断，可设计为策略模式

**总体评价**: **良好符合**插件化原则。系统设计了多个扩展点，支持配置驱动，组件可插拔性较强。

### 4. 架构质量总结

| 维度 | 评分 | 说明 |
|------|------|------|
| 开闭原则 | ⭐⭐⭐⭐⭐ | 完美符合，零修改现有代码 |
| 模块化 | ⭐⭐⭐⭐ | 组件职责清晰，但 App.vue 仍有优化空间 |
| 插件化 | ⭐⭐⭐⭐ | 扩展点丰富，配置驱动，但类型系统可更灵活 |
| 可维护性 | ⭐⭐⭐⭐ | 代码结构清晰，类型安全，文档完善 |
| 可测试性 | ⭐⭐⭐ | 组件间依赖清晰，但缺乏测试基础设施 |

**关键优点**:
1. **无侵入式扩展**: 完全不影响现有功能
2. **配置驱动**: 所有尺寸、字体、导出参数可配置
3. **类型安全**: 完整的 TypeScript 类型定义
4. **渐进增强**: 在现有架构上自然延伸

**改进建议**:
1. 提取 `App.vue` 中的状态管理逻辑到 composable
2. 使用策略模式实现视图切换和导出逻辑
3. 为富文本编辑器添加更多扩展选项
4. 增加单元测试覆盖新组件

此提交展现了良好的软件工程实践，通过扩展而非修改的方式实现了复杂功能，为未来的功能演进奠定了坚实基础。

## 测试策略

### 1. 手动测试场景
1. **视图切换**: 卡片 ↔ 详情视图切换功能
2. **评论编辑**: 富文本编辑器功能测试
3. **数据持久化**: 刷新页面数据保持
4. **导出功能**: 详情视图PNG导出
5. **响应式布局**: 不同屏幕尺寸适配

### 2. 自动化测试考虑
- **组件测试**: Vue组件单元测试
- **集成测试**: 视图切换和数据流测试
- **快照测试**: 确保UI一致性

## 已知限制与未来改进

### 1. 当前限制
- **性能**: 大量作品时可能存在性能问题
- **移动端**: 未针对移动端进行深度优化
- **无障碍**: 键盘导航支持有限

### 2. 改进方向
- **虚拟滚动**: 实现虚拟滚动优化性能
- **离线支持**: 增强离线编辑能力
- **协作功能**: 添加评论协作功能

### 3. 架构优化计划
基于对 Commit 623e5aec 的架构评审，已制定详细实施计划以解决以下架构问题：

1. **状态管理提取**: 将 App.vue 中的状态管理逻辑提取到 `useTierData` composable，降低复杂度，提高可测试性
2. **策略模式应用**: 使用策略模式重构视图切换和导出逻辑，消除硬编码条件判断
3. **富文本扩展**: 为 RichTextEditor 添加更多扩展选项，提升编辑体验

**详细实施计划**: 参见 `doc/plans/detail-view-improvements-plan.md`

**优先级**:
1. 状态管理提取 (高优先级，基础重构)
2. 策略模式应用 (中优先级，依赖1)
3. 富文本扩展 (低优先级，独立实施)

**预期收益**:
- 代码复杂度降低 (App.vue 行数减少 50%+)
- 更好的可维护性和可测试性
- 更灵活的扩展架构
- 用户无感知的性能提升

---

*文档最后更新: 2026-02-15*
*对应版本: TierMaker 详情视图 v1.0*