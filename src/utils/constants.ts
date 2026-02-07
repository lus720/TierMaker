export const DEFAULT_IMAGE_BASE64 = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2VlZSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTQiIGZpbGw9IiM5OTkiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj7lm77niYfliqDovb3lpLHotKU8L3RleHQ+PC9zdmc+'

// Helper to convert base64 to Blob
function base64ToBlob(base64: string): Blob {
    const parts = base64.split(';base64,')
    const contentType = parts[0].split(':')[1]
    const raw = window.atob(parts[1])
    const rawLength = raw.length
    const uInt8Array = new Uint8Array(rawLength)
    for (let i = 0; i < rawLength; ++i) {
        uInt8Array[i] = raw.charCodeAt(i)
    }
    return new Blob([uInt8Array], { type: contentType })
}

let defaultImageBlob: Blob | null = null
let defaultImageUrl: string | null = null

/**
 * 获取默认图片的 Blob 和 URL
 * @returns { blob: Blob, url: string }
 */
export function getDefaultImage(): { blob: Blob, url: string } {
    if (!defaultImageBlob) {
        defaultImageBlob = base64ToBlob(DEFAULT_IMAGE_BASE64)
        defaultImageUrl = URL.createObjectURL(defaultImageBlob)
    }
    return { blob: defaultImageBlob, url: defaultImageUrl! }
}
