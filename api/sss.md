API 基本介绍
CloudFlare ImgBed 提供了一系列 API 接口，方便用户和开发者进行文件上传、删除、列出，以及随机图获取等操作。

此外，项目还支持标准的 WebDAV 协议，方便用户通过 WebDAV 客户端进行文件管理，详细介绍请查看 WebDAV 文档。

API 端点
上传 API：/upload
删除 API：/api/manage/delete
列出 API：/api/manage/list
随机图 API：/random
鉴权方式
对于所有需要鉴权的接口，除另行说明外，统一采用 API Token 鉴权方式。用户需要在上传时提供有效的 API Token，才能进行相关操作。

API Token 获取
用户可以在 CloudFlare ImgBed 的管理界面->系统设置->安全设置->API Token管理处生成 API Token。生成后，请妥善保存，因为出于安全考虑，Token 只会显示一次。

注意

尽量根据所需操作设置 Token 的权限，避免使用过于宽泛的权限。

请勿将 API Token 泄露给他人，避免造成不必要的安全风险。

API Token 使用
在调用 API 时，需要在请求头中添加以下字段：

Authorization: Bearer YOUR_API_TOKEN
或者
Authorization: YOUR_API_TOKEN
使用示例：

curl -X POST "<https://your-cloudflare-imgbed-url/upload>" \
-H "Authorization: Bearer YOUR_API_TOKEN" \
-F "file=@/path/to/your/image.jpg"

上传 API
上传 API 支持通过第三方上传文件至 CloudFlare ImgBed，便于集成到各种应用和服务中。

基本信息
端点：/upload
方法：POST
认证：使用上传认证码或 API Token（需要upload权限）
内容类型：multipart/form-data
文件大小限制：根据存储渠道而定
请求参数
Query 参数
参数名 类型 必需 默认值 说明
authCode string 否 - 上传认证码
serverCompress boolean 否 true 服务端压缩（仅针对 Telegram 渠道的图片文件）
uploadChannel string 否 telegram 上传渠道：telegram、cfr2、s3、discord、huggingface
channelName string 否 - 指定渠道名称，用于多渠道场景下选择特定渠道上传。可通过 /api/channels 获取可用渠道列表
autoRetry boolean 否 true 失败时自动切换渠道重试
uploadNameType string 否 default 文件命名方式，可选值为[default, index, origin, short]，分别代表默认前缀_原名命名、仅前缀命名、仅原名命名和短链接命名法，默认为default
returnFormat string 否 default 返回链接格式，可选值为[default, full]，分别代表默认的/file/id格式、完整链接格式
uploadFolder string 否 - 上传目录，用相对路径表示，例如上传到 img/test 目录需填img/test
Body 参数
参数名 类型 必需 说明
file File 是 要上传的文件
分块上传参数
使用分块上传时，需要以下额外参数：

参数名 类型 必需 说明
initChunked boolean 否 设置为 true 以初始化分块上传会话
chunked boolean 否 上传分块或合并时设置为 true
merge boolean 否 请求合并分块时设置为 true
uploadId string 是 * 分块上传和合并请求必需（由初始化返回）
chunkIndex integer 是* 上传分块时必需（从 0 开始的索引）
totalChunks integer 是 * 初始化、上传分块和合并请求必需
originalFileName string 是* 初始化、上传分块和合并请求必需
originalFileType string 是 * 初始化、上传分块和合并请求必需
分块上传流程
初始化：发送 POST 请求，携带 initChunked=true、totalChunks、originalFileName 和 originalFileType。服务器返回 uploadId。
上传分块：对于每个分块，发送 POST 请求，携带 chunked=true、uploadId、chunkIndex、totalChunks、originalFileName、originalFileType 和分块 file。
注意：分块上传是同步的。服务器会等待分块上传到存储提供商后才响应。
合并：所有分块上传完成后，发送 POST 请求，携带 chunked=true、merge=true、uploadId、totalChunks、originalFileName 和 originalFileType。
注意：合并过程是同步的。服务器会等待文件合并完成并返回最终结果。
响应格式
data[0].src为获得的图片链接（注意不包含域名，需要自己添加）

示例
请求示例

 curl --location --request POST '<https://your.domain/upload?authCode=your_authCode>' \

 --header 'User-Agent: Apifox/1.0.0 (<https://apifox.com>)' \

 --form 'file=@"D:\\杂文件\\壁纸\\genshin109.jpg"'
响应示例

[
  {
    "src": "/file/abc123_image.jpg"
  }
]渠道列表 API
获取当前配置的所有可用上传渠道列表，用于在上传时指定具体渠道。

基本信息
端点：/api/channels
方法：GET
认证：无需认证
响应格式
返回一个对象，包含各渠道类型及其对应的渠道列表。

响应示例

{
  "telegram": [
    { "name": "主渠道", "type": "telegram" },
    { "name": "备用渠道", "type": "telegram" }
  ],
  "cfr2": [
    { "name": "R2存储", "type": "cfr2" }
  ],
  "s3": [
    { "name": "S3主存储", "type": "s3" }
  ],
  "discord": [
    { "name": "Discord渠道", "type": "discord" }
  ],
  "huggingface": [
    { "name": "HF仓库", "type": "huggingface" }
  ]
}
使用说明
调用此 API 获取可用渠道列表
在上传时通过 uploadChannel 参数指定渠道类型（如 telegram）
通过 channelName 参数指定具体渠道名称（如 主渠道）
如果不指定 channelName，系统将根据负载均衡设置自动选择渠道
请求示例

curl --location --request GET '<https://your.domain/api/channels>'

删除 API
删除 API 支持删除 CloudFlare ImgBed 中的文件，包括单个文件删除和批量文件夹删除功能。

基本信息
端点：/api/manage/delete/{path}
方法：GET
认证：需要delete权限
内容类型：application/json
请求参数
路径参数
参数名 类型 必需 说明
path string 是 文件或文件夹路径（如 file.png 或 your/folder）
Query 参数
参数名 类型 必需 默认值 说明
folder boolean 否 false 是否为文件夹删除，true表示删除整个文件夹及其内容
功能说明
单文件删除
当 folder 参数为 false 或未提供时，删除指定的单个文件。

文件夹删除
当 folder 参数为 true 时，递归删除指定文件夹及其所有子文件夹和文件。

响应格式
单文件删除成功响应

{
  "success": true,
  "fileId": "example/image.jpg"
}
文件夹删除成功响应

{
  "success": true,
  "deleted": [
    "folder/image1.jpg",
    "folder/image2.png",
    "folder/subfolder/image3.gif"
  ],
  "failed": []
}
错误响应

{
  "success": false,
  "error": "Delete file failed"
}
示例
删除单个文件

curl --location --request DELETE '<https://your.domain/api/manage/delete/example/image.jpg>' \
--header 'Authorization: Bearer your_token'
删除文件夹

curl --location --request DELETE '<https://your.domain/api/manage/delete/example/folder?folder=true>' \
--header 'Authorization: Bearer your_token'
