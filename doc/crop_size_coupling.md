# 裁剪与尺寸设置：逻辑梳理、耦合性、DIP 审查、泄露点与变更影响

本文整理当前裁剪逻辑与尺寸设置的实现路径，并分析耦合性、依赖倒置问题、泄露点，以及尺寸变更的影响模拟。

---

## 1) 当前裁剪逻辑（页面显示）
**主要文件：** `src/components/TierRow.vue`

### 1.1 显示方式：CSS 裁剪
- **页面显示不再使用 canvas**。
- 容器 `.item-image-container` 为 `position: relative` + `overflow: hidden`。
- `getImageStyle(item)` 根据 `cropPosition` 和当前尺寸计算内联样式：
  - **精确裁剪** `{sourceX, sourceY, sourceWidth, sourceHeight}`：
    - `scale = containerWidth / sourceWidth`
    - `finalWidth = naturalWidth * scale`
    - `finalHeight = naturalHeight * scale`
    - `left = -sourceX * scale`, `top = -sourceY * scale`
    - 图片用 `position: absolute` 放入容器
  - **预设裁剪**（如 `center top`）：`object-fit: cover` + `object-position`
  - **auto**：在加载时按宽高比选择 `center center` 或 `center top`

### 1.2 自然尺寸采集
- `handleImageLoad()` 把 `naturalWidth/Height` 写回到 item（运行时）。
- `auto` 裁剪依赖 `naturalRatio` 与 `targetRatio` 的对比。

### 1.3 运行时特性
- `naturalWidth/Height` 不持久化，刷新后需重新加载获取。
- 每次渲染会重新执行 `getImageStyle()`。

---

## 2) 裁剪逻辑（编辑预览）
**主要文件：** `src/components/EditItemModal.vue`

- 预览图为 `object-fit: contain`，并计算实际显示区域。
- 白框代表最终裁剪区域；拖动白框会生成自定义裁剪对象。
- `updatePreviewCrop()` 依赖：
  - `getSize('image-width')`
  - `getSize('image-height')`
  - `getSize('image-aspect-ratio')`
- 自定义裁剪存为 `{sourceX, sourceY, sourceWidth, sourceHeight}`（原图像素坐标）。

---

## 3) 导出逻辑（canvas 裁剪）
**主要文件：** `src/App.vue`, `src/utils/exportUtils.ts`

- 导出流程：克隆 DOM -> 处理图片 -> html2canvas。
- `processExportImages()` 会：
  - 替换到 CORS 代理（必要时）
  - 等图加载完成后执行 `cropImageWithCanvas(img, scale)`
  - 用 dataURL 替换 `<img src>`，设置尺寸
  - 清理 CSS 裁剪残留（absolute/left/top）
- 导出使用 **canvas 裁剪**，保证 html2canvas 结果稳定。
- 导出使用 `getSize('image-width')` / `getSize('image-height')`。

---

## 4) 尺寸设置逻辑
**主要文件：** `src/utils/configManager.ts`, `src/components/ConfigModal.vue`, `config.yaml`

### 4.1 来源
- 默认配置在 `config.yaml`。
- 用户覆盖写入 `localStorage`（`tier-maker-local-config-yaml`）。

### 4.2 更新链路
- `ConfigModal` 调用 `updateSizes()`。
- `updateSizes()` -> `saveLocalConfig()` -> `refreshConfig()` -> `initConfigStyles()`。
- `initConfigStyles()` 注入 CSS 变量 `--size-*`。

### 4.3 派生尺寸
- `image-height = image-width / image-aspect-ratio` 自动计算。
- `item-height` 与 `item-height-hide-name` 会随之调整。

---

## 5) 耦合性分析

### 5.1 紧耦合点
- 裁剪计算在多个模块内直接调用 `getSize()`：
  - `TierRow.vue`（显示裁剪）
  - `EditItemModal.vue`（预览裁剪）
  - `exportUtils.ts`（导出裁剪）

### 5.2 影响
- 改变宽高比/尺寸会同时影响：
  - CSS 布局
  - 裁剪几何
  - 导出结果
  - 预览遮罩

---

## 6) DIP（依赖倒置原则）审查

### 6.1 现状
- 高层逻辑（裁剪、导出、预览）**直接依赖** `configManager.getSize()`。
- 这属于“硬编码依赖”，缺少抽象层。

### 6.2 问题
- 难以替换尺寸策略（例如响应式、分组尺寸、按条目尺寸）。
- 测试困难（无法注入不同尺寸源）。

### 6.3 建议
- 引入 `ImageSizingService` 抽象接口：
  - `getTargetSize()` -> `{width, height, ratio}`
  - `onSizeChange(cb)` -> 订阅变更
- UI 模块只依赖接口，不直接依赖 `configManager`。

---

## 7) 泄露点检测

### 7.1 裁剪对象隐含旧比例
- `{sourceX, sourceY, sourceWidth, sourceHeight}` 是在旧比例下计算的。
- 改比例后对象本身不更新，语义“漂移”。

### 7.2 显示与导出路径不同
- 显示为 CSS 裁剪，导出为 canvas 裁剪。
- 如果尺寸/比例不一致，结果会分歧。

### 7.3 naturalWidth/Height 是运行时状态
- 依赖它做 CSS 裁剪，但该值不持久化。
- 需要等待图片加载才能准确裁剪。

---

## 8) 尺寸变更影响模拟（0.75 -> 1.0）

### 8.1 输入变化
- 原：`image-width = 100`, `image-aspect-ratio = 0.75`, `image-height ≈ 133`
- 新：`image-width = 100`, `image-aspect-ratio = 1.0`, `image-height = 100`

### 8.2 立即变化
- CSS 变量更新，容器变方形。

### 8.3 页面显示影响
- **自定义裁剪对象**：
  - `scale` 与 `left/top` 重新计算
  - 可能出现“裁剪位移、底部被切”
- **预设裁剪**：比例变化但位置逻辑仍可用，偏差较小。

### 8.4 编辑预览影响
- Modal 未重开时，遮罩仍基于旧裁剪对象。
- 关闭再打开才会刷新遮罩比例。

### 8.5 导出影响
- 导出使用新尺寸，但旧裁剪对象仍是旧比例。
- 导出与页面展示容易不一致。

---

## 9) 风险总结
- **高风险**：比例变化后，自定义裁剪对象语义失效。
- **中风险**：显示与导出分离导致结果差异。
- **低风险**：natural size 未加载导致短暂隐藏。

---

## 10) 设计级修复方向

### A) 尺寸变更时重算裁剪
- 保留裁剪中心点 `(cx, cy)`，重算 `sourceWidth/Height`。

### B) 给裁剪对象记录尺寸元信息
- 例如 `cropMeta: {ratio, width, height}`。
- 比例不匹配时可选择“重算”或“回退 auto”。

### C) 抽象尺寸服务（DIP）
- 建立统一尺寸接口，裁剪/导出/预览只依赖接口。

---

## 11) 快速测试清单
- 改比例 0.75 -> 1.0，不重开编辑弹窗
- 立即导出图片
- 对比显示与导出差异
- 重新打开编辑弹窗，确认遮罩尺寸变化

