# Cloud Storage Manager — MVP 技术方案

MVP v0.1

桌面应用 · 本地优先 · 多云可扩展

## 当前实现状态（2026-10-20）

- Tauri 后端已通过 `aws-sdk-s3` 支持 Cloudflare R2 连接校验和指定 Bucket 的 `ListObjectsV2` 预览，包含 continuation token 分页。
- 支持同时添加和切换多个 R2 连接；连接元数据保存在应用数据目录，每个连接的凭证分别保存在系统凭证库。应用启动时仅读取已保存连接，所有连接默认为断开状态，单击桶名可切换当前选择（即使连接断开），双击或使用右键菜单可建立连接；未勾选记住时连接只在当前进程内有效。旧版单连接配置会在读取时兼容迁移。
- 侧边栏按服务提供商分组，再列出 Bucket，连接树可折叠；添加连接在右侧 Drawer 中进行，连接名称可选，留空时使用 Bucket 名称。本期不显示用户或登录入口。
- 文件浏览器支持单个及批量删除对象；选择虚拟目录时会分页枚举其前缀下的对象，并按 S3 批次删除，界面会显示确认和部分失败结果。
- 文件管理、传输任务、最近访问和设置等主视图通过 React Router 的 Hash 路由切换。
- 前端通过 TanStack Query 管理 Tauri API 请求；对象列表按连接和目录缓存，删除后使对应连接的对象列表失效。
- 前端不再填充演示 Bucket、对象、最近访问或传输任务；未连接时展示空状态和 R2 设置入口。
- 上传、下载、其他写操作及传输任务管理仍未实现。下文其余设计描述的是目标架构，不代表已经完成。

## 一、项目定位与目标

开发一款基于 Tauri 的跨云对象存储桌面管理工具，第一阶段仅支持 Cloudflare R2，后续逐步扩展 AWS S3、阿里云 OSS、腾讯云 COS、MinIO 等服务商。

核心设计原则：MVP 只实现 R2 功能，但不将 R2 业务逻辑写入通用文件管理模块。

技术路线确定为：

- 前端： React + TypeScript + Vite + Tailwind CSS + shadcn/ui
- 桌面端： Tauri 2
- 存储引擎： Rust + `aws-sdk-s3`
- 任务调度： Tokio
- 本地数据： SQLite
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
| 跨云迁移      | R2 → OSS / COS / S3   | 后续版本 |
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

R2

MVP

AWS S3

Future

OSS

Future

COS

Future

SQLite / Secure Credential Store

架构主要分四层：

1. Presentation： 只关心 UI 状态、用户交互及展示。
2. Application： 负责文件操作编排、连接管理和任务调度。
3. Storage Abstraction： 定义统一的数据模型、文件操作接口及能力声明。
4. Infrastructure： 实现 S3 请求、文件流、数据库持久化及密钥管理。

所有云端 API 请求都由 Rust 发起，文件数据不需要通过 React 或 Tauri IPC 中转。IPC 只传递命令、元数据与进度通知。

## 四、多服务商扩展设计

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

## 五、文件上传系统设计

这是 MVP 最值得投入的模块。

### 5.1 上传执行流程

选择文件 / 拖拽文件夹

遍历本地文件、获取相对路径

生成上传任务

记录 connectionId、bucket、key、文件大小

任务调度器

并发控制、失败重试、取消任务

PutObject

小文件直接上传

Multipart

大文件分片并发上传

更新任务状态 + 通知前端

完成、失败、取消、进度更新

R2 支持单次 PUT 和 Multipart 两种上传方式，Multipart 适合大文件及失败分片的重试。

[image](https://www.google.com/s2/favicons?domain=https://developers.cloudflare.com\&sz=32)

Cloudflare R2 docs

+1



建议初始参数：

| 参数             | 默认值             |
| -------------- | --------------- |
| Multipart 触发阈值 | 100 MiB         |
| 分片大小           | 16 MiB，超大文件动态增大 |
| 同时上传文件数        | 3               |
| 单文件分片并发        | 4               |
| 网络重试次数         | 3               |
| 重试策略           | 指数退避 + 随机抖动     |

这些是初始配置，并非必须固定的参数。需要根据文件大小控制 10,000 个分片的上限，并限制总缓冲区内存。

### 5.2 TransferManager

任务管理器负责独立于云服务商的任务生命周期。

建议使用以下状态：

```
type TransferStatus =
  | "queued"
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";

interface TransferTask {
  id: string;
  connectionId: string;

  type: "upload" | "download";

  bucket: string;
  key: string;
  localPath: string;

  totalBytes: number;
  transferredBytes: number;

  status: TransferStatus;
  error?: string;
}
```

关键设计：

- 使用 Tokio Semaphore 控制并发。
- 通过任务 ID 实现取消和重试。
- 传输元数据保存在 SQLite。
- 使用 Tauri Channel 将进度变化推送给 React。
- UI 关闭窗口时应明确是隐藏到托盘继续上传，还是终止进程。

Tauri Channel 适合长时间任务的进度消息传输，避免对每次进度更新都调用独立 IPC 命令。

[image](https://www.google.com/s2/favicons?domain=https://tauri.app\&sz=32)

Tauri



### 5.3 断点续传预留

MVP 可以先做到单次运行中的失败重试，跨重启断点续传放到 P1。

但 SQLite 中应预留以下数据：

```
upload_sessions
  task_id
  upload_id
  part_size
  file_size
  file_modified_at

upload_parts
  task_id
  part_number
  etag
  size
  status
```

后续恢复时，需要校验本地文件是否发生变化，查询云端已上传的分片，重新上传缺失部分，再完成 Multipart。

如果某个任务不准备恢复，应调用 AbortMultipartUpload 清理未完成上传，避免遗留占用存储的分片。

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

### 6.2 文件操作

文件浏览器应支持：

- 多选、批量删除、复制和移动
- 拖拽文件上传
- 上传整个文件夹
- 下载文件及整个虚拟目录
- 文件排序、前缀筛选
- 文件信息及对象 Key 复制

特别注意：对象重命名、移动通常需要 CopyObject + DeleteObject。对于超过单次 CopyObject 限制的大对象，还可能需要 Multipart Copy，不能仅靠普通 CopyObject 覆盖所有情况。

此外，批量删除必须处理部分成功、部分失败的响应；目录批量操作需要迭代分页，不能只处理当前显示的文件。

下载目录时还要对对象 Key 做路径安全处理，防止包含 `..` 等特殊片段的 Key 写入预期目录之外。

## 七、本地持久化设计

SQLite 建议只保存元数据，不缓存整个 Bucket 的所有对象。

| 表                    | 主要字段                                        | 作用           |
| -------------------- | ------------------------------------------- | ------------ |
| `connections`        | id、name、provider、endpoint、region、secret_ref | 连接配置         |
| `connection_buckets` | connection_id、bucket_name                   | 手动添加的 Bucket |
| `transfer_tasks`     | id、connection_id、bucket、key、status、progress | 传输队列         |
| `upload_sessions`    | task_id、upload_id、part_size                 | 续传会话         |
| `upload_parts`       | task_id、part_number、etag                    | 已完成分片        |
| `settings`           | key、value                                   | 用户偏好         |

凭证单独保存在安全存储中。macOS 可以使用 Keychain，Windows 使用 Credential Manager；也可以选择 Tauri Stronghold 提供跨平台加密存储。

[image](https://www.google.com/s2/favicons?domain=https://v2.tauri.app\&sz=32)

Tauri

+1



不要将 Access Key、Secret Key、对象的签名 URL 或其他敏感信息写入日志、SQLite 明文配置或前端持久化状态。

## 八、推荐项目目录结构

采用单仓库，前端和 Rust 后端分别按职责组织，不需要在 MVP 阶段拆成多个独立服务。

```
cloud-storage-manager/
├── src/
│   ├── api/
│   │   └── storage.ts
│   ├── components/
│   ├── features/
│   │   └── storage/
│   │       └── models.ts
│   ├── pages/
│   │   ├── files/
│   │   ├── transfers/
│   │   ├── recent/
│   │   └── settings/
│   └── App.tsx
│
├── src-tauri/
│   ├── src/
│   │   ├── commands/
│   │   ├── application/
│   │   │   ├── connection.rs
│   │   │   ├── file_manager.rs
│   │   │   └── transfer_manager.rs
│   │   ├── storage/
│   │   │   ├── mod.rs
│   │   │   ├── traits.rs
│   │   │   ├── models.rs
│   │   │   ├── registry.rs
│   │   │   ├── s3/
│   │   │   └── providers/
│   │   │       └── r2.rs
│   │   ├── persistence/
│   │   ├── security/
│   │   └── lib.rs
│   ├── migrations/
│   └── Cargo.toml
│
└── package.json
```

其中：

- `pages/<view>/`：按路由视图组织页面及仅供该页面使用的组件。
- `api/`：封装 React 与 Tauri 命令之间的 IPC 调用。
- `features/`：放置跨页面共享的业务模型和功能逻辑。
- `storage/traits.rs`：服务商无关的能力接口。
- `storage/s3/`：使用 `aws-sdk-s3` 实现主要对象操作。
- `storage/providers/r2.rs`：R2 Endpoint、鉴权配置和能力差异。
- `application/`：处理业务逻辑，不直接依赖 Cloudflare R2。
- `commands/`：Tauri IPC 接口，不写业务逻辑。

后续扩展其他服务商，原则上只需增加 Profile 或 Adapter，不需要修改文件管理器 UI。

## 九、开发实施顺序

01

项目基础

Tauri + React 初始化、UI 框架、IPC、SQLite、连接配置

02

R2 存储引擎

S3 客户端、连接验证、Bucket 浏览、ListObjectsV2、分页

03

文件管理器

目录导航、选择、删除、复制、移动、下载

04

批量传输引擎

多文件及文件夹上传、Multipart、并发队列、进度、重试

05

稳定性与发布

异常测试、权限测试、性能测试、macOS / Windows 打包

验收时重点覆盖：1,000 个小文件批量上传、10 GiB 大文件分片上传、10,000 个以上对象的目录分页、断网恢复、权限不足和中途取消等场景。它们是测试场景，而非现阶段承诺的性能指标。

## 十、MVP 暂时不做的事情

为了控制开发范围，我建议暂时不实现用户账号系统、后端服务、Bucket 创建与删除、云端权限管理、同步盘、跨云迁移、全量文件索引，以及复杂的媒体预览功能。

尤其是不要为了兼容所有厂商，一开始就开发庞大的 Provider 插件系统。先实现一个公共 S3 Backend，再通过配置适配 R2，即可保证合理的扩展性。

## 最终技术决策

| 决策项     | 推荐方案                             |
| ------- | -------------------------------- |
| 产品形态    | Tauri 2 桌面应用                     |
| MVP 服务商 | Cloudflare R2                    |
| 底层协议    | S3 Compatible API                |
| SDK     | `aws-sdk-s3`（Rust）               |
| 多云扩展    | StorageBackend + ProviderProfile |
| 大文件处理   | 流式 I/O + Multipart               |
| 传输调度    | Rust Tokio                       |
| 文件浏览    | Key Prefix + 服务端分页               |
| 持久化     | SQLite                           |
| 凭证管理    | 系统安全凭证库或 Stronghold              |
| 服务端     | 无                                |

最重要的架构取舍只有两个：

第一，存储层统一，但不要抹平服务商之间真实存在的差异；第二，上传下载全部放在 Rust 层，React 只负责展示与控制。

按照这套方案，MVP 可以成为一个独立可用的 Cloudflare R2 文件管理器，而未来支持 OSS、COS、S3 时，核心文件浏览、任务调度及 UI 均能够复用。
