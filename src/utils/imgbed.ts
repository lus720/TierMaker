/**
 * CloudFlare ImgBed (Sanyue ImgHub) API 工具
 * 用于 Template 功能的图片上传、列出和删除。
 */

const IMGBED_BASE_URL = 'https://cloudflare-imgbed-34m.pages.dev'
const IMGBED_TOKEN = 'imgbed_NnIH6qqfUe2Jcl1a9Khr5x6Ah5fwd8Tw'
const TEMPLATE_ROOT_FOLDER = 'tiermaker_templates'
const PENDING_FOLDER = `${TEMPLATE_ROOT_FOLDER}/_pending`

function getHeaders(): Record<string, string> {
    return {
        'Authorization': `Bearer ${IMGBED_TOKEN}`
    }
}

/** 文件信息（List API 返回） */
export interface FileInfo {
    name: string  // 完整路径, e.g. "tiermaker_templates/test/image.png"
    metadata?: {
        FileName?: string
        FileType?: string
        FileSize?: string
        Directory?: string
        [key: string]: any
    }
}

/** List API 响应类型 */
export interface ListResponse {
    files: FileInfo[]
    directories: string[]  // 完整路径, e.g. ["tiermaker_templates/test"]
    totalCount: number
    directFileCount: number
    directFolderCount: number
    returnedCount: number
}

/** Upload API 响应类型 */
export interface UploadResult {
    src: string
}

/**
 * 列出指定目录下的文件和子目录
 * @param dir 目录路径，不传则列出根目录
 */
export async function listDir(dir?: string): Promise<ListResponse> {
    const url = new URL(`${IMGBED_BASE_URL}/api/manage/list`)
    if (dir) {
        url.searchParams.set('dir', dir)
    }

    const response = await fetch(url.toString(), {
        method: 'GET',
        headers: getHeaders()
    })

    if (!response.ok) {
        throw new Error(`列出目录失败: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    return data as ListResponse
}

/**
 * 列出所有可用的 Template 名称
 * @returns template 名称数组（仅名称，不含路径前缀）
 */
export async function listTemplates(): Promise<string[]> {
    try {
        const result = await listDir(TEMPLATE_ROOT_FOLDER)

        // directories 中包含完整路径如 "tiermaker_templates/test"
        // 需要提取最后一段作为模板名称
        return (result.directories || [])
            .map(dir => {
                const parts = dir.split('/')
                return parts[parts.length - 1]
            })
            .filter(name => !name.startsWith('_'))  // 过滤隐藏目录，如 _pending
    } catch (e) {
        console.error('[imgbed] listTemplates failed:', e)
        return []
    }
}

/**
 * 列出某个 template 下的所有图片文件 URL
 * @param templateName 模板名称
 * @returns 图片完整 URL 数组
 */
export async function listTemplateImages(templateName: string): Promise<string[]> {
    try {
        const folderPath = `${TEMPLATE_ROOT_FOLDER}/${templateName}`
        const result = await listDir(folderPath)

        // files 是对象数组，name 字段是完整路径如 "tiermaker_templates/test/image.png"
        return (result.files || []).map(file => {
            const filePath = typeof file === 'string' ? file : file.name
            return `${IMGBED_BASE_URL}/file/${filePath}`
        })
    } catch (e) {
        console.error('[imgbed] listTemplateImages failed:', e)
        return []
    }
}

/**
 * 上传文件到指定 template 文件夹
 * @param templateName 模板名称
 * @param file 要上传的文件
 * @returns 上传后的完整图片 URL
 */
export async function uploadToTemplate(templateName: string, file: File): Promise<string> {
    const uploadFolder = `${TEMPLATE_ROOT_FOLDER}/${templateName}`

    const url = new URL(`${IMGBED_BASE_URL}/upload`)
    url.searchParams.set('uploadFolder', uploadFolder)
    url.searchParams.set('uploadNameType', 'origin') // 保留原始文件名
    url.searchParams.set('returnFormat', 'default')

    const formData = new FormData()
    formData.append('file', file)

    const response = await fetch(url.toString(), {
        method: 'POST',
        headers: getHeaders(),
        body: formData
    })

    if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`上传失败: ${response.status} ${errorText}`)
    }

    const data: UploadResult[] = await response.json()

    if (!data || data.length === 0 || !data[0].src) {
        throw new Error('上传响应格式异常')
    }

    // data[0].src 格式为 "/file/xxx/yyy.jpg"，需要拼接域名
    const src = data[0].src
    if (src.startsWith('http')) {
        return src
    }
    return `${IMGBED_BASE_URL}${src}`
}

/**
 * 批量上传文件到 template
 * @param templateName 模板名称
 * @param files 文件列表
 * @param onProgress 进度回调 (已上传数, 总数)
 * @returns 所有上传后的图片 URL
 */
export async function uploadMultipleToTemplate(
    templateName: string,
    files: File[],
    onProgress?: (uploaded: number, total: number) => void
): Promise<string[]> {
    const urls: string[] = []

    for (let i = 0; i < files.length; i++) {
        const url = await uploadToTemplate(templateName, files[i])
        urls.push(url)
        onProgress?.(i + 1, files.length)
    }

    return urls
}

/**
 * 删除整个 template 文件夹
 * @param templateName 模板名称
 */
export async function deleteTemplate(templateName: string): Promise<boolean> {
    const folderPath = `${TEMPLATE_ROOT_FOLDER}/${templateName}`
    const url = `${IMGBED_BASE_URL}/api/manage/delete/${folderPath}?folder=true`

    const response = await fetch(url, {
        method: 'DELETE',
        headers: getHeaders()
    })

    if (!response.ok) {
        throw new Error(`删除模板失败: ${response.status}`)
    }

    const result = await response.json()
    return result.success === true
}

/**
 * 获取图床基础 URL
 */
export function getImgbedBaseUrl(): string {
    return IMGBED_BASE_URL
}

// ──────────────────────────────────────────────────────────
// 用户标识 & 待审核模板所有权（localStorage 持久化）
// ──────────────────────────────────────────────────────────

const PENDING_OWNERSHIP_KEY = 'tm_pending_templates'

/** 获取或生成当前用户 ID */
export function getUserId(): string {
    let id = localStorage.getItem('tm_user_id')
    if (!id) {
        id = crypto.randomUUID()
        localStorage.setItem('tm_user_id', id)
    }
    return id
}

/** 返回当前用户创建的全部待审核模板名称列表 */
export function getOwnedPendingTemplates(): string[] {
    try {
        return JSON.parse(localStorage.getItem(PENDING_OWNERSHIP_KEY) || '[]')
    } catch {
        return []
    }
}

/** 记录一个新建的待审核模板（所有权归当前用户） */
export function addOwnedPendingTemplate(name: string): void {
    const list = getOwnedPendingTemplates()
    if (!list.includes(name)) {
        list.push(name)
        localStorage.setItem(PENDING_OWNERSHIP_KEY, JSON.stringify(list))
    }
}

/** 从所有权记录中移除一个模板名称 */
export function removeOwnedPendingTemplate(name: string): void {
    const list = getOwnedPendingTemplates().filter(n => n !== name)
    localStorage.setItem(PENDING_OWNERSHIP_KEY, JSON.stringify(list))
}

// ──────────────────────────────────────────────────────────
// 待审核模板 API（路径: _pending/<templateName>/）
// ──────────────────────────────────────────────────────────

/**
 * 列出当前用户所拥有的待审核模板名称
 * （从 localStorage 读取所有权记录，无需遍历服务器目录）
 */
export function listPendingTemplates(): string[] {
    return getOwnedPendingTemplates()
}

/**
 * 列出某个待审核模板下的所有图片 URL
 */
export async function listPendingTemplateImages(templateName: string): Promise<string[]> {
    try {
        const folderPath = `${PENDING_FOLDER}/${templateName}`
        const result = await listDir(folderPath)
        return (result.files || []).map(file => {
            const filePath = typeof file === 'string' ? file : file.name
            return `${IMGBED_BASE_URL}/file/${filePath}`
        })
    } catch (e) {
        console.error('[imgbed] listPendingTemplateImages failed:', e)
        return []
    }
}

/**
 * 上传文件到待审核模板目录，并自动记录所有权
 */
export async function uploadToPendingTemplate(templateName: string, file: File): Promise<string> {
    const uploadFolder = `${PENDING_FOLDER}/${templateName}`

    const url = new URL(`${IMGBED_BASE_URL}/upload`)
    url.searchParams.set('uploadFolder', uploadFolder)
    url.searchParams.set('uploadNameType', 'origin')
    url.searchParams.set('returnFormat', 'default')

    const formData = new FormData()
    formData.append('file', file)

    const response = await fetch(url.toString(), {
        method: 'POST',
        headers: getHeaders(),
        body: formData
    })

    if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`上传失败: ${response.status} ${errorText}`)
    }

    const data: UploadResult[] = await response.json()
    if (!data || data.length === 0 || !data[0].src) {
        throw new Error('上传响应格式异常')
    }

    // 记录所有权
    addOwnedPendingTemplate(templateName)

    const src = data[0].src
    return src.startsWith('http') ? src : `${IMGBED_BASE_URL}${src}`
}

/**
 * 根据图片 URL 删除单个文件
 */
export async function deleteFileByUrl(imageUrl: string): Promise<boolean> {
    const marker = '/file/'
    const idx = imageUrl.indexOf(marker)
    if (idx === -1) throw new Error('无法解析图片路径')
    const filePath = imageUrl.slice(idx + marker.length)
    const url = `${IMGBED_BASE_URL}/api/manage/delete/${filePath}`
    const response = await fetch(url, {
        method: 'DELETE',
        headers: getHeaders()
    })
    if (!response.ok) {
        throw new Error(`删除图片失败: ${response.status}`)
    }
    const result = await response.json()
    return result.success !== false
}

/**
 * 批量上传到待审核模板
 */
export async function uploadMultipleToPendingTemplate(
    templateName: string,
    files: File[],
    onProgress?: (uploaded: number, total: number) => void
): Promise<string[]> {
    const urls: string[] = []
    for (let i = 0; i < files.length; i++) {
        const url = await uploadToPendingTemplate(templateName, files[i])
        urls.push(url)
        onProgress?.(i + 1, files.length)
    }
    return urls
}

/**
 * 删除整个待审核模板文件夹，并从所有权记录中移除
 */
export async function deletePendingTemplate(templateName: string): Promise<boolean> {
    const folderPath = `${PENDING_FOLDER}/${templateName}`
    const url = `${IMGBED_BASE_URL}/api/manage/delete/${folderPath}?folder=true`

    const response = await fetch(url, {
        method: 'DELETE',
        headers: getHeaders()
    })

    if (!response.ok) {
        throw new Error(`删除待审核模板失败: ${response.status}`)
    }

    const result = await response.json()
    if (result.success !== false) {
        removeOwnedPendingTemplate(templateName)
        return true
    }
    return false
}
