import { ref } from 'vue'

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
 * 构建网格信息
 */
function buildGridInfo(ignoredEl: HTMLElement | null): {
    container: HTMLElement;
    containerRect: DOMRect; // 整个容器的 Rect
    visualRows: {
        centerY: number;
        items: { element: Element; centerX: number; rect: DOMRect }[]
    }[]
}[] {
    const grid: {
        container: HTMLElement;
        containerRect: DOMRect;
        visualRows: { centerY: number; items: { element: Element; centerX: number; rect: DOMRect }[] }[]
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

        const itemsWithRect = children.map(child => {
            const rect = child.getBoundingClientRect()
            return {
                element: child,
                centerX: rect.left + rect.width / 2,
                centerY: rect.top + rect.height / 2,
                rect
            }
        })

        // 分组为视觉行
        // 逻辑：如果两个相邻元素的 top 差值超过一定阈值（例如高度的一半），则视为换行
        const visualRows: { centerY: number; items: { element: Element; centerX: number; rect: DOMRect }[] }[] = []
        
        if (itemsWithRect.length > 0) {
            let currentRowItems = [itemsWithRect[0]]
            let currentRowTop = itemsWithRect[0].rect.top
            // 为了计算 centerY，我们先收集所有 items，最后再算
            
            for (let i = 1; i < itemsWithRect.length; i++) {
                const item = itemsWithRect[i]
                // 判断是否换行：当前 item 的 top 比上一行的 top 大了很多
                // 这里简单判断：如果 item.top > (currentRowTop + item.height * 0.5)
                // 或者更简单的：items 已经是 DOM 顺序，如果 item.left < prevItem.right (且差距较大)，但通常 DOM 顺序是 Z 字形
                // 最稳健的方式是看 top 坐标
                
                if (Math.abs(item.rect.top - currentRowTop) > 20) { // 20px 容差，或者用 height 的一半
                    // 结算上一行
                    visualRows.push({
                        centerY: calculateRowCenterY(currentRowItems),
                        items: currentRowItems
                    })
                    // 开启新一行
                    currentRowItems = [item]
                    currentRowTop = item.rect.top
                } else {
                    currentRowItems.push(item)
                }
            }
            // 结算最后一行
            if (currentRowItems.length > 0) {
                visualRows.push({
                    centerY: calculateRowCenterY(currentRowItems),
                    items: currentRowItems
                })
            }
        } else {
            // 如果没有 item，但容器还在，创建一个空的 visualRow (使用容器中心)
            visualRows.push({
                centerY: containerRect.top + containerRect.height / 2,
                items: []
            })
        }

        grid.push({ container, containerRect, visualRows })
    }

    return grid
}

function calculateRowCenterY(items: { rect: DOMRect }[]): number {
    if (items.length === 0) return 0
    // 取第一个和最后一个的平均，或者所有 items 的平均
    // 假设一行中高度差不多
    // 更精确：行内 item 的 minTop 和 maxBottom 的中间
    let minTop = Infinity
    let maxBottom = -Infinity
    
    for (const item of items) {
        if (item.rect.top < minTop) minTop = item.rect.top
        if (item.rect.bottom > maxBottom) maxBottom = item.rect.bottom
    }
    
    return (minTop + maxBottom) / 2
}

/**
 * 查找最近的插入位置
 */
function findNearestGridPosition(
    mouseX: number,
    mouseY: number,
    ignoredEl: HTMLElement | null
): { container: HTMLElement; sibling: Element | null } | null {
    const grid = buildGridInfo(ignoredEl)

    if (grid.length === 0) return null

    // 1. 找到最近的容器 (Container)
    // 这里我们可以先看 mouseY 是否在 container 范围内，或者找最近的 Container center
    
    // 简单起见，我们还是找最近的“行”的所有集合中心？如果不准确，可能需要重写逻辑：
    // 先找包含鼠标的 Container，如果没有，找最近的 Container
    
    let nearestContainerData = grid[0]
    let minContainerDistance = Infinity
    
    // 辅助函数：计算点到矩形的垂直距离 (忽略 X 轴，如果 Y 在范围内则为 0)
    const distToRect = (_x: number, y: number, rect: DOMRect) => {
        // const dx = Math.max(rect.left - x, 0, x - rect.right); // 忽略 X 轴
        const dy = Math.max(rect.top - y, 0, y - rect.bottom);
        return dy; // 只返回垂直距离
    }

    for (const g of grid) {
        const dist = distToRect(mouseX, mouseY, g.containerRect)
        if (dist < minContainerDistance) {
            minContainerDistance = dist
            nearestContainerData = g
        }
    }
    
    // 2. 在最近的 Container 中，找到最近的 Visual Row
    const { container, visualRows } = nearestContainerData
    
    if (visualRows.length === 0) return { container, sibling: null }
    
    let nearestRow = visualRows[0]
    let minYDistance = Math.abs(mouseY - nearestRow.centerY)
    
    for (const row of visualRows) {
        const distance = Math.abs(mouseY - row.centerY)
        if (distance < minYDistance) {
            minYDistance = distance
            nearestRow = row
        }
    }
    
    // 3. 在最近的 Visual Row 中，找到最近的 Item (X 轴)
    const items = nearestRow.items
    
    if (items.length === 0) {
        // 如果这行是空的（可能是刚生成的空行），但通常至少有个 items
        // 如果是整个 Container 空的，buildGridInfo 会生成一个空 items 的 row
        return { container, sibling: null }
    }

    const insertPoints: { x: number; sibling: Element | null }[] = []

    // 第一个点
    const firstItemRect = items[0].rect
    insertPoints.push({ x: firstItemRect.left, sibling: items[0].element })

    // 中间点
    for (let i = 0; i < items.length - 1; i++) {
        const currentRect = items[i].rect
        const nextRect = items[i + 1].rect
        const midX = (currentRect.right + nextRect.left) / 2
        insertPoints.push({ x: midX, sibling: items[i + 1].element })
    }

    // 最后一个点
    const lastItemRect = items[items.length - 1].rect
    insertPoints.push({ x: lastItemRect.right, sibling: null })
    
    // 实际上这里有个 Bug：如果 "sibling: null"，那是插入到 items[last] 的后面
    // 但 items[last] 可能不是 container 的最后一个子元素！
    // 因为 visualRow 只是 container 的一部分。
    // 如果 visualRow 是 container 的中间行，rowEnd 的 sibling 应该是 visualRow 中最后一个 item 的下一个元素。
    // 修正逻辑：
    
    // 我们需要的是：在 items 中找到一个插入位置。
    // 如果是 items[0] 之前，sibling = items[0].element
    // 如果是 items[i] 和 items[i+1] 之间，sibling = items[i+1].element
    // 如果是 items[last] 之后，sibling = items[last].element.nextElementSibling ?
    
    // 重新遍历寻找最近点 X
    let nearestPointX = insertPoints[0].x
    let nearestSibling = insertPoints[0].sibling
    let minXDistance = Math.abs(mouseX - nearestPointX)

    for (const point of insertPoints) {
        const distance = Math.abs(mouseX - point.x)
        if (distance < minXDistance) {
            minXDistance = distance
            nearestPointX = point.x
            nearestSibling = point.sibling
        }
    }
    
    // 特殊情况处理：如果是某行的“最后一个位置” (sibling === null)
    // 但这行后面可能还有下一行。所以真正的 sibling 应该是下一行的第一个元素？
    // 或者，如果 sibling === null，代表 appendChild 到 items[last] 后面。
    // 但是在这个 visualRow 的上下文里，appendChild 意味着插入到这一行的末尾。
    // 在 DOM 层面，如果这一行不是最后一行，那么这一行末尾元素的 nextSibling 就是下一行的开头元素。
    // 所以，如果 loop 选中的 sibling 是 null，我们需要检查 DOM 结构。
    
    if (nearestSibling === null) {
        // 找到这行最后一个 item
        const lastItem = items[items.length - 1].element
        // 返回它的下一个兄弟作为 sibling。如果它是整个 container 最后一个，nextSibling 也就是 null，正好。
        nearestSibling = lastItem.nextElementSibling
    }

    return { container, sibling: nearestSibling }
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
