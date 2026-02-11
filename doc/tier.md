# Tier Documentation

本文档说明了 TierMaker 项目中与 Tier（层级/等级）相关的数据结构、核心函数及各成员的作用。

## 1. 数据类型 (Data Types)

主要定义在 `src/types.ts` 中。

### 1.1 `Tier` (等级)

表示一个完整的评分等级（如 S 级、A 级）。

```typescript
export interface Tier {
  id: string      // 等级唯一标识 (例如: "tier-s", "tier-a")
  rows: TierRow[] // 该等级包含的行 (通常为一行，但支持多行扩展)
}
```

### 1.2 `TierRow` (行)

表示等级中的一行，包含具体的作品/角色项。

```typescript
export interface TierRow {
  id: string          // 行唯一标识
  items: AnimeItem[]  // 该行包含的作品/角色列表
}
```

### 1.3 `TierConfig` (等级配置)

定义等级的元数据（标题、颜色等），用于侧边栏配置和显示。

```typescript
export interface TierConfig {
  id: string       // 对应 Tier 的 id
  label: string    // 显示的标签文本 (如 "S", "老婆", "T0")
  color: string    // 背景颜色 (Hex 格式)
  order: number    // 排序权重 (数值越小越靠前)
  fontSize?: number // 标签字体大小 (默认 32px)
}
```

### 1.4 `AnimeItem` (作品/角色项)

表示 Tier 表中的具体元素。

```typescript
export interface AnimeItem {
  id: number | string // 唯一标识 (Bangumi/VNDB ID 或 UUID)
  name: string        // 原名
  name_cn?: string    // 中文名 (可选)
  image: string | Blob // 图片源 (URL 或 Blob 对象)
  
  // 元数据
  date?: string       // 发行日期
  score?: number      // 评分
  
  // 自定义/原始数据
  url?: string        // 自定义链接
  originalUrl?: string // 原始链接
  originalImage?: string | Blob // 原始封面图 (用于恢复)
  
  // 裁剪与显示
  cropPosition?: CropPosition // 裁剪位置 (默认 'auto')
  naturalWidth?: number       // 原始宽度
  naturalHeight?: number      // 原始高度
  
  // 运行时/内部使用
  _blob?: Blob        // 运行时缓存的 Blob 数据
  uuid?: string       // Vue 列表渲染用的唯一 key
}
```

## 2. 核心函数 (Important Functions)

### 2.1 数据存储 (`src/utils/storage.ts`)

* **`saveTierData(tiers: Tier[]): Promise<void>`**
  * **作用**: 将 Tier 数据保存到 IndexedDB。
  * **逻辑**: 会处理 `Blob` 对象，确保持久化存储图片数据，并自动为缺少 `uuid` 的项生成 UUID。

* **`loadTierData(): Promise<Tier[]>`**
  * **作用**: 从 IndexedDB 加载 Tier 数据。
  * **逻辑**: 包含从 LocalStorage 迁移数据的逻辑，以及自动修复 Base64 字符串回转 Blob 的机制。如果无数据，返回默认配置。

* **`saveTierConfigs(configs: TierConfig[]): void`**
  * **作用**: 保存等级配置（颜色、标签）到 LocalStorage。

* **`handleLanguageChange(newLocale: 'zh' | 'en'): void`**
  * **作用**: 切换语言时更新默认 Tier 标签。
  * **逻辑**: 如果当前标签是默认的（如 English 的 'S'），会切换为中文对应的默认标签（'夯'）；如果是用户自定义标签则保持不变。

### 2.2 导入/导出 (`src/utils/storage.ts` & `src/utils/exportUtils.ts`)

* **`exportAllData(): Promise<ExportData>`**
  * **作用**: 导出所有数据（包括图片）为 JSON 对象。
  * **逻辑**: 将所有 `Blob` 图片转换为 Base64 字符串以便序列化。

* **`importAllData(data: ExportData): Promise<{ success: boolean; error?: string }>`**
  * **作用**: 导入 JSON 数据。
  * **逻辑**: 将 Base64 字符串还原为 `Blob` 对象并存入 IndexedDB。

* **`processExportImages(...)`** (`src/utils/exportUtils.ts`)
  * **作用**: 在生成图片/PDF时处理图片。
  * **逻辑**: 处理 CORS 代理、Smart Crop (智能裁剪) 以及将 Blob URL 转换为实际可视的图片。

### 2.3 配置管理 (`src/utils/configManager.ts`)

* **`getDefaultTiers(locale: string): TierConfig[]`**
  * **作用**: 获取指定语言环境下的默认 Tier 配置。

## 3. 成员与组件作用 (Member Roles)

* **`TierList.vue`**: 核心组件，负责渲染整个 Tier 列表。它持有 `tiers` 状态，并处理拖拽排序（Drag and Drop）逻辑。
* **`TierRow.vue`**: 渲染单个 Tier 行。它展示左侧的 Header（颜色/标签）和右侧的内容区域。
* **`EditItemModal.vue`**: 编辑单个 Item 的模态框，用于修改裁剪位置、名称等。
* **`ConfigModal.vue`**: 全局设置和 Tier 样式配置（添加/删除 Tier、修改颜色）。

---

> **注意**: Blob 数据在 IndexedDB 中存储，避免了 LocalStorage 的容量限制（5MB）。在运行时，`AnimeItem.image` 可能是 `blob:` URL（用于显示）或 `Blob` 对象（用于存储）。

## 4. 变更影响模拟 (Change Impact Simulation)

本节模拟了在修改 Tier 配置（添加、删除、排序）时，对现有 Item 的影响。

**核心机制**: TierMaker 目前的实现逻辑中，**Item 是绑定在“行号” (Row Index) 上的，而不是绑定在具体的 Tier Label 上**。这就好比 Item 放在固定的“架子”层上，而 Tier Config 只是贴在架子边上的“标签”。

### 4.1 添加 Tier (Adding a Tier)

* **操作**: 点击“添加等级”按钮。
* **行为**:
    1. 在配置列表末尾增加一个新的 Tier Config。
    2. 系统在 Item 存储的末尾增加一个新的空行。
* **结果**:
  * 现有 Item **完全不受影响**。
  * 底部新增一行空列表。

### 4.2 删除 Tier (Deleting a Tier)

* **操作**: 删除任意位置的 Tier (例如删除最上面的 'S' 级)。
* **行为**:
    1. 该 Tier Config 被移除。
    2. 下方所有的 Tier Config 向上移动填补空缺（Order - 1）。
    3. 系统**重新将标签贴到对应的行号上** (Label 0 -> Row 0, Label 1 -> Row 1)。
    4. **关键**: 因为总 Config 数减少了 1，系统会丢弃**最后一行 (Row N)** 的数据。
* **结果**:
  * **位置错位**: 删除位置处的 Item **不会**被删除，而是被下方的标签“继承”。
    * *例如*: 原来 S 级的 Item，现在会显示在 A 级（原本在第二位，现在上移到第一位）的标签下。
  * **底部丢失 (Bottom-Drop)**: 原本在**最底层**的 Item 会被**永久删除**。

### 4.3 交换 Tier (Swapping Tiers)

* **操作**: 通过上移/下移按钮交换两个 Tier 的位置（例如交换 'S' 和 'A'）。
* **行为**:
    1. 两个 Tier Config 的 `order` 互换。
    2. 系统根据新的 `order` 重新渲染列表。
    3. **关键**: 系统再次根据行号 (Row 0, Row 1) 匹配新标签，但**不移动 Item**。
* **结果**:
  * **标签互换，Item 不动**:
    * Row 0 (原 S 级位置): 现在显示 'A' 级标签，但内容仍然是原来的 S 级 Item。
    * Row 1 (原 A 级位置): 现在显示 'S' 级标签，但内容仍然是原来的 A 级 Item。
  * *看起来就像是把 Item 从 S 移到了 A，把 A 移到了 S，但实际上是标签换了，Item 原地不动。*

### 总结建议

* **安全操作**: 改名 (Rename)、改色 (Change Color)、添加 (Add)。
* **危险操作**: 删除 (Delete)、排序 (Reorder)。
  * 如果需要重排等级（例如把 S 放到底部），**必须手动移动 Item**，而不能只移动 Config。
  * 如果需要删除等级且保留 Item，**必须先将 Item 移出该行**，或者移出最底行（如果是删除操作导致的底部丢失）。
