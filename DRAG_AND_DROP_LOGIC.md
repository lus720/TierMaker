# 拖拽摆放逻辑与视觉效果文档

本文档详细说明了 `src/utils/dragManager.ts` 中实现的自定义拖拽系统，从开发者角度分析其核心逻辑，并提供配套的视觉效果（CSS）建议。

## 1. 核心逻辑分析 (Core Logic)

该系统实现了一个**基于网格（Grid-based）的插入排序**机制，而非自由拖拽。这就意味着元素总是被“吸附”到特定的槽位中。

### 1.1 数据结构与坐标记录 (`buildGridInfo`)

系统在计算位置时，会遍历 DOM 构建一个网格数据对象。**请注意，该对象记录的 Y 轴信息非常有限**：

```typescript
// 伪代码结构
{
  container: HTMLElement,  // 容器元素
  centerY: number,         // 【关键】容器的垂直中心线坐标 (Viewport Relative)
                           // 计算公式: rect.top + rect.height / 2
  items: [
    {
      element: Element,
      centerX: number      // 【关键】只记录元素的水平中心点 (Item Center X)
      // 注意：这里没有记录 item.centerY！
    }
  ]
}
```

#### `centerY` 详解

`centerY` 代表的是**整个容器（Row）在屏幕上的垂直中心线**。

- **计算方式**: `container.getBoundingClientRect().top + height / 2`
- **作用**: 系统用它来判断“鼠标目前最接近哪一行”。它是行与行之间的一维导航锚点。
- **局限**: 它假设容器是一个简单的矩形条。如果容器高度很高（包含多行内容），`centerY` 依然只是整个大矩形的中间那条线，这可能导致鼠标在容器边缘附近时判定不准。

### 1.2 最近邻搜索 (`findNearestGridPosition`)

当用户拖动元素时，系统通过三步走策略确定落点：

1.  **锁定容器 (Container)**:
    - 找到距离鼠标**垂直距离最近**的容器。
    - **判定规则**: 只要鼠标位于容器顶边(`top`)和底边(`bottom`)的垂直区间内（无限水平延伸），该容器的一级判定距离即为 0。这意味着鼠标即使在屏幕最左/右侧，也能选中对应的水平轨道。
2.  **锁定行 (Visual Row)**:
    - 系统会自动识别容器内的“视觉行”（通过检测元素的 `top` 坐标是否发生跃迁）。
    - 比较鼠标 `y` 坐标与各视觉行的 `centerY`，找到垂直距离最近的一行。
3.  **锁定槽位 (Item)**:
    - 在锁定的视觉行内，仅比较鼠标 `x` 坐标与各元素的 `centerX`。
    - **特殊处理**: 如果是改行的末尾，会自动判断是插入到当前元素之后，还是下一行的开头之前。

> [!NOTE]
> **多行布局支持 (Multi-line Support)**
> 系统已全面支持 `flex-wrap: wrap` 布局。
> `buildGridInfo` 函数通过检测子元素的 Top 坐标变化，自动将它们分组为不同的“视觉行” (Visual Rows)。这意味着你在第二行拖拽时，系统会精准锁定第二行，而不会被第一行的 X 坐标干扰。

### 1.3 DOM 操作与视觉反馈

- **Ghost (幽灵元素)**: 一个完全克隆的元素，使用 `position: fixed` 跟随鼠标移动，作为用户的视觉主体。
- **Placeholder (占位符)**: 一个半透明的克隆元素，**实时插入**到计算出的“最近槽位”。
  - **交互核心**: 用户看到的不是“正在被拖动的元素在哪里”，而是“如果松手，元素会落在哪里”。
  - **流式布局**:由于是真实插入 DOM，Placeholder 会挤开周围的元素，利用浏览器原生的流式布局自动处理排版，无需手动计算兄弟元素的位移。

### 1.4 状态管理

- **Pending 状态**: 为了防止误触（如点击操作），实现了 `DRAG_THRESHOLD` (5px) 检测。只有移动距离超过 5px 时，才触发真正的拖拽逻辑。
- **no-transition**: 拖拽开始时给容器添加此类，强制禁用动画。这是为了防止在 Placeholder 频繁跳动插入时，容器高度发生平滑过渡，导致位置计算错位或视觉抖动。

---

## 2. 视觉效果规范 (Visual Specs)

为了让这套逻辑发挥最佳体验，建议在全局样式文件（如 `src/style.css`）中实现以下视觉规范。这些样式类名在 `dragManager.ts` 中已有定义。

### 2.1 样式实现代码

```css
/* =========================================================================
   拖拽视觉反馈系统
   对应逻辑: src/utils/dragManager.ts
   ========================================================================= */

/* 1. 幽灵元素 (Ghost) - 跟随鼠标的元素 */
.custom-drag-ghost {
  /* 基础定位在 ts 中已设置为 fixed, left, top, z-index */
  border-radius: 4px; /* 稍微圆角 */
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.4); /* 强烈的浮起感阴影 */
  cursor: grabbing; /* 抓取手势 */

  /* 视觉增强 */
  opacity: 0.9 !important; /* 保持较高不透明度，确保内容清晰 */
  filter: brightness(1.1); /* 稍微提亮，突出显示 */
  pointer-events: none; /* 核心：必须穿透，否则无法检测下方元素 */

  /* 稍微倾斜，增加"被提起来"的物理质感 */
  /* ts 中已有 scale(1.05)，这里可以配合旋转 */
  transform: scale(1.05) rotate(2deg) !important;
}

/* 2. 占位符 (Placeholder) - 指示落点的虚影 */
.custom-drag-placeholder {
  /* 基础样式 */
  opacity: 0.4 !important; /* 半透明 */
  filter: grayscale(100%); /* 去色，将其与真实内容区分开 */

  /* 视觉样式：虚线框效果 */
  border: 2px dashed rgba(0, 0, 0, 0.3);
  border-radius: 4px;
  background-color: rgba(0, 0, 0, 0.05); /* 极淡的背景 */

  /* 移除阴影，因为它只是个坑位 */
  box-shadow: none !important;

  /* 保持与原元素一致的尺寸和边距 */
  box-sizing: border-box;
  pointer-events: none;
}

/* 暗色模式下的适配 */
[data-theme="dark"] .custom-drag-placeholder {
  border-color: rgba(255, 255, 255, 0.3);
  background-color: rgba(255, 255, 255, 0.05);
}

/* 3. 源元素 (Source) - 被拖拽的原始元素 */
.custom-dragging-source {
  /* 逻辑中通常将其 display: none 或 visibility: hidden */
  /* 这里可以做一个保底，隐藏原始元素，避免并在 */
  opacity: 0 !important;
}

/* 4. 禁用动画 (No Transition) - 容器样式 */
/* 防止在 placeholder 插入/移除时，容器高度发生平滑过渡，导致判定错位 */
.no-transition,
.no-transition * {
  transition: none !important;
  animation: none !important;
}
```

## 3. 开发注意事项

1.  **Z-Index 管理**: `dragManager.ts` 中硬编码了 `zIndex = '9999'`。如果应用引入了新的模态框或顶层遮罩，请检查并调整此值，确保 Ghost 元素始终位于最上层。
2.  **性能优化**: 目前逻辑会在 `pointermove` 时频繁调用 `getBoundingClientRect`。如果在低性能设备上运行或列表项极多（>500），可能需要引入节流（Throttle）或缓存位置信息。
3.  **滚动处理**: 拖拽时的自动滚动主要依赖 `window` 滚动。如果后续改为局部容器滚动（如侧边栏拖拽），需要更新 `handleScroll` 逻辑。
4.  **多行布局适配**: 如需支持多行，必须修改 `buildGridInfo` 以记录 item 的 centerY，并修改 `findNearestGridPosition` 以使用欧几里得距离。
