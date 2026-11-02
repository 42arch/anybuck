# Cloudstore — 技术架构与实现状态

更新日期：2026-11-02

桌面应用 · 本地优先 · 多云可扩展

## 当前实现状态（2026-11-02）

- 前端支持浅色、深色和“跟随系统”主题偏好，设置持久化在本机。主题同时作用于侧边栏与内容区域；切换立即生效，“跟随系统”会响应系统外观变化。首次默认浅色。“通用”设置还可选择默认文件视图（列表或网格），文件管理视图打开时使用该偏好。
- 前端界面已接入简体中文、英语和“跟随系统”语言偏好。偏好由现有 Zustand 设置存储持久化到本机，应用启动时初始化 `i18next`，运行中切换立即生效；页面、弹窗、通知及选择器标题使用前端词条，文件列表日期和名称排序按当前语言处理。Rust 内部使用带稳定错误码、参数及可选原始详情的 `AppError`，Tauri 命令将其传给前端翻译；传输任务持久化错误码和原始详情，旧记录仍可显示。兼容性检查逐项返回诊断码，由前端按语言显示，系统和服务端原始错误保留供排查。词条维护方式见 `docs/i18n.md`。
- 桌面正式安装包集成 Tauri updater：启动时自动检查 GitHub 已发布 Release 的 `latest.json`，设置页支持手动检查、查看更新说明、下载并安装。更新包由独立的 Tauri 更新密钥签名，客户端校验签名及版本；运行中或排队中的传输任务会推迟安装。GitHub Actions 从仓库 Secret 读取私钥，生成各平台更新产物及元数据；首次启用前需配置 Secret 并发布带 updater 的安装包，旧安装包需手动升级一次。私钥配置和发布步骤见 `docs/updates.md`。
- macOS 构建使用平台专属 Tauri 配置进行 ad-hoc 代码签名，不进行 Apple 公证；通过 GitHub 或官网分发时，用户首次打开可能需要在系统隐私与安全性设置中手动放行。ad-hoc 代码签名与 Tauri 更新包签名相互独立。
- 已增加七牛云 Kodo 和火山引擎 TOS 连接。Kodo 使用 `https://s3.<region>.qiniucs.com`、S3 空间名及路径式寻址；连接现有空间时不套用新建空间的命名规则，实际 S3 空间名仍需以七牛空间概览为准。其 S3 API 域名要求签名，因此公开链接需配置已绑定空间的域名。TOS 使用 `https://tos-s3-<region>.volces.com` 和虚拟主机寻址，默认公开对象地址使用 `https://<bucket>.tos-<region>.volces.com/<key>`；Region 输入需填写 Region ID，不包含 Endpoint 的 `tos-` 前缀。两者当前只接受长期 AK/SK，密钥分别保存在系统凭证库的独立服务项中，对象浏览及传输队列复用现有 S3 实现。尚未用真实 Kodo/TOS Bucket 验证上传、删除、复制、移动及错误恢复等兼容操作。
- 已增加 Google Cloud Storage 连接入口，使用 GCS XML API、`https://storage.googleapis.com` 路径式 Endpoint 和系统凭证库中的 HMAC 互操作密钥。签名地域使用 `us-east-1`；表单不要求填写 Bucket 所在地域，也不接受服务账号 JSON 密钥。连接成功时会执行首目录的 `ListObjectsV2` 请求。文件浏览、上传、下载、删除、预览和队列操作复用现有 S3 实现。文件详情分别显示需 Google 账号登录的 `https://storage.cloud.google.com/<bucket>/<key>` 浏览器链接，以及通过匿名请求检查的 `https://storage.googleapis.com/<bucket>/<key>` 公开链接；仅匿名检查成功时标为公开，可按连接配置自定义公开域名。现阶段尚未用真实 GCS Bucket 实测所有操作；特别是大于 5 GiB 的服务端复制与移动所用的 S3 `UploadPartCopy` 路径尚未确认兼容。

- 已增加 AWS S3、腾讯云 COS 和阿里云 OSS 连接。连接层按 `provider` 分发到 `connection/aws.rs`、`connection/r2.rs`、`connection/cos.rs` 或 `connection/oss.rs`；AWS S3 由 SDK 根据所填 Region 解析服务端点，支持中国区域域名，表单支持可选 Session Token；COS 使用 `https://cos.<region>.myqcloud.com` 和带 APPID 的完整 Bucket 名称，OSS 的 S3 客户端使用 `https://s3.oss-<region>.aliyuncs.com`，两者均使用虚拟主机寻址；OSS 默认公开对象地址使用 `https://<bucket>.oss-<region>.aliyuncs.com`。对象操作及传输队列复用现有 S3 实现。各服务商的凭证保存在独立的系统凭证库服务项中。COS/OSS 表单仍只使用长期密钥，不支持临时密钥的 Session Token；部分中国大陆新账号可能受默认公网域名访问限制，连接表单尚未支持 Bucket 自定义 CNAME API Endpoint；未经真实 AWS/COS/OSS Bucket 验证的兼容操作仍需实测。
- Tauri 后端已通过 `aws-sdk-s3` 支持 Cloudflare R2 连接校验和指定 Bucket 的 `ListObjectsV2` 预览，包含 continuation token 分页。
- 支持同时添加和切换多个 R2/S3/COS/OSS/GCS/Kodo/TOS 连接；连接元数据保存在应用数据目录，每个连接的凭证分别保存在系统凭证库。应用启动时仅读取已保存连接，所有连接默认为断开状态，单击连接名称可切换当前选择（即使连接断开），双击连接名称可直接连接；右键菜单可切换、连接、断开或重命名。已保存连接的重命名会更新本地连接元数据；仅本次运行的连接只在当前会话内改名，不修改 Bucket、Endpoint 或凭证。设置页按分组提供左侧选项导航，右侧显示所选分组的具体设置；“连接管理”分组右侧列出全部连接并提供删除操作。添加连接在 Dialog 中进行；未勾选记住时连接只在当前进程内有效。
- 连接管理可编辑已保存连接的名称、Bucket、地域及 R2 Endpoint，并可选择整组更新访问密钥（AWS 可同时替换或清除 Session Token）；服务商保持不变。表单不会读出旧密钥。保存前使用新配置实际列举 Bucket，成功后更新本机元数据、系统凭证库及当前会话，并清除旧的对象列表缓存与兼容性检查结果；目标 Bucket 或 Endpoint 变化时还会清除该连接的公开域名配置。验证失败时保留原连接。若该连接仍有待处理或可重试的传输任务，禁止将其改指其他 Bucket、地域或 Endpoint，以免旧任务重试时误用新目标；重试时也会核对任务记录中的源与目标 Bucket。只修改名称或凭证不受此限制。临时连接需重新添加。
- 侧边栏只显示已有连接的服务提供商分组，再列出连接名称，连接树可折叠；添加连接在 Dialog 中进行，连接名称可选，留空时使用 Bucket 名称。本期不显示用户或登录入口。
- 文件详情通过工具栏和对象操作菜单打开弹窗，不占用文件列表旁的固定侧栏；弹窗内保留对象元数据、链接检查、复制、下载、打开文件夹和删除入口。
- 文件浏览器的统一上传按钮可选择本地文件或文件夹，拖拽可同时接收文件和文件夹；文件浏览器还支持下载文件或递归下载虚拟目录、创建虚拟文件夹，以及单个和批量删除、复制、移动对象；拖拽上传复用确认弹窗和传输队列，文件夹上传保留目录层级，并为无文件的目录写入目录标记。网格文件项和列表文件行可右键打开与“更多操作”按钮相同的菜单。文件详情可显示并复制对象地址；R2/Kodo 的 S3 API 地址以及 S3/COS/OSS/GCS/TOS 私有对象地址不能直接作为公开链接访问。连接管理可为每个存储连接独立配置公开访问域名，设置按连接 ID 保存，同一 Bucket 的不同连接互不共享；文件详情优先显示已配置域名生成的链接，并通过不带凭证的范围 GET 请求显示匿名访问状态；仅在验证成功时将其标为公开文件链接，检查失败时提供状态和重新检查入口。S3/COS/OSS/GCS/TOS 未配置域名时检查默认对象地址，R2/Kodo 需要用户填写各自已启用的公开域名；公开域名只保存在本机设置中，不会修改云端公开访问配置。图片和常见 UTF-8 文本文件可从网格和列表菜单打开预览，文件详情只显示元数据和对象链接。预览通过已连接的 S3 客户端读取对象，支持失败重试，图片限制为 8 MiB、文本限制为 1 MiB，二进制数据通过 Tauri IPC 传输，不依赖公开读权限。上传前会确认所选本地项目数量和目标目录，上传期间右下角显示当前文件名。上传和下载由 Rust 流式读写，不经前端或 IPC 中转；下载时会校验对象 Key 对应的本地路径，防止路径穿越。选择虚拟目录删除、复制或移动时会分页枚举其前缀下的对象。复制在同一 Bucket 内保留源对象，移动先复制后删除；大对象使用分片复制。目标目录已有同名项目时跳过，并向界面反馈部分失败结果。
- 设置页增加“下载管理”分组，可选择和清除默认下载路径；该偏好保存在本机，下载时直接使用所设目录。首次下载时若尚未设置，会要求选择目录并将其保存为默认路径。
- 文件管理、传输任务、最近访问和设置等主视图通过 React Router 的 Hash 路由切换。
- 前端通过 TanStack Query 管理对象列表和已保存连接查询缓存；Zustand 管理当前进程内的活动连接、文件传输与弹窗等客户端共享状态。对象列表按连接、目录和搜索词缓存，删除后使对应连接的对象列表失效。批量选择保留已选项目，翻页后下载、复制、移动和删除作用于同一组项目；切换目录或搜索词会清空选择。
- 前端不再填充演示 Bucket、对象、最近访问或传输任务；未连接时展示空状态和添加连接弹窗入口。
- 上传、下载、同连接复制／移动及跨连接迁移均使用 Rust 传输队列，最多并发两个根对象任务，支持取消及手动重试。文件夹操作生成父子任务。上传可跳过同名、覆盖同名或保留两份，默认跳过；下载可覆盖或跳过。普通上传达到 100 MiB 时使用 Multipart Upload，分片从 16 MiB 起并按文件大小增大，最多 10,000 片；小文件使用单次 PUT。上传和下载流式传输并推送字节进度，成功响应确认后任务才完成。任务保存在应用数据目录的 `transfers.json`，最多保留 100 个已结束根任务；重启时排队和运行中的任务改为中断，不自动续传。当前没有暂停、自动重试或跨重启分片恢复；异常退出或中止请求失败时，云端未完成分片可能残留。
- 上传确认可选择跳过同名、覆盖同名或保留两份，默认跳过。文件夹上传递归扫描所选目录，保留顶层文件夹名和相对路径，空目录使用零字节目录标记；扫描时拒绝符号链接及不支持的文件类型，单次最多 10,000 个文件或空目录、50,000 个本地项目。同一批所选项目会生成相同对象 Key 时，仅“保留两份”可入队，避免并发任务对同一 Key 的结果不确定。非覆盖模式在执行时先检查对象是否存在，并通过条件 `PutObject` 防止检查后的并发覆盖；保留两份使用 `文件名 (1).扩展名` 等可用名称。策略随任务保存，失败重试继续使用原策略。非覆盖模式需要对象 HEAD 权限及服务商支持 `If-None-Match` 条件写入；不支持时任务会失败，兼容性仍需真实 Bucket 验证。
- 连接管理提供手动运行的真实 Bucket 兼容性验证。快速检查在唯一的 `__cloudstore-compat/` 子前缀下验证列举、PUT/HEAD/GET 内容、条件 PUT 同名保护、分页、复制和删除；完整检查再经普通上传实现上传 100 MiB 稀疏测试文件，验证分片结果、分片中止，以及 `CompleteMultipartUpload` 的同名保护。各步骤独立报告通过、失败、不支持、权限不足或跳过；测试结束后尝试中止残留分片、删除测试对象，并列出无法清理的资源。此功能不自动改变连接配置或上传策略，且仅能证明运行时该 Bucket、凭证与 Endpoint 的行为；启用版本控制的 Bucket 可能在删除当前对象后保留历史测试版本。
- 复制和移动也接入同一任务队列，任务中心按上传、下载、复制与移动分组。文件夹操作分页枚举后创建父子任务，单次服务端复制按对象完成更新进度，大对象分片复制按已完成分片更新进度。移动在复制后保存源和目标的 ETag 检查点，再验证两端状态并删除源对象；删除阶段失败时可从检查点重试。复制和移动的取消会终止客户端任务，但已发出的云端请求可能继续完成，界面会提示核查源和目标位置。若复制已在云端完成而检查点尚未保存，重试会因目标冲突而停止，不会覆盖目标对象。
- 复制和移动弹窗现可选择另一条已连接的目标连接及其目录。运行时以服务商、Bucket 名和规范化的 API Endpoint 判定两个连接是否指向同一 Bucket，用于阻止复制到原位置或文件夹子目录；不同 Endpoint 别名指向同一 Bucket 时可能无法识别。同连接沿用服务端复制，不同连接即使指向同一 Bucket 仍使用各自凭证经本机传输。跨连接任务由 Rust 按对象下载到系统临时目录，再上传至目标，达到 100 MiB 时使用目标端分片上传。每次最多并发两个对象，临时磁盘占用最多约为两个对象的总大小。目标同名项目不覆盖；文件夹分页枚举并生成父子任务。跨连接移动在目标上传后逐字节读回核对内容，保存源和目标的大小与 ETag 检查点，再确认两端未变化才以 `If-Match` 条件删除源对象；复制或验证失败时保留源对象，删除阶段失败可从检查点重试，删除请求发出后取消则需要核查两端。跨连接复制仅校验目标大小及源对象前后 ETag，不能证明内容逐字节一致。传输保留 Content-Type、缓存控制、内容编码、内容语言、下载文件名和自定义元数据，不迁移对象版本、标签或 ACL。传输需要源端流出流量、本机下载与目标端上传，移动验证还需读取目标对象；应用异常退出时临时文件可能残留。当前不支持跨重启续传、整个 Bucket 同步或跨云服务端直传，服务商的条件请求和分片上传兼容性仍需真实存储桶验证。

## 一、项目定位与目标

开发一款基于 Tauri 的跨云对象存储桌面管理工具。首个阶段支持 Cloudflare R2，现已增加 AWS S3、腾讯云 COS、阿里云 OSS、Google Cloud Storage、七牛云 Kodo 和火山引擎 TOS 连接；MinIO 等服务商是后续扩展方向。

核心设计原则：对象操作尽量复用 S3 兼容能力，将服务商差异限制在连接配置与必要的兼容处理内。

技术路线确定为：

- 前端： React + TypeScript + Vite + Tailwind CSS + shadcn/ui
- 桌面端： Tauri 2
- 存储引擎： Rust + `aws-sdk-s3`
- 任务调度： Tokio
- 本地数据：传输任务元数据暂存应用数据目录 JSON；SQLite 是后续扩展方向
- 凭证管理： 系统凭证库或 Stronghold
- 后端服务： 不需要

Cloudflare 官方提供 Rust AWS SDK 接入示例，R2 能通过标准 S3 API 实现 MVP 的主要对象操作。

[image](https://www.google.com/s2/favicons?domain=https://developers.cloudflare.com\&sz=32)

Cloudflare R2 docs

+1



## 二、MVP 功能范围

| 模块        | MVP 功能                | 优先级  |
| --------- | --------------------- | ---- |
| 连接管理      | 添加、编辑、删除 R2 连接        | P0   |
| Bucket 管理 | 浏览 Bucket、手动添加 Bucket | P0   |
| 文件管理      | 文件列表、目录导航、分页加载        | P0   |
| 文件上传      | 多文件上传、文件夹上传、拖拽上传      | P0   |
| 文件下载      | 单文件下载、批量下载            | P0   |
| 文件操作      | 批量删除、重命名、移动           | P0   |
| 传输任务      | 进度、并发、取消、失败重试         | P0   |
| 文件信息      | 大小、类型、修改时间、对象 Key     | P0   |
| 大文件上传     | Multipart Upload      | P0   |
| 任务恢复      | 重启后恢复未完成的分片上传         | P1   |
| 文件预览      | 图片、文本、JSON 等          | P1   |
| 跨云迁移      | 已连接存储桶之间的复制和移动   | 已实现基础能力 |
| 目录同步      | 本地与云端双向同步             | 后续版本 |

P0 构成首个可交付版本。P1 是升级方向，不影响核心架构。

特别说明：拥有特定 Bucket 的 Object Read & Write 权限，不代表能够列出账户下所有 Bucket。因此 MVP 应支持用户手动添加 Bucket，自动发现作为权限允许时的增强能力。

[image](https://www.google.com/s2/favicons?domain=https://developers.cloudflare.com\&sz=32)

Cloudflare R2 docs

+1



## 三、整体技术架构

Presentation Layer

React · shadcn/ui · Zustand · TanStack Query

连接管理 / 文件浏览器 / 文件操作 / 上传队列

Tauri IPC / Channel

Application Layer · Rust

应用服务层

ConnectionManager

FileManager

TransferManager

CredentialManager

Storage Abstraction Layer

统一 StorageBackend 接口 / Provider Registry

S3CompatibleBackend

aws-sdk-s3 · 统一对象存储协议

连接配置按服务商构建 `aws-sdk-s3` 客户端，共用 S3 对象操作、传输与迁移实现；凭证通过系统凭证库保存，连接和任务元数据保存为本地 JSON。

架构主要分四层：

1. Presentation： 只关心 UI 状态、用户交互及展示。
2. Application： 负责文件操作编排、连接管理和任务调度。
3. Storage Abstraction： 定义统一的数据模型、文件操作接口及能力声明。
4. Infrastructure： 实现 S3 请求、文件流、数据库持久化及密钥管理。

所有云端 API 请求都由 Rust 发起，文件数据不需要通过 React 或 Tauri IPC 中转。IPC 只传递命令、元数据与进度通知。

## 四、多服务商扩展设计

本节描述扩展原则，不代表已实现通用 Backend Trait、Provider Registry 或能力协商框架。当前由 `connection/<provider>.rs` 配置不同 S3 客户端，其余操作复用 `storage/s3`。

这是整个方案中最需要提前设计好的部分。

不建议每个服务商分别实现完整的 Adapter。 因为 R2、OSS、COS 都支持相当一部分 S3 API，更合理的方式是：

- S3CompatibleBackend：封装通用对象操作。
- ProviderProfile：封装不同厂商的连接参数和兼容性差异。
- ProviderExtension：用于未来支持非标准 S3 API 的功能。

### 4.1 统一存储接口

使用 Rust Trait 定义接口：

```
#[async_trait]
pub trait StorageBackend: Send + Sync {
    async fn list_objects(
        &self,
        request: ListObjectsRequest,
    ) -> Result<ObjectPage, StorageError>;

    async fn head_object(
        &self,
        bucket: &str,
        key: &str,
    ) -> Result<ObjectInfo, StorageError>;

    async fn delete_objects(
        &self,
        bucket: &str,
        keys: &[String],
    ) -> Result<(), StorageError>;

    async fn copy_object(
        &self,
        request: CopyObjectRequest,
    ) -> Result<(), StorageError>;
}
```

上传和下载建议单独设计接口，因为需要支持流式传输及任务控制：

```
#[async_trait]
pub trait ObjectTransfer: Send + Sync {
    async fn put_object(
        &self,
        request: PutObjectRequest,
    ) -> Result<(), StorageError>;

    async fn get_object(
        &self,
        request: GetObjectRequest,
    ) -> Result<(), StorageError>;
}
```

分片上传再定义 `MultipartTransfer` 能力接口，包含 CreateMultipart、UploadPart、ListParts、CompleteMultipart 和 AbortMultipart 操作。

由 `TransferManager` 调度上传任务，由具体 Backend 执行 I/O。

这样后续即使某个厂商需要使用原生 SDK，也不会影响 React 和任务调度层。

### 4.2 ProviderProfile 配置

使用统一的数据结构描述服务商连接。

```
type ProviderType =
  | "cloudflare-r2"
  | "aws-s3"
  | "aliyun-oss"
  | "tencent-cos"
  | "minio";

interface StorageConnection {
  id: string;
  name: string;

  provider: ProviderType;

  endpoint: string;
  region: string;

  accessKeyId: string;
  secretRef: string;

  bucketNames?: string[];

  options: {
    forcePathStyle?: boolean;
  };
}
```

注意 `secretRef` 只保存安全凭证存储中的引用，不保存 Secret Access Key 明文。

Cloudflare R2 对应配置：

```
{
  provider: "cloudflare-r2",
  endpoint:
    "https://<ACCOUNT_ID>.r2.cloudflarestorage.com",
  region: "auto",
  options: {
    forcePathStyle: true
  }
}
```

R2 的 EU、US 等特定管辖区可能需要不同的 Endpoint，所以 Endpoint 应当可配置，而不能全部由 Account ID 固定拼接。

[image](https://www.google.com/s2/favicons?domain=https://developers.cloudflare.com\&sz=32)

Cloudflare R2 docs

+1



### 4.3 服务商能力声明

未来不同厂商不一定支持完全一致的能力，建议增加 `StorageCapabilities`：

```
interface StorageCapabilities {
  listBuckets: boolean;
  multipartUpload: boolean;
  serverSideCopy: boolean;
  presignedUrl: boolean;
  objectMetadata: boolean;
}
```

连接建立后获取能力声明，由前端决定展示哪些操作。

更细粒度的权限（例如只读或只允许访问某个 Bucket）还需要通过用户配置、实际请求结果判断，不能仅依赖服务商类型。

## 五、传输与迁移架构

当前实现由 `transfers` 任务管理层、`storage/s3` I/O 层和前端任务中心组成。Rust 负责扫描与规划、并发调度、云端读写和进度更新；React 负责展示状态、提交操作、取消和发起重试。

### 5.1 上传执行流程

当前上传阈值和分片大小：

| 参数             | 默认值             |
| -------------- | --------------- |
| Multipart 触发阈值 | 100 MiB         |
| 分片大小           | 16 MiB，超大文件动态增大 |
| 同时处理的根任务数      | 2               |
| 单文件分片并发        | 逐片顺序上传          |
| 自动网络重试         | 不支持             |

### 5.2 TransferManager

任务管理器负责独立于服务商客户端的任务生命周期。当前状态包括排队、运行、完成、失败、取消、中断和跳过；没有暂停状态。

任务状态的 TypeScript 示意如下；Rust 的实际持久化模型见 `src-tauri/src/transfers/model.rs`：

```
type TransferStatus =
  | "queued" | "running" | "completed"
  | "failed" | "cancelled" | "interrupted" | "skipped";

interface TransferTask {
  id: string;
  connectionId: string;

  type: "upload" | "download" | "copy" | "move";

  bucket: string;
  key: string;
  localPath: string;

  totalBytes: number;
  transferredBytes: number;

  status: TransferStatus;
  error?: string;
}
```

当前行为：

- 使用 Tokio Semaphore 控制最多两个根任务并发；单个 Multipart 文件按片顺序上传。
- 按任务 ID 取消任务；手动重试会创建新任务，沿用原任务的冲突策略。
- 状态通过 `transfer-task-updated` Tauri 事件推送，进入任务中心时读取任务快照。
- 启动时将遗留的排队／运行任务标记为中断；不会自动恢复。

进度通过 Tauri 事件报告。任务记录不保存 Multipart 会话或已完成分片，因此进程重启后无法续传；失败或取消时尽力中止未完成上传。跨重启恢复需要额外持久化 Upload ID、源文件身份和分片 ETag，目前未实现。

## 六、文件浏览与管理

对象存储并不是真正的文件系统，因此需要在应用层模拟文件夹。

### 6.1 目录浏览

使用 `ListObjectsV2`：

```
{
  bucket: "assets",
  prefix: "images/",
  delimiter: "/",
  continuationToken: undefined
}
```

返回数据转换为统一的：

```
interface ObjectInfo {
  key: string;
  name: string;
  kind: "file" | "directory";

  size?: number;
  etag?: string;
  lastModified?: string;
  contentType?: string;
}

interface ObjectPage {
  objects: ObjectInfo[];
  nextToken?: string;
}
```

其中目录主要根据 `CommonPrefixes` 和对象 Key 进行虚拟化展示。

必须支持服务端分页，不要一次递归加载整个 Bucket。

文件列表以每页 100 个逻辑条目展示，并在分页器中显示当前目录的总数。S3 ListObjectsV2 没有直接返回目录总数的接口，因此后端使用相同的 Prefix 和 Delimiter 遍历当前目录所有分页，统计文件和虚拟目录数量；该统计会额外产生与目录大小成比例的 ListObjectsV2 请求。名称包含搜索同样扫描当前目录的所有分页，匹配结果仍按 continuation token 分页返回。分页列表按需读取，不会将整个目录对象元数据传到前端。

### 6.2 文件操作

文件浏览器应支持：

- 多选、批量删除、复制和移动
- 拖拽文件上传
- 上传整个文件夹
- 下载文件及整个虚拟目录
- 当前页名称排序、当前目录名称包含搜索（搜索会分页扫描当前目录，目录越大请求越多）
- 文件信息及对象 Key 复制
- 图片在线预览（单张不超过 8 MiB）
- UTF-8 文本预览（单个文件不超过 1 MiB）

特别注意：对象重命名、移动通常需要 CopyObject + DeleteObject。对于超过单次 CopyObject 限制的大对象，还可能需要 Multipart Copy，不能仅靠普通 CopyObject 覆盖所有情况。

此外，批量删除必须处理部分成功、部分失败的响应；目录批量操作需要迭代分页，不能只处理当前显示的文件。

下载目录时还要对对象 Key 做路径安全处理，防止包含 `..` 等特殊片段的 Key 写入预期目录之外。

## 七、本地持久化设计

当前持久化方式如下：

- 已保存连接元数据写入应用数据目录的 JSON 文件；启动时恢复连接列表，但不会自动连接。临时连接不持久化。
- 访问密钥写入操作系统凭证库，连接元数据不包含密钥。AWS 可选 Session Token 与其他服务商凭证按连接独立保存。
- 用户设置由 Zustand 持久化到本机，包括主题、语言、默认文件视图、下载目录及公开域名配置。
- 传输任务写入应用数据目录的 `transfers.json`，不保存完整 Bucket 索引。终态根任务最多保留 100 条；旧任务格式通过默认值兼容读取。
- 当前没有 SQLite，也没有 Multipart 分片会话持久化。不得将密钥、签名 URL 或其他凭证写入普通配置和日志。

## 八、项目目录结构

采用单仓库，前端和 Rust 后端分别按职责组织，不需要在 MVP 阶段拆成多个独立服务。
以下为当前前端与 Rust 代码结构。连接按 `provider` 分发到服务商配置模块，共用 S3 对象操作实现；当前没有通用的 Provider 插件注册表。

```
cloud-storage-manager/
├── src/
│   ├── api/                # 按连接、对象、传输拆分 Tauri IPC 调用
│   ├── components/
│   │   ├── connection/     # 应用级连接弹窗
│   │   ├── files/          # 跨视图复用的文件图标组件
│   │   ├── transfers/      # 应用级传输弹窗和进度提示
│   │   └── ui/             # 通用 UI 基础组件
│   ├── hooks/              # 连接数据、选择、操作及传输流程
│   ├── i18n/               # 前端语言初始化与中英文词条
│   ├── layout/             # 应用布局、顶部栏和侧边栏
│   ├── lib/                # 文件类型、大小格式与对象转换等纯函数
│   ├── store/              # Zustand 连接会话、本地设置、传输与弹窗状态
│   ├── types/
│   │   ├── connection.ts
│   │   ├── storage.ts
│   │   ├── transfer.ts
│   │   └── view.ts
│   ├── views/
│   │   ├── files/          # 文件页面及其专属组件
│   │   ├── transfers/      # 任务中心页面
│   │   ├── recent/
│   │   └── settings/
│   └── App.tsx
│
├── src-tauri/
│   ├── src/
│   │   ├── commands/          # Tauri IPC 命令入口
│   │   │   ├── connections.rs
│   │   │   ├── objects.rs
│   │   │   └── transfers.rs
│   │   ├── connection/        # 连接模型、会话与服务商客户端配置
│   │   ├── storage/
│   │   │   └── s3/            # 对象操作、复制/移动、流式上传下载
│   │   ├── transfers/         # 任务模型、计划、调度和执行
│   │   ├── persistence/       # 连接与任务 JSON 记录
│   │   ├── security/          # 系统凭证库
│   │   └── lib.rs
│   └── Cargo.toml
│
└── package.json
```

其中：

- `views/<view>/`：按视图组织页面及其专属组件，`index.tsx` 包含页面实现。
- `App.tsx`：只装配 Hash 路由、Toast 容器和应用布局；`layout/app-layout.tsx` 负责视图组合。连接数据与异步连接操作分别由 `use-storage-connection` 和 `use-connection-actions` 管理，传输与弹窗状态由 Zustand 状态管理。
- `layout/`：应用整体布局及顶部栏、侧边栏组件。
- `components/`：跨页面或应用级组件；`components/ui/` 放通用 UI 基础组件。
- `hooks/`：跨页面的连接和传输状态、事件订阅与操作流程。
- `lib/`：与 React 组件无关的纯函数，文件类型判断、字节格式化和存储对象转换按用途拆分。
- `api/`：按业务拆分 React 与 Tauri 命令之间的 IPC 调用；`types/` 放共享模型；`store/` 放 Zustand 客户端状态。
- `commands/`：保留现有 IPC 名称，只负责参数接收和调用业务模块。
- `connection/`：管理运行时连接，并由 AWS、R2、COS、OSS、GCS、Kodo、TOS 模块校验配置及创建 S3 客户端。
- `storage/s3/`：使用 `aws-sdk-s3` 实现对象操作、复制与流式传输。
- `transfers/`：负责任务计划、队列状态、并发和执行。
- `persistence/` 与 `security/`：分别保存本地 JSON 记录和访问系统凭证库。

若未来接入非 S3 协议，再按实际差异引入独立存储接口或注册表。

## 九、当前限制与后续验证

- 尚无用户账号系统、云端后端、Bucket 创建／删除、云端权限管理、目录同步、整桶索引或跨重启断点续传。
- 对 AWS、COS、OSS、GCS、Kodo、TOS 的兼容性仍需按真实服务商和 Bucket 验证；尤其是条件写入、Multipart、分片复制和权限不足等路径。
- 跨连接传输通过本机临时文件中转，会占用本机磁盘和源端流量；尚无跨云服务端直传。
- 当前没有 SQLite、自动重试和暂停任务。扩展前应根据任务查询、恢复需求及本地数据迁移成本评估是否引入数据库。
- 兼容性检查只验证当前 Bucket、凭证和 Endpoint 的实际行为，不构成服务商级别的普遍保证。

## 最终技术决策

| 决策项     | 当前方案                             |
| ------- | -------------------------------- |
| 产品形态    | Tauri 2 桌面应用                     |
| 已接入服务商 | R2、AWS S3、COS、OSS、GCS、Kodo、TOS       |
| 底层协议    | 服务商适配配置 + S3 Compatible API           |
| SDK     | `aws-sdk-s3`（Rust）                       |
| 扩展方式    | `connection/<provider>.rs` 配置客户端，共用 S3 操作 |
| 大文件处理   | 流式 I/O + Multipart               |
| 传输调度    | Rust Tokio                       |
| 文件浏览    | Key Prefix + 服务端分页               |
| 持久化     | 连接、任务和设置使用本机 JSON／Zustand 持久化；SQLite 未实现 |
| 凭证管理    | 系统安全凭证库或 Stronghold              |
| 服务端     | 无                                |

最重要的架构取舍只有两个：

第一，存储层统一，但不要抹平服务商之间真实存在的差异；第二，上传下载全部放在 Rust 层，React 只负责展示与控制。

当前文件浏览、传输队列和迁移功能复用 S3 操作实现；各服务商的实际兼容范围以连接配置和真实 Bucket 验证结果为准。
