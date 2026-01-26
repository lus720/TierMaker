import { ref } from 'vue'
import { getConfig } from './configManager'

// 类型定义
export interface DragDropHandler<T = any> {
    containerId: string
    onDrop: (payload: T, newIndex: number) => void
    onDragStart?: () => void
    onDragEnd?: () => void
}

// 状态管理
const containers: Map<string, HTMLElement> = new Map()
const handlers: Map<string, DragDropHandler> = new Map()

// 拖拽状态
let isDragging = false
let isPendingDrag = false // 是否处于等待拖拽阈值的状态
let pendingItem: HTMLElement | null = null
let pendingPayload: any | null = null
let pendingEvent: PointerEvent | null = null

let currentDragItem: HTMLElement | null = null
let currentDragPayload: any | null = null // 保存数据负载
let ghostEl: HTMLElement | null = null
let placeholderEl: HTMLElement | null = null
let startX = 0
let startY = 0
let lastClientX = 0
let lastClientY = 0

// 调试与回调
let dragStartCallback: (() => void) | null = null
let dragEndCallback: (() => void) | null = null

// 样式常量
const GHOST_CLASS = 'custom-drag-ghost'
const PLACEHOLDER_CLASS = 'custom-drag-placeholder'
const DRAGGING_CLASS = 'custom-dragging-source'
const NO_TRANSITION_CLASS = 'no-transition' // 禁用动画的类名
const DRAG_THRESHOLD = 5 // 拖拽阈值 (px)

/**
 * 注册容器
 */
export function registerContainer(
    containerId: string,
    element: HTMLElement,
    handler: DragDropHandler
): void {
    containers.set(containerId, element)
    handlers.set(containerId, handler)
    element.dataset.dragContainerId = containerId
}

/**
 * 注销容器
 */
export function unregisterContainer(containerId: string): void {
    containers.delete(containerId)
    handlers.delete(containerId)
}

/**
 * 设置全局回调
 */
export function setGlobalDragCallbacks(onStart: () => void, onEnd: () => void): void {
    dragStartCallback = onStart
    dragEndCallback = onEnd
}

/**
 * 获取拖拽状态
 */
export function getIsDragging(): boolean {
    return isDragging
}

/**
 * 构建容器信息（简化版，不需要预计算所有 item 位置）
 */
function buildContainerInfo(ignoredEl: HTMLElement | null): {
    container: HTMLElement;
    containerRect: DOMRect;
    itemCount: number;
    items: Element[];
}[] {
    const infos: {
        container: HTMLElement;
        containerRect: DOMRect;
        itemCount: number;
        items: Element[];
    }[] = []

    for (const container of containers.values()) {
        const containerRect = container.getBoundingClientRect()
        // 过滤子元素
        const children = Array.from(container.children).filter(child =>
            child !== ignoredEl &&
            child !== placeholderEl &&
            !child.classList.contains(GHOST_CLASS) &&
            !child.classList.contains(DRAGGING_CLASS) &&
            !child.classList.contains('empty')
        )

        infos.push({ container, containerRect, itemCount: children.length, items: children })
    }

    return infos
}

/**
 * 查找最近的插入位置 (Grid Logic)
 */
function findNearestGridPosition(
    mouseX: number,
    mouseY: number,
    ignoredEl: HTMLElement | null
): { container: HTMLElement; sibling: Element | null } | null {
    const infos = buildContainerInfo(ignoredEl)
    if (infos.length === 0) return null

    // 1. 找到目标容器
    // 优先找鼠标所在的容器
    let targetContainerData = infos.find(info =>
        mouseX >= info.containerRect.left &&
        mouseX <= info.containerRect.right &&
        mouseY >= info.containerRect.top &&
        mouseY <= info.containerRect.bottom
    )

    // 如果鼠标不在任何容器内，找垂直距离最近的容器 (Y轴)
    if (!targetContainerData) {
        let minDistance = Infinity
        for (const info of infos) {
            // 计算垂直距离
            const dist = Math.max(info.containerRect.top - mouseY, 0, mouseY - info.containerRect.bottom)
            if (dist < minDistance) {
                minDistance = dist
                targetContainerData = info
            }
        }
    }

    if (!targetContainerData) return null

    const { container, containerRect, items } = targetContainerData

    // 2. 获取配置参数
    const config = getConfig()
    // const n = config.sizes['items-per-row'] || 5 // Config removed
    const itemWidth = config.sizes['item-width'] || 100
    const itemHeight = config.sizes['item-height'] || 173

    // Dynamic N calculation
    // Available width for items = Container Width - Padding Left - Padding Right
    // In CSS Flexbox with gap: 
    // Total Width >= n * itemWidth + (n-1) * gap
    // Total Width >= n * (itemWidth + gap) - gap
    // Total Width + gap >= n * (itemWidth + gap)
    // n = floor( (Width + gap) / (itemWidth + gap) )

    // Config values
    const gap = config.sizes['row-gap'] || 10
    const paddingLeft = config.sizes['row-padding'] || 10
    const paddingRight = config.sizes['row-padding'] || 10
    const paddingTop = config.sizes['container-padding-top'] || 10

    const containerWidth = containerRect.width
    const availableWidth = containerWidth - paddingLeft - paddingRight

    // Safety check to avoid division by zero
    const stride = itemWidth + gap
    let n = 1
    if (stride > 0) {
        // Use rounding to avoid floating point issues near boundaries? 
        // Math.floor is correct for fitting items.
        // Add a tiny epsilon to availableWidth just in case of sub-pixel issues? No, keep it strict.
        n = Math.floor((availableWidth + gap) / stride)
    }
    if (n < 1) n = 1 // At least 1 item per row

    // 注意：itemHeight 可能不是固定的，如果 hide-name，这里简单起见先取 configs
    // 更准确的方式是取 items[0] 的 height，或者 config value
    // 考虑到 hide-name，最好是从 DOM 获取第一个 item 的高度 (如果存在)
    let actualItemHeight = itemHeight
    if (items.length > 0) {
        actualItemHeight = items[0].getBoundingClientRect().height
    } else {
        // 尝试检查是否是 hide-name 模式 (从 class)
        // 暂时用 config default
        const hideNameHeight = config.sizes['item-height-hide-name'] || 133
        // 简单 heuristic: 看看 container 里面有没有 .hide-name 的元素? 或者 container parent?
        // 先默认用 config.item-height
    }

    // 3. 计算 (i, j)
    const relX = mouseX - containerRect.left - paddingLeft
    const relY = mouseY - containerRect.top - paddingTop

    // 列可以限制在 0 ~ n-1
    // j = floor(relX / (w + gap))
    // 修正：items 的放置是：item gap item gap ...
    // X coordinate starts at 0. Item occupies [0, w]. Next item starts at w + gap.
    // Interval stride is w + gap.
    let j = Math.floor(relX / (itemWidth + gap))

    // 修正边界: 如果鼠标在 gap 中间，算前一个还是后一个？
    // 严格来说，drop 在 gap 中间偏左算左，偏右算右。
    // 但是这里网格是从左往右填充。
    // 简单处理：clamp j
    if (j < 0) j = 0
    if (j >= n) j = n - 1

    // 行 i
    let i = Math.floor(relY / (actualItemHeight + gap))
    if (i < 0) i = 0

    // 计算目标索引
    let targetIndex = i * n + j

    // 因为是从 (0,0) 开始依次填充，所以中间不能有空洞 (除了末尾)
    // 所以 targetIndex 不能超过 items.length
    // 如果 targetIndex > items.length，则修正为 items.length (追加到最后)
    if (targetIndex > items.length) {
        targetIndex = items.length
    }

    // 4. 找到对应的 sibling
    // items 数组已经是 DOM 顺序
    // 如果 targetIndex == items.length， sibling = null (append)
    // 否则 sibling = items[targetIndex]

    const sibling = targetIndex < items.length ? items[targetIndex] : null

    return { container, sibling }
}

/**
 * 初始化真正拖拽 (Ghost, Placeholder, Classes)
 */
function initRealDrag() {
    if (!pendingItem) return

    // 1. 禁用所有容器的动画
    for (const container of containers.values()) {
        container.classList.add(NO_TRANSITION_CLASS)
    }

    const item = pendingItem
    const rect = item.getBoundingClientRect()
    currentDragItem = item
    currentDragPayload = pendingPayload

    ghostEl = item.cloneNode(true) as HTMLElement

    // 移除长按指示器
    const indicator = ghostEl.querySelector('.long-press-indicator-circle')
    if (indicator) indicator.remove()

    ghostEl.classList.add(GHOST_CLASS)
    ghostEl.style.position = 'fixed'
    ghostEl.style.left = `${rect.left}px`
    ghostEl.style.top = `${rect.top}px`
    ghostEl.style.width = `${rect.width}px`
    ghostEl.style.height = `${rect.height}px`
    ghostEl.style.zIndex = '9999'
    ghostEl.style.pointerEvents = 'none'
    ghostEl.style.opacity = '0.8'
    ghostEl.style.transform = 'scale(1.05)'
    ghostEl.style.transition = 'none'
    document.body.appendChild(ghostEl)

    // 3. 源元素样式
    item.classList.add(DRAGGING_CLASS)

    // 4. 创建 Placeholder (半透明克隆)
    placeholderEl = item.cloneNode(true) as HTMLElement
    // 移除指示器
    const pIndicator = placeholderEl.querySelector('.long-press-indicator-circle')
    if (pIndicator) pIndicator.remove()

    placeholderEl.classList.add(PLACEHOLDER_CLASS)
    placeholderEl.removeAttribute('id')
    placeholderEl.classList.remove(DRAGGING_CLASS)
    placeholderEl.classList.remove(GHOST_CLASS)

    placeholderEl.style.opacity = '0.5'
    placeholderEl.style.pointerEvents = 'none'
    placeholderEl.style.transform = ''
    placeholderEl.style.transition = ''
    placeholderEl.style.width = `${rect.width}px`
    placeholderEl.style.height = `${rect.height}px`
    placeholderEl.style.margin = window.getComputedStyle(item).margin

    item.parentNode?.insertBefore(placeholderEl, item)
    item.style.display = 'none'

    // 触发 DragStart 回调
    dragStartCallback?.()

    if (currentDragPayload && currentDragPayload.fromRowId) {
        const handler = handlers.get(currentDragPayload.fromRowId)
        handler?.onDragStart?.()
    }

    // 添加滚动监听
    window.addEventListener('scroll', handleScroll, { passive: true, capture: true })
}

/**
 * 开始拖拽 (由 pointerdown 调用) - 进入 Pending 状态
 */
export function startDrag<T = any>(e: PointerEvent, item: HTMLElement, payload: T): void {
    if (e.button !== 0) return
    // e.preventDefault() // 防止文本选择，但也可能阻止点击？
    // 只有当真正拖拽时才 preventDefault? 
    // 不，如果需要捕获 pointer，最好现在就 preventDefault，否则浏览器可能会触发原生行为
    // 但如果 preventDefault，click 事件还会触发吗？
    // Pointer Events: preventing default on pointerdown prevents compatibility mouse events, 
    // but click is usually fired after pointerup if not canceled.
    // 让我们先 preventDefault，通常没问题。
    e.preventDefault()

    // 设置 Pending 状态
    isPendingDrag = true
    isDragging = false
    pendingItem = item
    pendingPayload = payload
    startX = e.clientX
    startY = e.clientY
    lastClientX = e.clientX
    lastClientY = e.clientY

    item.setPointerCapture(e.pointerId)

    item.addEventListener('pointermove', handlePointerMove)
    item.addEventListener('pointerup', handlePointerUp)
    item.addEventListener('pointercancel', handlePointerUp)
}

/**
 * 强制取消拖拽 (外部调用，如长按触发时)
 */
export function cancelDrag(): void {
    // 1. 如果还在 Pending 状态
    if (pendingItem) {
        const item = pendingItem
        // 尝试释放捕获 (可能已经释放或者不需要)
        try {
            if (pendingEvent) item.releasePointerCapture(pendingEvent.pointerId)
        } catch (e) {
            // ignore
        }
        item.removeEventListener('pointermove', handlePointerMove)
        item.removeEventListener('pointerup', handlePointerUp)
        item.removeEventListener('pointercancel', handlePointerUp)

        isPendingDrag = false
        pendingItem = null
        pendingPayload = null
        pendingEvent = null
    }

    // 2. 如果已经开始拖拽
    if (isDragging) {
        // 恢复所有容器动画
        for (const container of containers.values()) {
            container.classList.remove(NO_TRANSITION_CLASS)
        }

        // 清理 DOM
        ghostEl?.remove()
        placeholderEl?.remove()

        if (currentDragItem) {
            currentDragItem.style.display = ''
            currentDragItem.style.opacity = ''
            currentDragItem.style.transition = ''
            currentDragItem.classList.remove(DRAGGING_CLASS)
        }

        // 触发 DragEnd (只是为了状态复位，也许不需要回调？或者传递 canceled 参数？)
        // 这里我们静默取消，不触发 drop
        dragEndCallback?.()
        if (currentDragPayload && currentDragPayload.fromRowId) {
            const handler = handlers.get(currentDragPayload.fromRowId)
            handler?.onDragEnd?.()
        }

        isDragging = false
        currentDragItem = null
        currentDragPayload = null
        ghostEl = null
        placeholderEl = null

        window.removeEventListener('scroll', handleScroll, { capture: true })
    }
}

/**
 * 更新拖拽位置（Ghost 和 Placeholder）
 */
function updateDragPosition(x: number, y: number) {
    if (!ghostEl) return

    // 2. 移动 Ghost
    const dx = x - startX
    const dy = y - startY
    ghostEl.style.transform = `translate(${dx}px, ${dy}px) scale(1.05)`

    // 3. 计算并移动 Placeholder
    const result = findNearestGridPosition(x, y, placeholderEl)
    if (result && placeholderEl) {
        if (result.sibling) {
            result.container.insertBefore(placeholderEl, result.sibling)
        } else {
            const emptyEl = result.container.querySelector('.empty')
            if (emptyEl) {
                result.container.insertBefore(placeholderEl, emptyEl)
            } else {
                result.container.appendChild(placeholderEl)
            }
        }
    }
}

/**
 * 处理滚动事件
 */
function handleScroll() {
    if (!isDragging || !ghostEl) return
    // 使用最后一次记录的鼠标位置更新
    updateDragPosition(lastClientX, lastClientY)
}

/**
 * 拖拽移动
 */
function handlePointerMove(e: PointerEvent) {
    // 1. Pending 状态检查
    if (isPendingDrag) {
        const dx = e.clientX - startX
        const dy = e.clientY - startY
        const distance = Math.sqrt(dx * dx + dy * dy)

        if (distance > DRAG_THRESHOLD) {
            // 超过阈值，开始真正拖拽
            isPendingDrag = false
            isDragging = true
            initRealDrag()
        } else {
            // 未超过阈值，不做任何事
            return
        }
    }

    if (!isDragging || !ghostEl) return
    e.preventDefault()

    lastClientX = e.clientX
    lastClientY = e.clientY

    updateDragPosition(e.clientX, e.clientY)
}

/**
 * 拖拽结束
 */
function handlePointerUp(e: PointerEvent) {
    if (pendingItem) {
        const item = pendingItem
        item.releasePointerCapture(e.pointerId)
        item.removeEventListener('pointermove', handlePointerMove)
        item.removeEventListener('pointerup', handlePointerUp)
        item.removeEventListener('pointercancel', handlePointerUp)
    }

    // 如果只是 Pending，说明没有发生拖动，视为点击
    if (isPendingDrag) {
        isPendingDrag = false
        pendingItem = null
        pendingPayload = null
        return
        // 此时原生 click 事件应该正常触发（除非 setPointerCapture 干扰了？）
        // 我们拭目以待。如果点击失效，需要手动 dispatch click。
    }

    if (!isDragging || !currentDragItem) return

    // 恢复所有容器动画
    for (const container of containers.values()) {
        container.classList.remove(NO_TRANSITION_CLASS)
    }

    const item = currentDragItem

    // 1. 确定最终落点
    let targetContainer: HTMLElement | null = null
    let newIndex = 0

    if (placeholderEl && placeholderEl.parentNode) {
        targetContainer = placeholderEl.parentNode as HTMLElement
        const children = Array.from(targetContainer.children).filter(c =>
            c !== ghostEl &&
            !c.classList.contains('empty') &&
            c !== item
        )
        newIndex = children.indexOf(placeholderEl)
    }

    // 2. 触发回调
    if (targetContainer) {
        const containerId = targetContainer.dataset.dragContainerId
        if (containerId) {
            const handler = handlers.get(containerId)
            if (handler) {
                handler.onDrop(currentDragPayload, newIndex)
            }
        }
    }

    // 3. 清理 DOM
    ghostEl?.remove()
    placeholderEl?.remove()

    item.style.display = ''
    item.style.opacity = ''
    item.style.transition = '' // 确保恢复
    item.classList.remove(DRAGGING_CLASS)

    // 4. 重置状态
    isDragging = false
    currentDragItem = null
    currentDragPayload = null
    ghostEl = null
    placeholderEl = null

    window.removeEventListener('scroll', handleScroll, { capture: true })

    // 触发 DragEnd
    dragEndCallback?.()
    if (pendingPayload && pendingPayload.fromRowId) {
        const handler = handlers.get(pendingPayload.fromRowId)
        handler?.onDragEnd?.()
    }

    pendingItem = null
    pendingPayload = null
}
