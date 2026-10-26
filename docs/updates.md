# 桌面应用更新与发布

应用使用 Tauri 2 updater，从 GitHub 最新已发布的 Release 读取 `latest.json`。正式安装包启动时自动检查，用户可在“设置 → 应用更新”手动检查并安装。安装前会检查传输队列；仍有排队或运行中的任务时，更新会等待用户稍后继续安装。

## 一次性配置

1. 当前工作区生成的更新私钥位于仓库根目录的 `.local-secrets/updater.key`，已经被 `.gitignore` 排除。请将它备份到可靠的密码管理或密钥保管处，**不要提交到 Git**。其他构建机或克隆目录不会自动包含该文件，应从安全备份恢复同一把私钥。公钥已写入 `src-tauri/tauri.conf.json`；丢失私钥后，已安装的客户端无法验证新更新。
2. 在 GitHub 仓库 `42arch/cloudstore` 的 Actions Secrets 中创建 `TAURI_SIGNING_PRIVATE_KEY`，值为私钥文件的完整内容。密钥没有设置密码，因此无需 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`。
3. 让稳定版 Release 和其资产能被客户端通过 HTTPS 公开访问。私有仓库不能直接使用当前的 GitHub `releases/latest/download/latest.json` 地址，需要另配可访问的更新服务或 CDN。
4. macOS 的系统代码签名和公证、Windows 的安装包代码签名与 Tauri 更新签名相互独立；面向最终用户发布时分别配置和验证。

## 发布流程

1. 同步更新 `package.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml` 的应用版本，并写好 `CHANGELOG.md`。
2. 推送 `v<版本号>` 标签，等待 `.github/workflows/release.yml` 的 macOS、Windows、Linux 构建全部完成。
3. 在草稿 Release 中检查安装包、更新包签名和 `latest.json`，确认平台条目及下载地址完整后发布草稿。只有已发布的 Release 会出现在客户端的 `releases/latest` 地址。
4. 从上一版本的正式安装包执行“检查 → 下载 → 安装 → 重启”验证。对正在传输、断网、下载失败和签名不匹配也做一次验证。

首次启用更新时，已经安装了旧版且不含 updater 的客户端仍须手动安装一次新版本。开发模式不执行更新检查。

macOS 本机验证签名包时，可在仓库根目录运行：

```sh
TAURI_SIGNING_PRIVATE_KEY="$PWD/.local-secrets/updater.key" bun tauri build --debug --bundles app --ci
```

Tauri 构建器需要私钥的绝对路径，或将密钥完整内容放入该环境变量。生成的 `.app.tar.gz.sig` 应与更新包一起检查。
