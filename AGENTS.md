# 项目开发约定

本文件适用于整个仓库。修改代码前，先阅读相关文件和 `docs/architecture.md`。

## 技术栈约定

- 桌面端使用 Tauri 2；前端使用 React 19、TypeScript 和 Vite 8。
- 使用 React Router 管理主视图，桌面端使用 Hash 路由。新增主视图时同步更新应用路由和侧边栏入口。
- 使用 TanStack Query 管理异步请求和服务端数据缓存，使用 Zustand 管理跨组件共享的客户端状态。
- UI 使用 Tailwind CSS 4、shadcn/ui、Base UI 和 Phosphor 图标，并遵循仓库现有组件配置。
- Rust 后端使用 `aws-sdk-s3` 实现 S3 兼容存储访问；功能范围和架构设计参考 `docs/architecture.md`，如实现与文档不符，应同步更新文档。

## 前端约定

- 使用 `@/` 引用 `src/` 下的模块。通用 UI 组件放在 `src/components/ui/`，功能组件按业务领域组织。
- 页面及其专属组件按视图放在 `src/pages/<view>/`。
- 项目已配置 Tailwind CSS 4 与 shadcn/ui；主题变量在 `src/index.css`，组件配置在 `components.json`。界面优先使用 `src/components/ui/` 的现有组件和 Tailwind 工具类，不新增页面级原生 CSS 文件；按项目配置使用 Base UI 和 Phosphor 图标。
- 使用 `@phosphor-icons/react` 图标时，统一使用带 `*Icon` 后缀的规范命名（例如 `CloudArrowUpIcon`、`FolderIcon`、`XIcon`），避免使用已被官方废弃的旧版无后缀命名。
- 修改现有页面时，可逐步替换模板样式；不要为了无关改动重写整套 UI。

## 开发与验证

- 使用 Bun，保持 `bun.lock` 与依赖变更一致。前端开发：`bun run dev`；桌面开发：`bun run tauri dev`。
- 前端检查：`bun run lint`、`bun run build`。Rust 检查：`bun run format:rust:check`、`bun run lint:rust`。根据改动范围运行相应检查，并如实报告未运行或失败的项目。
- 新增跨 IPC 功能时，同步检查 TypeScript 调用、Rust 命令注册、序列化模型和 Tauri 权限配置。对云存储操作，重点验证分页、权限不足、部分失败、断网、取消与重试场景。
- 保留用户已有的未提交改动；除非任务要求，不修改生成文件、锁文件或无关配置。
