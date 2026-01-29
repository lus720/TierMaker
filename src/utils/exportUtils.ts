/**
 * 导出工具函数
 * 用于图片和 PDF 导出时的公共逻辑
 */

import type { CropPosition } from '../types'

/**
 * 处理克隆文档中的所有图片，应用 CORS 代理和裁剪
 */
export async function processExportImages(
    clonedDoc: Document,
    scale: number,
    cropImageFn: (img: HTMLImageElement, scale: number) => Promise<string | null>,
    getCorsProxyUrlFn: (url: string) => string,
    applySmartCropFn: (img: HTMLImageElement) => void,
    exportType: 'image' | 'pdf' = 'image'
): Promise<void> {
    const allImages = clonedDoc.querySelectorAll('img') as NodeListOf<HTMLImageElement>
    const imageProcessPromises: Promise<void>[] = []

    allImages.forEach((img) => {
        const processPromise = new Promise<void>(async (resolve) => {
            const itemId = img.getAttribute('data-item-id')
            const currentSrc = img.src
            const dataOriginalSrc = img.getAttribute('data-original-src')

            // 如果 currentSrc 已经是 data URL（主页面已裁剪），直接使用
            if (currentSrc.startsWith('data:')) {
                img.src = currentSrc
                img.style.width = '100px'
                img.style.height = '133px'
                img.style.objectFit = 'none'
                resolve()
                return
            }

            const originalSrc = dataOriginalSrc || currentSrc

            // 替换为 CORS 代理 URL
            if (originalSrc && !originalSrc.startsWith('data:') && !originalSrc.startsWith('blob:') && !originalSrc.includes('wsrv.nl')) {
                const proxyUrl = getCorsProxyUrlFn(originalSrc)
                const isVndbImage = originalSrc.includes('vndb.org')

                img.src = proxyUrl
                // VNDB 图片直接使用原图，不设置 crossOrigin
                if (!isVndbImage || proxyUrl !== originalSrc) {
                    img.crossOrigin = 'anonymous'
                }
            } else if (originalSrc?.includes('wsrv.nl') || originalSrc?.startsWith('blob:')) {
                img.crossOrigin = 'anonymous'
            } else {
                console.warn(`⚠️ 导出${exportType === 'pdf' ? ' PDF' : '图片'}时 URL 异常:`, { originalSrc, currentSrc: img.src, itemId })
            }

            // 等待图片加载完成
            const waitForLoad = () => {
                if (img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
                    // 图片已加载，进行裁剪
                    cropImageFn(img, scale).then((croppedBase64) => {
                        if (croppedBase64) {
                            img.src = croppedBase64
                            img.style.width = '100px'
                            img.style.height = '133px'
                            img.style.objectFit = 'none'
                        } else {
                            console.warn(`⚠️ 导出${exportType === 'pdf' ? ' PDF' : '图片'}时裁剪失败，使用 CSS 方式:`, { itemId })
                            applySmartCropFn(img)
                        }
                        resolve()
                    }).catch((error) => {
                        console.error(`❌ 导出${exportType === 'pdf' ? ' PDF' : '图片'}时裁剪出错:`, { itemId, error })
                        applySmartCropFn(img)
                        resolve()
                    })
                } else {
                    // 图片未加载完成，等待加载
                    img.onload = waitForLoad
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
export function processEmptySlots(clonedDoc: Document): void {
    const emptySlots = clonedDoc.querySelectorAll('.tier-item.empty')
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
    clonedDoc: Document,
    options: {
        titleFontSize: number
        originalAppWidth: number
    }
): void {
    const { titleFontSize, originalAppWidth } = options

    // 确保 Header 样式正确
    const header = clonedDoc.querySelector('.header') as HTMLElement
    if (header) {
        header.style.paddingBottom = `${titleFontSize / 2}px`
        header.style.marginBottom = '0'
    }

    // 确保标题正常显示
    const clonedTitle = clonedDoc.querySelector('.title') as HTMLElement
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
    const clonedTierList = clonedDoc.querySelector('.tier-list') as HTMLElement
    if (clonedTierList) {
        clonedTierList.style.marginTop = '0'
        clonedTierList.style.paddingTop = '0'
    }

    // Tight 模式：移除所有留白
    const clonedApp = clonedDoc.querySelector('.app') as HTMLElement
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
    clonedDoc: Document,
    options?: { hideCandidates?: boolean; hideUnranked?: boolean }
): void {
    const { hideCandidates = true, hideUnranked = false } = options || {}

    // 隐藏按钮和操作栏
    clonedDoc.querySelectorAll('button, .btn, .header-actions').forEach((el: any) => el.style.display = 'none')

    const headerLeft = clonedDoc.querySelector('.header-left') as HTMLElement
    if (headerLeft) {
        headerLeft.style.display = 'none'
    }

    // 隐藏模态框
    const modals = clonedDoc.querySelectorAll('.modal-overlay, [class*="modal"]')
    modals.forEach((modal) => {
        (modal as HTMLElement).style.display = 'none'
    })

    // 隐藏候选框
    if (hideCandidates) {
        const candidatesBox = clonedDoc.querySelector('.candidates-box') as HTMLElement
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
        const dividers = clonedDoc.querySelectorAll('.divider')
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
export function syncThemeToClonedDoc(clonedDoc: Document): void {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'auto'
    clonedDoc.documentElement.setAttribute('data-theme', currentTheme)
}
