# TierMaker 撤销/重做功能设计方案

## 概述

本文档详细描述了TierMaker项目中撤销/重做功能的实现方案，包括架构设计、集成策略、以及代码质量评估（单一原则、解耦性分析）。

## 当前架构分析

### 核心数据管理
- **文件**：`src/composables/useTierStore.ts`
- **状态**：`tiers` 和 `unrankedTiers`（Vue ref数组）
- **持久化**：自动保存到IndexedDB（深度监听）
- **操作API**：提供对等级数据的所有核心操作

### 主要操作类型
1. **物品管理**：添加、删除、编辑物品
2. **排列操作**：移动物品（跨等级/同行重排）
3. **批量操作**：批量导入、清空所有
4. **行管理**：添加/删除行
5. **编辑操作**：更新评论、左侧内容

## 实现方案

### 方案一：命令模式 + 历史栈（推荐方案）

#### 核心架构
```typescript
// src/composables/useUndoManager.ts
interface Command {
  execute(): void
  undo(): void
  getDescription(): string  // UI显示用途
}

interface HistoryState {
  tiers: Tier[]
  unrankedTiers: Tier[]
  timestamp: number
  description: string
}
```

#### 撤销管理器实现
```typescript
const MAX_HISTORY_STACK_SIZE = 50

export function useUndoManager(tierStore: ReturnType<typeof useTierStore>) {
  const historyStack: HistoryState[] = []
  const redoStack: HistoryState[] = []
  const isRecording = ref(true)

  // 保存当前状态快照
  function saveCurrentState(description: string) {
    if (!isRecording.value) return

    const snapshot = {
      tiers: JSON.parse(JSON.stringify(tierStore.tiers.value)),
      unrankedTiers: JSON.parse(JSON.stringify(tierStore.unrankedTiers.value)),
      timestamp: Date.now(),
      description
    }

    historyStack.push(snapshot)
    redoStack.length = 0  // 清除重做栈

    // 限制历史栈大小
    if (historyStack.length > MAX_HISTORY_STACK_SIZE) {
      historyStack.shift()
    }
  }

  function undo() {
    if (historyStack.length < 2) return  // 需要至少一个当前状态和一个前状态

    const currentState = historyStack.pop()!  // 当前状态
    const prevState = historyStack[historyStack.length - 1]  // 要回退的状态

    redoStack.push(currentState)

    // 应用前一个状态
    isRecording.value = false
    try {
      tierStore.tiers.value = prevState.tiers
      tierStore.unrankedTiers.value = prevState.unrankedTiers
    } finally {
      isRecording.value = true
    }
  }

  function redo() {
    if (redoStack.length === 0) return

    const stateToRedo = redoStack.pop()!
    historyStack.push(stateToRedo)

    isRecording.value = false
    try {
      tierStore.tiers.value = stateToRedo.tiers
      tierStore.unrankedTiers.value = stateToRedo.unrankedTiers
    } finally {
      isRecording.value = true
    }
  }
}
```

### 方案二：差异快照（内存优化）
存储状态差异而非完整快照，适合大型数据集：
```typescript
interface Delta {
  operation: 'add' | 'delete' | 'move' | 'update'
  path: string[]  // 路径数组，如 ['tiers', 'S', 'rows', '0', 'items', '2']
  oldValue?: any
  newValue?: any
}
```

### 方案三：变更事件监听
自动监听数据变化并记录差异：
```typescript
watch([tiers, unrankedTiers], (newVal, oldVal) => {
  const diffs = compareStates(oldVal, newVal)
  if (diffs.length > 0) {
    undoManager.recordDiffs(diffs, '用户操作')
  }
}, { deep: true, flush: 'post' })
```

## 集成策略

### 阶段一：核心功能
1. **实现撤销管理器**：创建`useUndoManager` composable
2. **包装核心操作**：包装`useTierStore`中的关键方法
3. **添加快捷键**：Ctrl+Z撤销，Ctrl+Y/Ctrl+Shift+Z重做
4. **UI集成**：在标题栏添加撤销/重做按钮

### 阶段二：增强功能
1. **操作合并**：合并连续的同类型操作
2. **批量操作处理**：批量导入视为单个操作
3. **历史持久化**：保存历史到localStorage
4. **撤销预览**：悬停显示即将撤销的内容

### 阶段三：用户体验优化
1. **操作列表**：可视化历史操作列表
2. **智能分组**：根据时间间隔自动分组操作
3. **性能优化**：针对大数据集的优化

## 技术要点

### 1. 性能考虑
- **深度拷贝优化**：优先使用`structuredClone` API
- **节流保存**：频繁操作时合并快照（如连续拖拽）
- **内存限制**：历史栈大小限制为50步
- **懒加载**：仅当需要时解析差异

### 2. 数据一致性
- **Blob处理**：图片Blob需要特殊处理，避免重复创建ObjectURL
- **异步协调**：撤销/重做期间暂停自动保存监听
- **并发安全**：防止用户操作与撤销操作冲突
- **状态同步**：确保UI组件状态与撤销状态同步

### 3. 集成代码示例
```typescript
// App.vue集成
const undoManager = useUndoManager(tierStore)

// 包装现有操作（示例）
const originalMoveItem = tierStore.moveItem
tierStore.moveItem = function(data) {
  undoManager.saveCurrentState('移动物品')
  return originalMoveItem.call(this, data)
}

// 添加快捷键
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && !e.shiftKey && e.key === 'z') {
    e.preventDefault()
    undoManager.undo()
  }
  if ((e.ctrlKey && e.shiftKey && e.key === 'Z') || (e.ctrlKey && e.key === 'y')) {
    e.preventDefault()
    undoManager.redo()
  }
})
```

## 单一原则分析

### 当前架构评估
**优点**：
- `useTierStore`专注于数据管理，职责清晰
- 操作API分类明确，语义清晰
- 持久化逻辑集中在storage模块

**缺点**：
- 状态变化自动触发保存，缺乏操作边界
- 缺少操作历史记录能力

### 撤销管理器设计原则
1. **单一职责**：
   - `useUndoManager`只负责撤销/重做逻辑
   - `useTierStore`只负责数据管理
   - 两者通过清晰接口交互

2. **关注点分离**：
   - 历史管理独立于业务逻辑
   - 快照创建独立于状态应用
   - 键盘快捷键独立于核心逻辑

### 改进后的职责划分
1. **数据管理层**（`useTierStore`）：操作执行、状态维护
2. **历史管理层**（`useUndoManager`）：状态快照、撤销/重做
3. **UI集成层**（App.vue）：快捷键、按钮、状态显示
4. **持久化层**（storage.ts）：数据保存、恢复

## 解耦性分析

### 当前耦合度
**高耦合点**：
1. 组件直接调用store方法，缺少中间层
2. 自动保存与状态变化紧耦合
3. UI状态与业务状态混用

### 设计方案解耦策略
1. **接口抽象**：
   ```typescript
   interface UndoableOperation {
     execute(): void
     undo(): void
   }

   // 通过接口而非直接调用解耦
   ```

2. **事件总线**：
   ```typescript
   // 操作完成时发布事件
   const operationCompleted = createEventBus()
   operationCompleted.on(({operation, result}) => {
     undoManager.recordOperation(operation, result)
   })
   ```

3. **中间件模式**：
   ```typescript
   function createStoreWithUndo(originalStore) {
     return new Proxy(originalStore, {
       get(target, prop) {
         if (typeof target[prop] === 'function') {
           return function(...args) {
             undoManager.beforeOperation(prop, args)
             const result = target[prop].apply(this, args)
             undoManager.afterOperation(prop, args, result)
             return result
           }
         }
         return target[prop]
       }
     })
   }
   ```

4. **依赖注入**：
   ```typescript
   // 通过参数注入而非硬编码
   export function useTierStore(undoManager?: UndoManager) {
     // store实现
   }
   ```

### 解耦等级评估
| 模块 | 耦合度 | 改进建议 |
|------|--------|----------|
| useTierStore ↔ UI组件 | 中等 | 引入操作中间件 |
| useTierStore ↔ storage.ts | 中等 | 抽象持久化接口 |
| UndoManager ↔ useTierStore | 低 | 通过代理模式集成 |
| 快捷键 ↔ UndoManager | 低 | 事件驱动集成 |

### 推荐集成模式
```typescript
// 推荐模式：代理包装器
const tierStore = useTierStore()
const undoManager = useUndoManager()

// 创建带撤销功能的store
const undoableStore = createUndoableStore(tierStore, undoManager)

// UI组件使用undoableStore而非原始store
// 原始store仍可用于不需要撤销的场景
```

## 风险评估与缓解

### 技术风险
1. **性能问题**：深度克隆大型数据集
   - **缓解**：增量快照、懒加载、大小限制

2. **内存泄漏**：历史栈无限增长
   - **缓解**：固定大小、LRU淘汰策略

3. **状态不一致**：撤销期间用户操作
   - **缓解**：操作锁定、队列处理

### 用户体验风险
1. **撤销粒度**：过于细化或过于粗放
   - **缓解**：智能合并、可配置阈值

2. **反馈缺失**：用户不清楚撤销了什么
   - **缓解**：操作提示、可视化历史

### 兼容性风险
1. **现有数据**：历史数据无撤销信息
   - **缓解**：新功能不影响旧数据

2. **第三方集成**：与现有导入/导出功能
   - **缓解**：撤销管理器不影响数据格式

## 实施计划

### 阶段一（1-2周）：基础功能
1. 实现`useUndoManager`核心逻辑
2. 包装5个关键操作（添加、删除、移动、更新、重排序）
3. 添加快捷键支持
4. 基本UI按钮集成

### 阶段二（1周）：增强功能
1. 操作合并逻辑
2. 批量操作处理
3. 历史持久化
4. 性能优化

### 阶段三（1周）：优化与测试
1. 用户体验优化
2. 全面测试覆盖
3. 性能基准测试
4. 文档完善

## 结论

推荐采用**方案一（命令模式 + 历史栈）**，原因如下：

1. **架构兼容性**：与现有Vue composition API设计模式一致
2. **实现复杂度**：中等，技术风险可控
3. **用户体验**：提供完整的撤销/重做功能
4. **可维护性**：遵循单一原则，解耦程度良好
5. **扩展性**：支持未来功能增强

通过精心设计的接口和适度的解耦，可以在保持代码质量的同时实现强大的撤销/重做功能，显著提升TierMaker的用户体验。