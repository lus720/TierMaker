# 尺寸配置文档：图片/条目宽高与宽高比

本文整理图片与条目尺寸参数的来源、依赖关系、影响范围，并提供 DIP/SRP 审查与变更影响模拟。

---

## 1) 关键尺寸参数（当前配置）
来源：`config.yaml`

**图片相关：**
- `image-width`
- `image-height`
- `image-aspect-ratio`

**条目相关：**
- `item-width`
- `item-height`
- `item-height-hide-name`
- `item-name-height`

默认关系（注释约定）：
- `item-height = image-height + item-name-height`
- `item-height-hide-name = image-height`

---

## 2) 运行时来源与计算逻辑

### 2.1 来源
- 默认值：`config.yaml`
- 用户覆盖：`localStorage`（通过 `ConfigModal` + `configManager` 保存）

### 2.2 计算入口
`src/utils/configManager.ts` 在解析配置时做自动修正：
- 如果设置了 `image-aspect-ratio` 与 `image-width`：
  - `image-height = image-width / image-aspect-ratio`
  - 并根据高度变化量 `delta` 修正：
    - `item-height += delta`
    - `item-height-hide-name += delta`

**注意：**
- 当前逻辑不会自动更新 `item-width`。

---

## 3) 依赖关系可视化（简图）

```
image-aspect-ratio ─┐
                    ├──> image-height ──┐
image-width ────────┘                  │
                                       ├──> item-height
item-name-height ──────────────────────┘

image-height ─────────────────────────────> item-height-hide-name

item-width (独立参数) ────────────────> 条目宽度
image-width (独立参数) ───────────────> 图片宽度
```

依赖说明：
- `image-height` 是由 `image-width` 和 `image-aspect-ratio` 派生。
- `item-height` 与 `item-height-hide-name` 由 `image-height` 派生。
- `item-width` 当前**不**依赖 `image-width`，导致宽度不联动。

---

## 4) 影响范围（使用位置）

### 4.1 显示层（TierRow）
- `.tier-item` 使用 `item-width` / `item-height`
- `.item-image-container` 使用 `image-width` / `image-height`

### 4.2 拖拽计算（dragManager）
来源：`src/utils/dragManager.ts`

拖拽位移与落点计算依赖以下尺寸参数：
- `item-width`
- `item-height`
- `item-height-hide-name`
- `row-gap`
- `row-padding`
- `container-padding-top`
- `container-padding-bottom`

这些值来自 `configManager.getConfig().sizes`，不会解析 YAML 表达式。

### 4.2 编辑预览（EditItemModal）
- 裁剪遮罩/计算依赖 `image-width` / `image-height` / `image-aspect-ratio`

### 4.3 导出
- `exportUtils` 和 `cropImageWithCanvas` 使用 `image-width` / `image-height`

### 4.4 拖拽
- `dragManager` 使用 `item-width` / `item-height` 计算位移

---

## 5) 变更影响模拟

### 情况 A：只改 `image-width = 200`
- `image-height` 自动变为 `200 / 0.75 ≈ 267`
- `item-height` 与 `item-height-hide-name` 会随 `delta` 增加
- **item-width 仍为 100** → 条目宽度不变
- 结果：图片在卡片中被横向限制，视觉不一致

### 情况 B：改 `image-width = 200` 且 `image-aspect-ratio = 1`
- `image-height = 200`
- `item-height` / `item-height-hide-name` 变为 200
- `item-width` 仍为 100
- 结果：条目高度变大但宽度未变 → 版式失衡

---

## 6) DIP（依赖倒置原则）审查

### 6.1 现状
- `TierRow / EditItemModal / exportUtils / dragManager` 直接依赖 `configManager.getSize()`。
- 缺乏统一的“尺寸服务接口”。

### 6.2 风险
- 高层逻辑与具体配置来源强耦合。
- 难以注入不同尺寸策略（例如按条目类型或响应式尺寸）。

### 6.3 建议
引入尺寸服务抽象层：
- `ImageSizingService`：`getImageSize() -> {width, height, ratio}`
- `ItemSizingService`：`getItemSize() -> {width, height, hideNameHeight}`
- 统一订阅尺寸变更 `onSizeChange()`

---

## 7) SRP（单一职责原则）与泄露检测

### 7.1 SRP 问题点
- `configManager` 既负责 **配置解析**，又负责 **尺寸推导（image-height / item-height）**。
- `TierRow` 同时负责 **裁剪渲染** 与 **尺寸适配**。

### 7.2 泄露点
- `item-height` 与 `item-height-hide-name` 是通过 `image-height` 的变化间接更新的，
  但业务上它们属于“条目布局”的概念。
- 配置里 `item-width` 与 `image-width` 表面独立，但用户理解上往往预期联动，
  造成“隐式依赖”泄露。

---

## 8) 改进建议（设计层）

1. **建立尺寸派生规则表**
   - 明确：条目宽度是否跟随图片宽度。

2. **分离尺寸策略**
   - 把尺寸推导逻辑从 `configManager` 抽离到 `sizingPolicy`。

3. **统一尺寸接口**
   - UI 和导出依赖接口，而不是直接读 `getSize()`。

---

## 9) 快速检查清单
- 改 `image-width` 后，`item-width` 是否同步？
- 改 `image-aspect-ratio` 后，`item-height` 是否与 `image-height` 一致？
- 拖拽位移是否与实际卡片尺寸一致？

---

## 10) 尺寸修改“延迟生效”原因分析
现象：把宽度从 100 改到 200，页面不立刻更新，刷新后才生效。

**主要原因：**
1. **配置不是响应式**  
   `getSize()` 读取的是 `configManager` 的缓存对象，不具备响应式能力。  
   即使 `updateSizes()` 刷新了 CSS 变量，依赖 `getSize()` 的 JS 计算（如 `getImageStyle()`）不会自动触发重新渲染。

2. **JS 内联样式依赖 getSize**  
   `TierRow` 中的图片裁剪尺寸是通过 JS 直接写入 inline style：  
   ```ts
   const containerWidth = getSize('image-width')
   const containerHeight = getSize('image-height')
   ```  
   如果没有触发 Vue 重新渲染，这些数值不会重新计算。

3. **修改 config.yaml 不会热更新运行时缓存**  
   `configYaml` 在构建时被打包成静态字符串，运行时不会自动读取磁盘新内容。  
   除非刷新页面，否则旧配置仍生效。

---

## 11) 解决措施（推荐顺序）
1. **建立配置变更信号（推荐）**  
   - 在 `configManager` 中加入 `version` 或事件系统（如 `onConfigChange`）。  
   - 组件订阅变更后执行 `forceUpdate` 或重新计算样式。  

2. **减少 JS 依赖，改用 CSS 变量**  
   - 将 `getImageStyle()` 中的宽高改为 `var(--size-image-width)` / `var(--size-image-height)`，  
     避免 JS 计算造成的“更新滞后”。  

3. **显式触发重新渲染**  
   - 在设置保存后，触发一次全局刷新（如 `configModalKey++`）  
   - 或在相关组件中 watch 一个“配置版本号”并触发 `nextTick` 重新计算。

4. **修改 config.yaml 后强制刷新页面**  
   - 这是最简单但体验最差的方式，仅适合开发环境。
