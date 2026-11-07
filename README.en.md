<div align="center">

# AnyBuck

**Local-First Cross-Cloud Object Storage Desktop Client**

English | [简体中文](./README.md)

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
  AnyBuck is a cross-cloud object storage desktop client built with Tauri 2, Rust, and React 19.<br/>
  It supports unified multi-cloud management, streaming transfers, and cross-provider data migration.
</p>

<!-- UI Preview Placeholder -->
<p align="center">
  <img src="docs/preview.png" alt="AnyBuck Preview" width="820" onerror="this.style.display='none'" />
</p>

</div>

---

## ✨ Features

- 🌐 **Multi-Cloud Support**: Supports object storage services including AWS S3, Cloudflare R2, Google Cloud Storage, Alibaba Cloud OSS, Tencent Cloud COS, Volcengine TOS, and Qiniu Kodo.
- ⚡ **Transfer Queue Management**: Streamed I/O powered by Tokio and Rust. Large files (≥100 MiB) use concurrent multipart uploads, with progress display, cancellation, and manual retry.
- 🔄 **Cross-Cloud Data Migration**: Supports copying and moving objects or folders between different storage connections, verifying transfers via ETag and file size checks.
- 📁 **File & Directory Operations**: Virtual directory navigation, drag-and-drop file/folder uploads, batch downloads, deletion, and renaming, with skip / overwrite / keep-both collision strategies.
- 👁️ **File Preview & Public Access**: Preview images (≤8 MiB) and UTF-8 text (≤1 MiB); supports custom public domain configuration and anonymous access verification.

---

## 🛡️ Security & Credentials

AnyBuck uses a **Local-First** architecture:

1. **Direct Storage Endpoints**: All requests connect directly from the client to cloud provider API endpoints without intermediate relay servers or telemetry collection.
2. **OS-Native Keyring**: Credentials are saved in operating system credential stores instead of plaintext local files:
   - **macOS**: Apple Keychain
   - **Windows**: Windows Credential Manager
   - **Linux**: FreeDesktop Secret Service API (e.g., GNOME Keyring / KWallet)
3. **Temporary Connection Support**: Supports session-only connections (not persisted locally). Editing connections does not read back plaintext keys.

---

## ☁️ Supported Cloud Providers

| Provider | API Endpoint / Protocol | Addressing Style | Authentication | Status |
| :--- | :--- | :--- | :--- | :---: |
| **AWS S3** | Auto-resolved / Global & China Regions | Virtual-Hosted | Long-term AK/SK, Session Token |  Supported |
| **Cloudflare R2** | `<account_id>.r2.cloudflarestorage.com` | Virtual-Hosted | S3-Compatible Credentials |  Supported |
| **Alibaba Cloud OSS** | `s3.oss-<region>.aliyuncs.com` | Virtual-Hosted | Long-term AccessKey |  Supported |
| **Tencent Cloud COS** | `cos.<region>.myqcloud.com` | Virtual-Hosted | Long-term SecretId / SecretKey |  Supported |
| **Google Cloud (GCS)** | `storage.googleapis.com` (XML API) | Path-Style | HMAC Interoperability Keys |  Supported |
| **Volcengine TOS** | `tos-s3-<region>.volces.com` | Virtual-Hosted | Long-term AccessKey |  Supported |
| **Qiniu Kodo** | `s3.<region>.qiniucs.com` | Path-Style | Long-term AccessKey |  Supported |
| **MinIO / Private S3** | Custom S3-compatible Endpoint | Auto-detect | S3 AK/SK | ⏳ Planned |

---

## 🚀 Download & Installation

Download packages for your operating system from [GitHub Releases](https://github.com/42arch/cloudstore/releases):

| Operating System | Package Format | Notes |
| :--- | :--- | :--- |
| **macOS** | `.dmg` | Universal binary supporting Apple Silicon and Intel architectures |
| **Windows** | `.exe` (NSIS) / `.msi` | For 64-bit Windows 10 / 11 |
| **Linux** | `.deb` / `.AppImage` | For Ubuntu/Debian and common Linux distributions |

> **macOS Notice**: The installer uses ad-hoc signing and is not notarized by Apple. If macOS blocks the app on first launch, try opening it, then go to System Settings → Privacy & Security and choose “Open Anyway” in the security notice. Only do this when you trust the download source.

---

## 🛠️ Local Development & Build

### 1. Prerequisites

- [Bun](https://bun.sh/) (recommended) or Node.js (>= 20)
- [Rust](https://www.rust-lang.org/) & Cargo (stable 2024 edition)
- **Linux system dependencies** (can be skipped on macOS/Windows):
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

### 2. Running Locally

```bash
# 1. Clone the repository
git clone https://github.com/42arch/cloudstore.git
cd cloudstore

# 2. Install dependencies
bun install

# 3. Start development desktop client
bun run tauri dev
```

### 3. Packaging

```bash
# Build desktop packages for current OS (saved in src-tauri/target/release/bundle/)
bun run tauri build
```

---

## 📄 License

This project is licensed under the [MIT License](./LICENSE).
