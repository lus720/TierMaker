# 详情视图架构改进实施计划

## 概述

本计划旨在实施对 TierMaker 详情视图架构的三个改进建议，以提升代码质量、可维护性和扩展性。三个改进建议按照优先级排序：

1. **提取 App.vue 中的状态管理逻辑到 composable** (高优先级)
2. **使用策略模式实现视图切换和导出逻辑** (中优先级)
3. **为富文本编辑器添加更多扩展选项** (低优先级)

## 改进建议 1: 提取状态管理逻辑到 Composable

### 目标
将 App.vue 中的状态管理和业务逻辑提取到独立的 composable，降低 App.vue 的复杂度，提高代码可复用性和可测试性。

### 当前问题
- App.vue 文件过大（超过 1000 行），违反单一职责原则
- 状态管理、事件处理、UI逻辑混杂在一起
- 难以进行单元测试
- 代码重复（如处理 tiers 和 unrankedTiers 的逻辑）

### 解决方案
创建 `useTierData` composable，封装所有与 Tier 数据相关的状态和操作。

### 实施步骤

#### 阶段 1: 分析现有代码结构
1. 识别需要提取的状态变量：
   - `tiers`, `unrankedTiers`, `tierConfigs`
   - `viewMode`, `detailExportScale`
   - `showSearch`, `showConfig`, `showEditItem`, `showImportModal`
   - `currentTierId`, `currentRowId`, `currentIndex`, `currentEditItem`, `isLongPressEdit`
   - `title`, `titleFontSize`, `hideItemNames`, `exportScale`
   - `isDragging`, `tierListRef`, `configModalKey`
   - `duplicateItemIds` (computed)

2. 识别需要提取的函数：
   - 数据操作：`handleAddItem`, `handleSelectAnime`, `handleSelectAnimeMultiple`
   - 行操作：`handleAddRow`, `handleDeleteRow`
   - 项目操作：`handleDeleteItem`, `handleMoveItem`, `handleReorder`
   - 编辑操作：`handleEditItem`, `handleSaveEditItem`, `handleCloseEditItem`
   - 详情视图操作：`handleDetailUpdateComment`, `handleDetailUpdateLeftContent`
   - 配置操作：`handleUpdateConfigs`, `handleUpdateTitleFontSize`, `handleUpdateTheme`, `handleUpdateHideItemNames`, `handleUpdateExportScale`
   - 其他操作：`handleClearAll`, `handleResetSettings`, `handleTitleInput`, `handleTitleBlur`, `handleTitleFocus`, `handleClearClick`, `handleConfirmClear`, `handleCancelClear`
   - 导入导出：`handleImportClick`, `handleDataImport`, `handleFileImport`
   - 主题相关：`applyTheme`, `getCurrentThemeBackgroundColor`, `initTheme`
   - 视图切换：`toggleViewMode`, `toggleLanguage`

#### 阶段 2: 创建 Composable 文件
1. 创建目录：`src/composables/`
2. 创建文件：`src/composables/useTierData.ts`
3. 定义类型和接口：
   ```typescript
   export interface UseTierDataOptions {
     // 可选的配置选项
   }

   export interface UseTierDataReturn {
     // 所有状态和函数
     tiers: Ref<Tier[]>
     unrankedTiers: Ref<Tier[]>
     tierConfigs: Ref<TierConfig[]>
     viewMode: Ref<ViewMode>
     // ... 其他状态

     // 所有函数
     handleAddItem: (tierId: string, rowId: string, index: number) => void
     handleSelectAnime: (anime: AnimeItem) => void
     // ... 其他函数
   }
   ```

#### 阶段 3: 实现 Composable
1. 复制现有逻辑到 composable
2. 保持相同的函数签名和类型
3. 处理依赖关系（如 storage.ts 的导入）
4. 确保 reactive 状态正确传递

#### 阶段 4: 重构 App.vue
1. 导入 composable：
   ```typescript
   const {
     tiers,
     unrankedTiers,
     tierConfigs,
     viewMode,
     detailExportScale,
     // ... 其他状态和函数
   } = useTierData()
   ```

2. 移除重复的状态定义和函数
3. 更新模板中的事件绑定
4. 确保所有功能正常工作

#### 阶段 5: 测试与验证
1. 手动测试所有功能：
   - 添加/删除项目
   - 编辑项目
   - 切换视图模式
   - 导入/导出数据
   - 配置更改

### 文件变更
- **新建**: `src/composables/useTierData.ts`
- **修改**: `src/App.vue` (大量代码移除)
- **修改**: `src/components/ExportModal.vue` (可能需要调整 props)
- **修改**: `src/components/ConfigModal.vue` (事件处理更新)

### 风险
1. **破坏性变更**: 如果函数签名变更，可能影响子组件
2. **状态同步**: 确保 reactive 状态正确同步
3. **性能影响**: 需要验证性能无退化
4. **测试覆盖**: 缺乏自动化测试，依赖手动测试

### 验证方法
1. 运行现有应用，验证所有功能正常
2. 检查浏览器控制台无错误
3. 验证数据持久化正常工作
4. 性能测试：大数量项目时无明显性能下降

## 改进建议 2: 使用策略模式实现视图切换和导出逻辑

### 目标
消除 ExportModal.vue 中的硬编码条件判断，通过策略模式实现视图相关的差异化逻辑。

### 当前问题
- ExportModal.vue 中多处 `props.viewMode === 'detail'` 条件判断
- 代码重复，违反 DRY 原则
- 添加新视图模式时需要修改多处条件判断
- 视图相关逻辑分散在不同文件中

### 解决方案
创建视图策略接口和具体实现，将视图特定的逻辑封装到策略类中。

### 实施步骤

#### 阶段 1: 设计策略接口
1. 创建 `src/utils/viewStrategies.ts`
2. 定义策略接口：
   ```typescript
   export interface ViewStrategy {
     name: ViewMode
     getImageWidthKey(): string
     getImageHeightKey(): string
     getDefaultImageWidth(): number
     getDefaultImageHeight(): number
     getAspectRatioKey(): string
     getExportScale(tierData: UseTierDataReturn): number
     updateExportScale(tierData: UseTierDataReturn, scale: number): void
     // 可能需要的其他方法
   }
   ```

#### 阶段 2: 实现具体策略
1. 实现 `CardViewStrategy`:
   ```typescript
   export class CardViewStrategy implements ViewStrategy {
     name: ViewMode = 'card'

     getImageWidthKey(): string { return 'image-width' }
     getImageHeightKey(): string { return 'image-height' }
     getDefaultImageWidth(): number { return 100 }
     getDefaultImageHeight(): number { return 133 }
     getAspectRatioKey(): string { return 'image-aspect-ratio' }
     getExportScale(tierData: UseTierDataReturn): number { return tierData.exportScale.value }
     updateExportScale(tierData: UseTierDataReturn, scale: number): void {
       tierData.exportScale.value = scale
       saveExportScale(scale)
     }
   }
   ```

2. 实现 `DetailViewStrategy`:
   ```typescript
   export class DetailViewStrategy implements ViewStrategy {
     name: ViewMode = 'detail'

     getImageWidthKey(): string { return 'detail-image-width' }
     getImageHeightKey(): string { return 'detail-image-height' }
     getDefaultImageWidth(): number { return 320 }
     getDefaultImageHeight(): number { return 0 } // auto
     getAspectRatioKey(): string { return 'detail-image-aspect-ratio' }
     getExportScale(tierData: UseTierDataReturn): number { return tierData.detailExportScale.value }
     updateExportScale(tierData: UseTierDataReturn, scale: number): void {
       tierData.detailExportScale.value = scale
       saveDetailExportScale(scale)
     }
   }
   ```

#### 阶段 3: 创建策略工厂
```typescript
export function getViewStrategy(viewMode: ViewMode): ViewStrategy {
  switch (viewMode) {
    case 'card':
      return new CardViewStrategy()
    case 'detail':
      return new DetailViewStrategy()
    default:
      throw new Error(`Unknown view mode: ${viewMode}`)
  }
}
```

#### 阶段 4: 重构 ExportModal.vue
1. 导入策略工厂：
   ```typescript
   import { getViewStrategy } from '../utils/viewStrategies'
   ```

2. 替换条件判断：
   ```typescript
   // 替换前
   const widthKey = props.viewMode === 'detail' ? 'detail-image-width' : 'image-width'

   // 替换后
   const strategy = getViewStrategy(props.viewMode || 'card')
   const widthKey = strategy.getImageWidthKey()
   ```

3. 更新所有使用 viewMode 条件判断的地方

#### 阶段 5: 重构 App.vue（或 useTierData）
1. 在视图切换逻辑中使用策略模式
2. 统一导出倍率更新逻辑

### 文件变更
- **新建**: `src/utils/viewStrategies.ts`
- **修改**: `src/components/ExportModal.vue` (替换条件判断)
- **修改**: `src/composables/useTierData.ts` (集成策略模式)
- **修改**: `src/App.vue` (更新导出倍率处理)

### 风险
1. **接口设计**: 策略接口可能不完整，需要后续扩展
2. **性能**: 策略对象创建开销可忽略不计
3. **向后兼容**: 保持现有功能不变

### 验证方法
1. 验证两种视图模式的导出功能正常
2. 检查导出图片尺寸和配置正确
3. 测试视图切换后导出配置正确切换

## 改进建议 3: 为富文本编辑器添加更多扩展选项

### 目标
增强 RichTextEditor.vue 的功能，提供更多富文本编辑选项，提高编辑体验。

### 当前问题
- 富文本编辑器功能有限（仅加粗、斜体、下划线、列表、链接）
- 缺乏常用功能如标题、引用、代码块等
- 无法配置启用/禁用特定功能
- 缺乏高级功能如表格、图片插入

### 解决方案
扩展 RichTextEditor 组件，支持更多 Tiptap 扩展，并提供配置选项。

### 实施步骤

#### 阶段 1: 分析需求
1. **基础扩展**（立即添加）：
   - 标题 (Heading)
   - 引用 (Blockquote)
   - 代码块 (CodeBlock)
   - 水平线 (HorizontalRule)
   - 文本对齐 (TextAlign)

2. **高级扩展**（可选）：
   - 表格 (Table)
   - 图片插入 (Image)
   - 任务列表 (TaskList)
   - 颜色选择 (Color)

#### 阶段 2: 扩展组件 Props
1. 修改 `RichTextEditor.vue` 的 props：
   ```typescript
   const props = defineProps<{
     modelValue: string
     placeholder?: string
     readonly?: boolean
     hideToolbar?: boolean
     fontSize?: number
     fillHeight?: boolean
     // 新增配置选项
     enabledExtensions?: Array<'heading' | 'blockquote' | 'code' | 'hr' | 'textAlign' | 'table' | 'image' | 'taskList' | 'color'>
     headingLevels?: number[] // 允许的标题级别，如 [1, 2, 3]
     textAlignOptions?: Array<'left' | 'center' | 'right' | 'justify'>
   }>()
   ```

#### 阶段 3: 动态加载扩展
1. 创建扩展加载器函数：
   ```typescript
   function createExtensions(props: RichTextEditorProps) {
     const extensions: any[] = [
       StarterKit.configure({
         heading: props.enabledExtensions?.includes('heading') ? {
           levels: props.headingLevels || [1, 2, 3]
         } : false,
         codeBlock: props.enabledExtensions?.includes('code') ?? false,
         blockquote: props.enabledExtensions?.includes('blockquote') ?? false,
       }),
       Link.configure({ openOnClick: true, autolink: true }),
       Underline,
       Placeholder.configure({ placeholder: props.placeholder || '输入内容...' }),
     ]

     // 动态添加其他扩展
     if (props.enabledExtensions?.includes('textAlign')) {
       extensions.push(TextAlign.configure({
         types: ['heading', 'paragraph'],
         alignments: props.textAlignOptions || ['left', 'center', 'right'],
       }))
     }

     if (props.enabledExtensions?.includes('hr')) {
       extensions.push(HorizontalRule)
     }

     // 添加其他扩展...

     return extensions
   }
   ```

#### 阶段 4: 更新工具栏
1. 根据启用的扩展动态渲染工具栏按钮
2. 添加新的工具栏按钮组件
3. 保持向后兼容性（默认启用现有功能）

#### 阶段 5: 添加配置界面
1. 在 ConfigModal.vue 中添加富文本编辑器配置选项
2. 允许用户启用/禁用特定功能
3. 保存配置到 localStorage

### 文件变更
- **修改**: `src/components/RichTextEditor.vue` (添加新功能和配置)
- **修改**: `src/components/ConfigModal.vue` (添加编辑器配置)
- **修改**: `package.json` (可能需要添加新的 Tiptap 扩展包)
- **新建**: `src/utils/richTextExtensions.ts` (可选，用于管理扩展)

### 风险
1. **包大小**: 添加太多扩展可能增加包大小
2. **兼容性**: 新扩展可能与现有内容不兼容
3. **复杂性**: 配置选项过多可能增加使用复杂度

### 验证方法
1. 测试所有新扩展功能正常工作
2. 验证配置保存和加载正确
3. 测试向后兼容性（现有评论内容正常显示）

## 实施优先级与依赖关系

### 优先级排序
1. **改进 1 (Composable)**: 基础重构，为其他改进奠定基础
2. **改进 2 (策略模式)**: 架构优化，依赖改进1的部分成果
3. **改进 3 (富文本扩展)**: 功能增强，独立于前两者

### 依赖关系
```
改进1 (Composable)
    ↓
改进2 (策略模式) ← 依赖 useTierData
    ↓
可并行实施
    ↓
改进3 (富文本扩展) - 独立实施
```

### 实施时间估算
- **改进 1**: 2-3 天（包括测试）
- **改进 2**: 1-2 天
- **改进 3**: 2-3 天（取决于添加的扩展数量）

## 成功标准

### 技术标准
1. 所有现有功能保持正常工作
2. 无运行时错误或控制台警告
3. 性能无显著退化
4. 代码复杂度降低（App.vue 行数减少 50%+）
5. 测试覆盖率（手动）100%

### 业务标准
1. 用户无感知的架构改进
2. 功能无退化或丢失
3. 新功能（富文本扩展）提升用户体验

## 回滚计划

如果任何改进导致严重问题，可按以下步骤回滚：

1. **立即回滚**: 使用 git 回滚到实施前的状态
2. **分阶段回滚**: 如果问题仅影响特定功能，回滚相关文件
3. **热修复**: 针对具体问题发布修复补丁

每个改进建议独立实施，可独立回滚，降低风险。

---

*计划创建时间: 2026-02-15*
*预计开始时间: 2026-02-16*
*预计完成时间: 2026-02-25* (假设并行实施部分改进)