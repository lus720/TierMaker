# 裁剪渲染逻辑（最新）

本文总结当前裁剪数据、编辑预览、页面显示与导出裁剪的实现方式，并标注关键变化点。

---

## 1) 数据模型（CropPosition）
来源：`src/types.ts`

`CropPosition` 可能为：
- 预设字符串：`auto` / `center top` / `center center` / `center bottom` / `left center` / `right center`
- 精确裁剪对象：`{ sourceX, sourceY, sourceWidth, sourceHeight }`

精确裁剪对象的含义：
- `sourceX`, `sourceY`：原图像素坐标中的裁剪左上角
- `sourceWidth`, `sourceHeight`：原图像素裁剪宽高

**补充：**
- `AnimeItem` 增加了 `uuid`（持久化），用于稳定 key，避免重排导致 DOM 重建。

---

## 2) 编辑预览（EditItemModal）
来源：`src/components/EditItemModal.vue`

### 2.1 预览布局
- 原图使用 `object-fit: contain` 适配预览容器。
- 白色遮罩框代表最终裁剪区域。

### 2.2 裁剪框计算逻辑（核心变化）
在 `updatePreviewCrop()` 中：
1. 获取配置尺寸：
   - `image-width` / `image-height` / `image-aspect-ratio`
2. 若存在自定义裁剪对象：
   - **normalizeCropResolution**：修正“保存时分辨率”与“当前加载分辨率”不一致的问题
   - **adaptCropToRatio**：当设置的宽高比发生变化时，以裁剪中心为基准扩展宽/高，使其适配新比例
3. 计算遮罩框在屏幕坐标中的位置，使用 DPR 像素对齐。
4. 如发现裁剪对象需要适配，会自动更新 `cropPosition`（避免白框和最终效果不一致）。

### 2.3 保存
- 保存时将 `cropPosition` 写回 `AnimeItem`（使用 `toRaw`，避免代理对象）。

---

## 3) 页面显示（TierRow）
来源：`src/components/TierRow.vue`

### 3.1 显示方式：CSS 裁剪（无 canvas）
- 容器 `.item-image-container`：`position: relative` + `overflow: hidden`
- 图片样式由 `getImageStyle()` 生成

### 3.2 自定义裁剪对象（精确裁剪）
流程：
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

### 3.3 预设裁剪 / auto
- 预设值直接使用 `object-position`。
- `auto` 在 `@load` 时判断：
  - 宽图 -> `center center`
  - 长图 -> `center top`

---

## 4) 分辨率/比例适配（新增工具）
来源：`src/utils/cropUtils.ts`

### 4.1 normalizeCropResolution
- 将裁剪对象从“保存时分辨率”映射到“当前加载分辨率”。
- 解决：高分辨率保存 + 低分辨率预览导致的偏移。

### 4.2 adaptCropToRatio
- 将裁剪矩形扩展到新的目标比例（保持裁剪中心）。
- 用于：尺寸设置变更（如 0.75 -> 1.0）时，裁剪区域自动适配。

---

## 5) 导出裁剪（canvas）
来源：`src/App.vue`, `src/utils/exportUtils.ts`

### 5.1 导出流程
- 导出时克隆 DOM，并统一处理图片：
  - CORS 代理
  - 等待图片加载
  - 调用 `cropImageWithCanvas()`
  - 替换为 dataURL
  - 清理 CSS 裁剪残留（absolute/left/top）

### 5.2 自定义裁剪对象（导出）
- 导出时同样执行：
  - **normalizeCropResolution**
  - **adaptCropToRatio**
- 并模拟 CSS 裁剪逻辑绘制到 canvas：
  - `renderScale = containerWidth / sourceWidth`
  - `destX = -sourceX * renderScale`
  - `destY = -sourceY * renderScale`
  - `ctx.drawImage(img, destX, destY, destWidth, destHeight)`

### 5.3 预设裁剪（导出）
- 若非自定义裁剪对象：
  - 使用传统 3:4 裁剪规则（根据宽高比决定 top/center）。

---

## 6) CORS 代理
- 页面显示不需要代理（CSS 裁剪）。
- 导出需要 canvas，因此必须通过代理处理跨域图片。
- 导出逻辑会优先保留 `blob:`（本地文件）以获得高清。

---

## 7) 持久化行为
- `cropPosition` 持久化到 IndexedDB。
- `naturalWidth/Height` 为运行时值，刷新后重新获取。
- `uuid` 自动补齐，用于稳定 key，避免重排导致 DOM 重建和裁剪重算。

---

## 8) 关键变化汇总（与旧逻辑相比）
- 页面显示完全 CSS 化（不再 canvas 裁剪）。
- 引入 `normalizeCropResolution` 解决高/低分辨率差异。
- 引入 `adaptCropToRatio` 自动适配比例变化。
- 编辑弹窗会自动修正裁剪对象并更新白框。
- 导出裁剪对自定义对象采用“模拟 CSS 行为”的绘制策略。

