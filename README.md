<div align="center">

# CloudStore

**本地优先的跨云对象存储桌面客户端**

[English](./README.en.md) | 简体中文

<p align="center">
  <a href="https://github.com/42arch/cloudstore/releases">
    <img src="https://img.shields.io/github/v/release/42arch/cloudstore?style=flat-square&color=blue" alt="Latest Release" />
  </a>
  <img src="https://img.shields.io/badge/Platform-macOS%20%7C%20Windows%20%7C%20Linux-brightgreen?style=flat-square" alt="Platform" />
  <img src="https://img.shields.io/badge/Tauri-v2-orange?style=flat-square" alt="Tauri 2" />
  <img src="https://img.shields.io/badge/React-v19-61dafb?style=flat-square" alt="React 19" />
  <img src="https://img.shields.io/badge/Rust-2024-black?style=flat-square&logo=rust" alt="Rust" />
  <a href="./LICENSE">
    <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="License" />
  </a>
</p>

<p align="center">
  CloudStore 是一个基于 Tauri 2 + Rust + React 19 构建的跨云对象存储桌面客户端。<br/>
  支持多云存储统一管理、文件流式传输以及跨服务商数据迁移。
</p>

<!-- 界面预览区域 -->
<p align="center">
  <img src="docs/preview.png" alt="CloudStore Preview" width="820" onerror="this.style.display='none'" />
</p>

</div>

---

## ✨ 功能特性

- 🌐 **多云存储支持**：支持 AWS S3、Cloudflare R2、Google Cloud Storage、阿里云 OSS、腾讯云 COS、火山引擎 TOS、七牛云 Kodo 等对象存储服务。
- ⚡ **传输队列管理**：基于 Tokio 与 Rust 流式读写。大文件（≥100 MiB）使用并发分片上传（Multipart Upload），支持传输进度展示、取消与重试。
- 🔄 **跨云数据迁移**：支持在不同存储桶之间复制或移动对象与文件夹，并在迁移过程中通过 ETag 和文件大小校验结果。
- 📁 **文件与目录操作**：支持虚拟目录导航、拖拽上传文件与文件夹、批量下载、删除与重命名，提供“跳过 / 覆盖 / 保留两份”同名处理策略。
- 👁️ **文件预览与公开访问**：支持图片格式（≤8 MiB）与 UTF-8 文本（≤1 MiB）预览；支持配置自定义公开域名并检测匿名可访问性。

---

## 🛡️ 安全与凭据管理

CloudStore 使用**本地优先（Local-First）**架构：

1. **直连存储端点**：所有请求由客户端直接发送至各云服务商 API 端点，无中转后端服务，亦不包含数据遥测。
2. **系统凭据库存储**：访问密钥保存在操作系统安全凭据库中，不以明文写入本地配置文件：
   - **macOS**：Apple Keychain (钥匙串)
   - **Windows**：Windows Credential Manager (凭据管理器)
   - **Linux**：FreeDesktop Secret Service API (如 GNOME Keyring / KWallet)
3. **临时连接支持**：支持仅在当前进程有效的临时连接（不持久化至本地）。编辑连接时不读取已保存的密钥明文。

---

## ☁️ 已支持的对象存储服务商

| 云服务商 | 协议端点 / Endpoint 特性 | 寻址方式 | 凭证认证支持 | 当前状态 |
| :--- | :--- | :--- | :--- | :---: |
| **AWS S3** | SDK 自动解析 / 支持中国区及 Global 各 Region | Virtual-Hosted | 长期 AK/SK、临时 Session Token |  支持 |
| **Cloudflare R2** | `<account_id>.r2.cloudflarestorage.com` | Virtual-Hosted | 长期 S3 兼容凭证 |  支持 |
| **阿里云 OSS** | `s3.oss-<region>.aliyuncs.com` | Virtual-Hosted | 长期 AccessKey |  支持 |
| **腾讯云 COS** | `cos.<region>.myqcloud.com` | Virtual-Hosted | 长期 SecretId / SecretKey |  支持 |
| **Google Cloud (GCS)** | `storage.googleapis.com` (XML API) | Path-Style | HMAC 互操作密钥 |  支持 |
| **火山引擎 TOS** | `tos-s3-<region>.volces.com` | Virtual-Hosted | 长期 AccessKey |  支持 |
| **七牛云 Kodo** | `s3.<region>.qiniucs.com` | Path-Style | 长期 AccessKey |  支持 |
| **MinIO / 私有云** | 自定义 S3 兼容 Endpoint | 自动探测 | S3 AK/SK | ⏳ 规划中 |

---

## 🚀 下载与安装

可从 [GitHub Releases](https://github.com/42arch/cloudstore/releases) 下载对应系统的安装包：

| 操作系统 | 推荐安装包格式 | 说明 |
| :--- | :--- | :--- |
| **macOS** | `.dmg` | Universal 安装包，支持 Apple Silicon 与 Intel 架构 |
| **Windows** | `.exe` (NSIS) / `.msi` | 适用于 64 位 Windows 10 / 11 |
| **Linux** | `.deb` / `.AppImage` | 适用于 Ubuntu/Debian 及常见 Linux 桌面发行版 |

> **macOS 说明**：安装包使用 ad-hoc 签名，未经过 Apple 公证。首次打开时如果被 macOS 拦截，请先尝试打开应用，再前往“系统设置 → 隐私与安全性”，在安全性提示处选择“仍要打开”。此操作仅适用于你确认下载来源可信的情况。

---

## 🛠️ 本地开发与构建

### 1. 环境准备

- [Bun](https://bun.sh/)（推荐包管理器）或 Node.js (>= 20)
- [Rust](https://www.rust-lang.org/) 与 Cargo（stable 2024 edition）
- **Linux 编译依赖**（macOS / Windows 可跳过）：
  ```bash
  sudo apt-get update && sudo apt-get install -y \
    libwebkit2gtk-4.1-dev \
    build-essential \
    curl \
    wget \
    file \
    libxdo-dev \
    libssl-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev \
    libsecret-1-dev
  ```

### 2. 本地运行

```bash
# 1. 克隆代码仓库
git clone https://github.com/42arch/cloudstore.git
cd cloudstore

# 2. 安装前端依赖
bun install

# 3. 启动本地开发桌面客户端
bun run tauri dev
```

### 3. 构建打包

```bash
# 编译出当前系统的桌面安装包（位于 src-tauri/target/release/bundle/）
bun run tauri build
```

---

## 📄 开源许可证

本项目基于 [MIT License](./LICENSE) 协议开源。
