/**
 * 导出工具函数
 * 用于图片和 PDF 导出时的公共逻辑
 */

import type { CropPosition } from '../types'
import { getSize } from './configManager'

/**
 * 处理克隆文档中的所有图片，应用 CORS 代理和裁剪
 */
export async function processExportImages(
    root: HTMLElement,
    scale: number,
    cropImageFn: (img: HTMLImageElement, scale: number) => Promise<string | null>,
    getCorsProxyUrlFn: (url: string) => string,
    applySmartCropFn: (img: HTMLImageElement) => void,
    exportType: 'image' | 'pdf' = 'image',
    options?: { excludeCandidates?: boolean }
): Promise<void> {
    const { excludeCandidates = true } = options || {}

    const allImages = root.querySelectorAll('img') as NodeListOf<HTMLImageElement>
    const imageProcessPromises: Promise<void>[] = []

    // 找到 divider 元素，用于判断哪些 tier-list 是在 divider 之后的（即 unranked/备选框区域）
    const divider = root.querySelector('.divider')
    let unrankedTierList: Element | null = null
    if (divider && excludeCandidates) {
        // 找到 divider 后面的第一个 .tier-list
        let nextEl = divider.nextElementSibling
        while (nextEl) {
            if (nextEl.classList.contains('tier-list')) {
                unrankedTierList = nextEl
                break
            }
            nextEl = nextEl.nextElementSibling
        }
    }

    allImages.forEach((img) => {
        // 如果启用了排除候选框，跳过备选框（unranked tier-list）中的图片
        if (excludeCandidates && unrankedTierList && unrankedTierList.contains(img)) {
            console.log(`[Export] Skipping unranked/candidate item image: ${img.getAttribute('data-item-id')}`)
            return
        }
        const processPromise = new Promise<void>(async (resolve) => {
            const itemId = img.getAttribute('data-item-id')
            const currentSrc = img.src
            const dataOriginalSrc = img.getAttribute('data-original-src')

            // 如果 currentSrc 已经是 data URL（主页面已裁剪），直接使用
            if (currentSrc.startsWith('data:')) {
                img.src = currentSrc
                // Use configured sizes
                const width = getSize('image-width') || 100
                const height = getSize('image-height') || 133
                img.style.width = `${width}px`
                img.style.height = `${height}px`
                img.style.objectFit = 'none'
                resolve()
                return
            }

            // 优先检测 blob，如果当前图片是 blob (本地上传)，它是最高清晰度且无需代理
            // 必须优先于 data-original-src，否则会被替换为 url 的代理版本 (可能分辨率较低)
            const isBlob = currentSrc.startsWith('blob:')
            const originalSrc = isBlob ? currentSrc : (dataOriginalSrc || currentSrc)

            // 替换为 CORS 代理 URL
            if (originalSrc && !originalSrc.startsWith('data:') && !originalSrc.startsWith('blob:') && !originalSrc.includes('wsrv.nl')) {
                const proxyUrl = getCorsProxyUrlFn(originalSrc)
                const isVndbImage = originalSrc.includes('vndb.org')

                console.log(`[Export] Item ${itemId}: Processing image`, {
                    originalSrc,
                    proxyUrl,
                    isVndbImage
                })

                // 核心修复: 先设置 crossOrigin，再设置 src
                // VNDB 图片直接使用原图，不设置 crossOrigin
                if (!isVndbImage || proxyUrl !== originalSrc) {
                    console.log(`[Export] Item ${itemId}: Setting crossOrigin = anonymous`)
                    img.crossOrigin = 'anonymous'
                } else {
                    console.log(`[Export] Item ${itemId}: Skipping crossOrigin for VNDB/Same-origin`)
                }
                img.src = proxyUrl
            } else if (originalSrc?.includes('wsrv.nl') || originalSrc?.includes('i0.wp.com') || originalSrc?.startsWith('blob:')) {
                console.log(`[Export] Item ${itemId}: URL already proxied or is blob`, { originalSrc })
                img.crossOrigin = 'anonymous'
            } else {
                console.warn(`⚠️ 导出${exportType === 'pdf' ? ' PDF' : '图片'}时 URL 异常:`, { originalSrc, currentSrc: img.src, itemId })
            }

            // 等待图片加载完成
            const waitForLoad = () => {
                if (img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
                    console.log(`[Export] Item ${itemId}: Image loaded successfully`, {
                        src: img.src,
                        naturalWidth: img.naturalWidth,
                        naturalHeight: img.naturalHeight
                    })
                    // 核心修复: 图片加载完成后立即清除监听器，防止后续修改 src 导致死循环
                    img.onload = null
                    img.onerror = null

                    // 图片已加载，进行裁剪
                    cropImageFn(img, scale).then((croppedBase64) => {
                        const width = getSize('image-width') || 100
                        const height = getSize('image-height') || 133

                        if (croppedBase64) {
                            img.src = croppedBase64
                            img.style.width = `${width}px`
                            img.style.height = `${height}px`
                            img.style.objectFit = 'none'
                        } else {
                            console.warn(`⚠️ 导出${exportType === 'pdf' ? ' PDF' : '图片'}时裁剪失败，使用 CSS 方式:`, { itemId })
                            applySmartCropFn(img)
                        }
                    }).catch((error) => {
                        console.error(`❌ 导出${exportType === 'pdf' ? ' PDF' : '图片'}时裁剪出错:`, { itemId, error })
                        applySmartCropFn(img)
                    }).finally(() => {
                        // 核心修复: 无论成功还是失败，都必须清理绝对定位样式
                        // 防止 CSS 裁剪的遗留样式导致偏移
                        img.style.position = 'static'
                        img.style.left = 'auto'
                        img.style.top = 'auto'
                        img.style.transform = 'none'
                        resolve()
                    })
                } else {
                    // 图片未加载完成，等待加载
                    img.onload = () => {
                        console.log(`[Export] Item ${itemId}: Image onload triggered`)
                        waitForLoad()
                    }
                    img.onerror = () => {
                        console.error(`❌ 导出${exportType === 'pdf' ? ' PDF' : '图片'}时加载失败:`, { itemId, src: img.src, originalSrc })
                        resolve()
                    }
                }
            }

            waitForLoad()
        })

        imageProcessPromises.push(processPromise)
    })

    await Promise.allSettled(imageProcessPromises)
}

/**
 * 处理克隆文档中的空位元素
 */
export function processEmptySlots(root: HTMLElement): void {
    const emptySlots = root.querySelectorAll('.tier-item.empty')
    emptySlots.forEach((slot) => {
        const el = slot as HTMLElement
        const parent = el.parentElement
        const hasItems = parent && Array.from(parent.children).some(c => !c.classList.contains('empty'))

        if (hasItems) {
            el.style.display = 'none'
        } else {
            el.style.opacity = '0'
            el.style.border = 'none'
            const content = el.querySelectorAll('.item-placeholder, .placeholder-text')
            content.forEach(c => (c as HTMLElement).style.display = 'none')
        }
    })
}

/**
 * 配置导出时的 DOM 样式
 */
export function configureExportStyles(
    root: HTMLElement,
    options: {
        titleFontSize: number
        originalAppWidth: number
    }
): void {
    const { titleFontSize, originalAppWidth } = options

    // 确保 Header 样式正确
    const header = root.querySelector('.header') as HTMLElement
    if (header) {
        header.style.paddingBottom = `${titleFontSize / 2}px`
        header.style.marginBottom = '0'
    }

    // 确保标题正常显示
    const clonedTitle = root.querySelector('.title') as HTMLElement
    if (clonedTitle) {
        clonedTitle.style.display = 'block'
        clonedTitle.style.visibility = 'visible'
        clonedTitle.style.position = 'relative'
        clonedTitle.style.left = 'auto'
        clonedTitle.style.transform = 'none'
        clonedTitle.style.textAlign = 'center'
        clonedTitle.style.width = '100%'
        clonedTitle.style.margin = '0'
        clonedTitle.style.padding = '0'
        clonedTitle.style.lineHeight = '1'
    }

    // 设置 tier-list 的顶部间距
    const clonedTierList = root.querySelector('.tier-list') as HTMLElement
    if (clonedTierList) {
        clonedTierList.style.marginTop = '0'
        clonedTierList.style.paddingTop = '0'
    }

    // Tight 模式：移除所有留白
    const clonedApp = root.querySelector('.app') as HTMLElement
    if (clonedApp) {
        clonedApp.style.padding = '0'
        clonedApp.style.margin = '0'
        clonedApp.style.width = `${originalAppWidth}px`
        clonedApp.style.maxWidth = `${originalAppWidth}px`
    }
}

/**
 * 隐藏导出时不需要的 UI 元素
 */
export function hideExportUIElements(
    root: HTMLElement,
    options?: { hideCandidates?: boolean; hideUnranked?: boolean }
): void {
    const { hideCandidates = true, hideUnranked = false } = options || {}

    // 隐藏按钮和操作栏
    root.querySelectorAll('button, .btn, .header-actions').forEach((el: any) => el.style.display = 'none')

    const headerLeft = root.querySelector('.header-left') as HTMLElement
    if (headerLeft) {
        headerLeft.style.display = 'none'
    }

    // 隐藏模态框
    const modals = root.querySelectorAll('.modal-overlay, [class*="modal"]')
    modals.forEach((modal) => {
        (modal as HTMLElement).style.display = 'none'
    })

    // 隐藏候选框
    if (hideCandidates) {
        const candidatesBox = root.querySelector('.candidates-box') as HTMLElement
        if (candidatesBox) {
            candidatesBox.style.display = 'none'
            candidatesBox.style.visibility = 'hidden'
            candidatesBox.style.height = '0'
            candidatesBox.style.margin = '0'
            candidatesBox.style.padding = '0'
            candidatesBox.style.overflow = 'hidden'
        }
    }

    // 隐藏无等级列表和分割线
    if (hideUnranked) {
        const dividers = root.querySelectorAll('.divider')
        if (dividers.length > 0) {
            const lastDivider = dividers[dividers.length - 1] as HTMLElement
            lastDivider.style.display = 'none'

            let nextEl = lastDivider.nextElementSibling
            while (nextEl) {
                if (nextEl.classList.contains('tier-list')) {
                    (nextEl as HTMLElement).style.display = 'none'
                    break
                }
                nextEl = nextEl.nextElementSibling
            }
        }
    }
}

/**
 * 同步主题到克隆文档
 */
/**
 * 同步主题到克隆节点 (Since we are in same doc, we might just look up root)
 * Not strictly needed if we clone styles, but good to set attribute on container if usage depends on it.
 * But wait, data-theme is on html. We should set it on the container if we want scoped styles? 
 * Or just rely on global? 
 * Actually, let's just make it a no-op or set on container if needed.
 * But CSS variables are usually on :root. 
 * If we are cloning inside the SAME document, the root :root variables apply.
 * So we don't need to do anything for CSS vars.
 * But specific selectors like [data-theme="dark"] .foo might need the attribute on a parent.
 * Let's set it on the root element.
 */
export function syncThemeToClonedDoc(root: HTMLElement): void {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'auto'
    root.setAttribute('data-theme', currentTheme)
}
