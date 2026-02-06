# 裁剪系统文档

本文整理裁剪系统的数据模型、渲染逻辑、尺寸设置、耦合性分析与设计改进方向。

---

## 1) 数据模型（CropPosition）

**来源：** `src/types.ts`

`CropPosition` 可能为：

- 预设字符串：`auto` / `center top` / `center center` / `center bottom` / `left center` / `right center`
- 精确裁剪对象：`{ sourceX, sourceY, sourceWidth, sourceHeight }`

精确裁剪对象的含义：

- `sourceX`, `sourceY`：原图像素坐标中的裁剪左上角
- `sourceWidth`, `sourceHeight`：原图像素裁剪宽高

**补充：**

- `AnimeItem` 增加了 `uuid`（持久化），用于稳定 key，避免重排导致 DOM 重建。
- `naturalWidth/Height` 为运行时值，刷新后需重新加载获取，不持久化。

---

## 2) 页面显示（TierRow）

**来源：** `src/components/TierRow.vue`

### 2.1 显示方式：CSS 裁剪（无 canvas）

- 容器 `.item-image-container`：`position: relative` + `overflow: hidden`
- 图片样式由 `getImageStyle()` 生成

### 2.2 精确裁剪计算

1. 若 `naturalWidth/Height` 未就绪，则临时 `visibility: hidden`
2. 对裁剪对象执行：
   - **normalizeCropResolution**（修正保存分辨率与当前加载分辨率差异）
   - **adaptCropToRatio**（适配当前宽高比设置）
3. 计算 CSS 裁剪样式：
   - `scale = containerWidth / sourceWidth`
   - `finalWidth = naturalWidth * scale`
   - `finalHeight = naturalHeight * scale`
   - `left = -sourceX * scale`
   - `top = -sourceY * scale`
   - 图片用 `position: absolute` 放入容器

### 2.3 预设裁剪 / auto

- 预设值直接使用 `object-fit: cover` + `object-position`
- `auto` 在 `@load` 时通过 `naturalRatio` 与 `targetRatio` 对比判断：
  - 宽图 -> `center center`
  - 长图 -> `center top`

---

## 3) 编辑预览（EditItemModal）

**来源：** `src/components/EditItemModal.vue`

### 3.1 预览布局

- 原图使用 `object-fit: contain` 适配预览容器
- 白色遮罩框代表最终裁剪区域；拖动白框会生成自定义裁剪对象

### 3.2 裁剪框计算逻辑

在 `updatePreviewCrop()` 中：

1. 获取配置尺寸：`image-width` / `image-height` / `image-aspect-ratio`
2. 若存在自定义裁剪对象：
   - **normalizeCropResolution**：修正"保存时分辨率"与"当前加载分辨率"不一致的问题
   - **adaptCropToRatio**：当设置的宽高比发生变化时，以裁剪中心为基准扩展宽/高，使其适配新比例
3. 计算遮罩框在屏幕坐标中的位置，使用 DPR 像素对齐
4. 如发现裁剪对象需要适配，会自动更新 `cropPosition`（避免白框和最终效果不一致）

### 3.3 保存

- 保存时将 `cropPosition` 写回 `AnimeItem`（使用 `toRaw`，避免代理对象）
- 自定义裁剪存为 `{sourceX, sourceY, sourceWidth, sourceHeight}`（原图像素坐标）

---

## 4) 导出裁剪（canvas）

**来源：** `src/App.vue`, `src/utils/exportUtils.ts`

### 4.1 导出流程

- 导出流程：克隆 DOM -> 处理图片 -> html2canvas
- `processExportImages()` 会：
  - 替换到 CORS 代理（必要时）
  - 等图加载完成后执行 `cropImageWithCanvas(img, scale)`
  - 用 dataURL 替换 `<img src>`，设置尺寸
  - 清理 CSS 裁剪残留（absolute/left/top）

### 4.2 精确裁剪（自定义裁剪对象）

- 导出时同样执行：
  - **normalizeCropResolution**
  - **adaptCropToRatio**
- 模拟 CSS 裁剪逻辑绘制到 canvas：
  - `renderScale = containerWidth / sourceWidth`
  - `destX = -sourceX * renderScale`
  - `destY = -sourceY * renderScale`
  - `ctx.drawImage(img, destX, destY, destWidth, destHeight)`

### 4.3 预设裁剪

- 若非自定义裁剪对象：使用传统 3:4 裁剪规则（根据宽高比决定 top/center）

### 4.4 CORS 代理

- 页面显示不需要代理（CSS 裁剪）
- 导出需要 canvas，因此必须通过代理处理跨域图片
- 导出逻辑会优先保留 `blob:`（本地文件）以获得高清

---

## 5) 分辨率/比例适配工具

**来源：** `src/utils/cropUtils.ts`

### 5.1 normalizeCropResolution

- 将裁剪对象从"保存时分辨率"映射到"当前加载分辨率"
- 解决：高分辨率保存 + 低分辨率预览导致的偏移

### 5.2 adaptCropToRatio

- 将裁剪矩形扩展到新的目标比例（保持裁剪中心）
- 用于：尺寸设置变更（如 0.75 -> 1.0）时，裁剪区域自动适配

---

## 6) 尺寸设置逻辑

**来源：** `src/utils/configManager.ts`, `src/components/ConfigModal.vue`, `config.yaml`

### 6.1 配置来源

- 默认配置在 `config.yaml`
- 用户覆盖写入 `localStorage`（`tier-maker-local-config-yaml`）

### 6.2 更新链路

1. `ConfigModal` 调用 `updateSizes()`
2. `updateSizes()` -> `saveLocalConfig()` -> `refreshConfig()` -> `initConfigStyles()`
3. `initConfigStyles()` 注入 CSS 变量 `--size-*`

### 6.3 派生尺寸

- `image-height = image-width / image-aspect-ratio` 自动计算
- `item-height` 与 `item-height-hide-name` 会随之调整

---

## 7) 耦合性分析

### 7.1 紧耦合点

裁剪计算在多个模块内直接调用 `getSize()`：

- `TierRow.vue`（显示裁剪）
- `EditItemModal.vue`（预览裁剪）
- `exportUtils.ts`（导出裁剪）

### 7.2 影响

改变宽高比/尺寸会同时影响：

- CSS 布局
- 裁剪几何
- 导出结果
- 预览遮罩

---

## 8) DIP（依赖倒置原则）审查

### 8.1 现状

- 高层逻辑（裁剪、导出、预览）**直接依赖** `configManager.getSize()`
- 这属于"硬编码依赖"，缺少抽象层

### 8.2 问题

- 难以替换尺寸策略（例如响应式、分组尺寸、按条目尺寸）
- 测试困难（无法注入不同尺寸源）

### 8.3 建议

引入 `ImageSizingService` 抽象接口：

- `getTargetSize()` -> `{width, height, ratio}`
- `onSizeChange(cb)` -> 订阅变更
- UI 模块只依赖接口，不直接依赖 `configManager`

---

## 9) 泄露点检测

### 9.1 裁剪对象隐含旧比例

- `{sourceX, sourceY, sourceWidth, sourceHeight}` 是在旧比例下计算的
- 改比例后对象本身不更新，语义"漂移"

### 9.2 显示与导出路径不同

- 显示为 CSS 裁剪，导出为 canvas 裁剪
- 如果尺寸/比例不一致，结果会分歧

### 9.3 naturalWidth/Height 是运行时状态

- 依赖它做 CSS 裁剪，但该值不持久化
- 需要等待图片加载才能准确裁剪

---

## 10) 尺寸变更影响模拟（0.75 -> 1.0）

### 10.1 输入变化

- 原：`image-width = 100`, `image-aspect-ratio = 0.75`, `image-height ≈ 133`
- 新：`image-width = 100`, `image-aspect-ratio = 1.0`, `image-height = 100`

### 10.2 立即变化

- CSS 变量更新，容器变方形

### 10.3 页面显示影响

- **自定义裁剪对象**：`scale` 与 `left/top` 重新计算，可能出现"裁剪位移、底部被切"
- **预设裁剪**：比例变化但位置逻辑仍可用，偏差较小

### 10.4 编辑预览影响

- Modal 未重开时，遮罩仍基于旧裁剪对象
- 关闭再打开才会刷新遮罩比例

### 10.5 导出影响

- 导出使用新尺寸，但旧裁剪对象仍是旧比例
- 导出与页面展示容易不一致

---

## 11) 风险总结

| 风险等级 | 说明 |
|---------|------|
| **高** | 比例变化后，自定义裁剪对象语义失效 |
| **中** | 显示与导出分离导致结果差异 |
| **低** | natural size 未加载导致短暂隐藏 |

---

## 12) 设计级修复方向

### A) 尺寸变更时重算裁剪

- 保留裁剪中心点 `(cx, cy)`，重算 `sourceWidth/Height`

### B) 给裁剪对象记录尺寸元信息

- 例如 `cropMeta: {ratio, width, height}`
- 比例不匹配时可选择"重算"或"回退 auto"

### C) 抽象尺寸服务（DIP）

- 建立统一尺寸接口，裁剪/导出/预览只依赖接口

---

## 13) 关键变化汇总（与旧逻辑相比）

- 页面显示完全 CSS 化（不再 canvas 裁剪）
- 引入 `normalizeCropResolution` 解决高/低分辨率差异
- 引入 `adaptCropToRatio` 自动适配比例变化
- 编辑弹窗会自动修正裁剪对象并更新白框
- 导出裁剪对自定义对象采用"模拟 CSS 行为"的绘制策略

---

## 14) 快速测试清单

- [ ] 改比例 0.75 -> 1.0，不重开编辑弹窗
- [ ] 立即导出图片
- [ ] 对比显示与导出差异
- [ ] 重新打开编辑弹窗，确认遮罩尺寸变化

---

## 15) 持久化行为

- `cropPosition` 持久化到 IndexedDB
- `naturalWidth/Height` 为运行时值，刷新后重新获取
- `uuid` 自动补齐，用于稳定 key，避免重排导致 DOM 重建和裁剪重算
