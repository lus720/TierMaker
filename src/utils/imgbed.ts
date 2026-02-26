/**
 * CloudFlare ImgBed (Sanyue ImgHub) API 工具
 * 用于 Template 功能的图片上传、列出和删除。
 */

const IMGBED_BASE_URL = 'https://cloudflare-imgbed-34m.pages.dev'
const IMGBED_TOKEN = 'imgbed_NnIH6qqfUe2Jcl1a9Khr5x6Ah5fwd8Tw'
const TEMPLATE_ROOT_FOLDER = 'tiermaker_templates'

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
        return (result.directories || []).map(dir => {
            const parts = dir.split('/')
            return parts[parts.length - 1]
        })
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
