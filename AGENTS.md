# 项目开发约定

本文件适用于整个仓库。修改代码前，先阅读相关文件和 `docs/architecture.md`。

## 项目现状与目标

- 当前是 Tauri 2 + React 19 + TypeScript + Vite 8 项目。界面不包含演示数据，可连接 Cloudflare R2、分页浏览对象，并支持单个/批量删除对象及递归删除虚拟目录；用户可选择将连接元数据保存到应用数据目录、将 Secret Access Key 保存到系统凭证库，并在启动时恢复。上传、下载和传输任务管理尚未实现。不要把架构文档中的其他模块当成已实现功能。
- 主视图由 React Router 管理，桌面端使用 Hash 路由；新增主视图时同步更新应用路由和侧边栏入口。
- 页面及其专属组件按视图放在 `src/pages/<view>/`；跨视图复用的业务模型放在 `src/features/`，Tauri IPC 调用封装放在 `src/api/`。
- 产品目标是本地优先的对象存储管理器。首个版本支持 Cloudflare R2，后续通过 S3 兼容层扩展其他服务商。功能范围、分层和实施顺序以 `docs/architecture.md` 为参考；若实现与文档不符，同步更新文档。
- 优先完成用户当前要求的最小闭环，不为未来服务商预先建立庞大的插件体系。

## 代码边界

- `src/` 负责界面、交互和状态；`src-tauri/` 负责云端请求、文件流、任务调度、持久化和凭证处理。
- React 与 Rust 通过 Tauri 命令及事件传递操作参数、元数据和进度；文件内容不要经由前端或 IPC 整体中转。
- 存储能力保持服务商无关，R2 的 Endpoint、鉴权和兼容性差异放在服务商配置或适配层。不要把 R2 判断散布到通用文件管理代码中。
- 对象列表使用服务端分页；批量目录操作必须遍历全部分页。对象移动或重命名需考虑复制后删除、大对象分片复制、部分失败及取消后的状态。
- 下载目录时校验对象 Key 对应的本地路径，防止路径穿越。Access Key、Secret Key 和签名 URL 不得写入日志、明文数据库或前端持久化状态。

## 前端约定

- 使用 `@/` 引用 `src/` 下的模块。通用 UI 组件放在 `src/components/ui/`，功能组件按业务领域组织。
- 项目已配置 Tailwind CSS 4 与 shadcn/ui；主题变量在 `src/index.css`，组件配置在 `components.json`。界面优先使用 `src/components/ui/` 的现有组件和 Tailwind 工具类，不新增页面级原生 CSS 文件；按项目配置使用 Base UI 和 Phosphor 图标。
- 修改现有页面时，可逐步替换模板样式；不要为了无关改动重写整套 UI。

## 开发与验证

- 使用 Bun，保持 `bun.lock` 与依赖变更一致。前端开发：`bun run dev`；桌面开发：`bun run tauri dev`。
- 前端检查：`bun run lint`、`bun run build`。Rust 检查：`bun run format:rust:check`、`bun run lint:rust`。根据改动范围运行相应检查，并如实报告未运行或失败的项目。
- 新增跨 IPC 功能时，同步检查 TypeScript 调用、Rust 命令注册、序列化模型和 Tauri 权限配置。对云存储操作，重点验证分页、权限不足、部分失败、断网、取消与重试场景。
- 保留用户已有的未提交改动；除非任务要求，不修改生成文件、锁文件或无关配置。
