import dragula from 'dragula'
import 'dragula/dist/dragula.css'

export interface DragDropHandler {
    containerId: string
    onDrop: (el: Element, target: Element, source: Element, sibling: Element | null) => void
    onDragStart?: () => void
    onDragEnd?: () => void
}

// 共享 Dragula 实例和配置
let drakeInstance: dragula.Drake | null = null
const containers: Map<string, HTMLElement> = new Map()
const handlers: Map<string, DragDropHandler> = new Map()

// 全局拖拽状态
let isDragging = false
let dragStartCallback: (() => void) | null = null
let dragEndCallback: (() => void) | null = null

/**
 * 注册一个容器到 Dragula
 */
export function registerContainer(
    containerId: string,
    element: HTMLElement,
    handler: DragDropHandler
): void {
    containers.set(containerId, element)
    handlers.set(containerId, handler)

    // 如果 drake 已经存在，需要重建以包含新容器
    rebuildDrake()
}

/**
 * 注销一个容器
 */
export function unregisterContainer(containerId: string): void {
    containers.delete(containerId)
    handlers.delete(containerId)
    rebuildDrake()
}

/**
 * 设置全局拖拽开始/结束回调
 */
export function setGlobalDragCallbacks(onStart: () => void, onEnd: () => void): void {
    dragStartCallback = onStart
    dragEndCallback = onEnd
}

/**
 * 获取当前拖拽状态
 */
export function getIsDragging(): boolean {
    return isDragging
}

/**
 * 重建 Dragula 实例
 */
function rebuildDrake(): void {
    // 销毁现有实例
    if (drakeInstance) {
        drakeInstance.destroy()
        drakeInstance = null
    }

    // 如果没有容器，不需要创建
    if (containers.size === 0) return

    const containerElements = Array.from(containers.values())

    drakeInstance = dragula(containerElements, {
        // 不复制元素，而是移动
        copy: false,
        // 允许所有容器接受拖放
        accepts: (el, target, source, sibling) => {
            // 不允许放到空位后面（如果 sibling 有 'empty' class）
            // 空位判断由组件自己处理
            return true
        },
        // 判断哪些元素可以拖动
        moves: (el, source, handle, sibling) => {
            if (!el) return false
            // 不允许拖动空位
            if (el.classList.contains('empty')) return false
            // 不允许从删除按钮开始拖动
            if ((handle as Element)?.classList?.contains('delete-btn')) return false
            return true
        },
        // 镜像元素附加到 body
        mirrorContainer: document.body,
        // 不使用原生 HTML5 拖拽
        slideFactorX: 0,
        slideFactorY: 0,
    })

    // 监听拖动开始
    drakeInstance.on('drag', (el, source) => {
        isDragging = true
        dragStartCallback?.()

        // 查找源容器的处理器并调用 onDragStart
        for (const [id, container] of containers) {
            if (container === source) {
                handlers.get(id)?.onDragStart?.()
                break
            }
        }
    })

    // 监听拖动结束
    drakeInstance.on('dragend', (el) => {
        isDragging = false
        dragEndCallback?.()

        // 调用所有处理器的 onDragEnd
        for (const handler of handlers.values()) {
            handler.onDragEnd?.()
        }
    })

    // 监听放置
    drakeInstance.on('drop', (el, target, source, sibling) => {
        if (!target || !source) return

        // 查找目标容器的处理器
        for (const [id, container] of containers) {
            if (container === target) {
                const handler = handlers.get(id)
                handler?.onDrop(el, target, source, sibling)
                break
            }
        }
    })

    // 监听 shadow（落点预测）
    drakeInstance.on('shadow', (el, container, source) => {
        // shadow 是 Dragula 自动创建的预测落点元素
        // 可以通过 .gu-transit class 来自定义样式
    })

    // 监听取消
    drakeInstance.on('cancel', (el, container, source) => {
        isDragging = false
        dragEndCallback?.()
    })
}

/**
 * 获取元素在容器中的索引
 */
export function getElementIndex(container: HTMLElement, element: Element): number {
    const children = Array.from(container.children)
    return children.indexOf(element)
}

/**
 * 获取容器 ID
 */
export function getContainerId(container: Element): string | null {
    for (const [id, el] of containers) {
        if (el === container) return id
    }
    return null
}
