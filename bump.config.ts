import { defineConfig } from 'bumpp'

export default defineConfig({
  files: [
    'package.json',
    'src-tauri/tauri.conf.json',
    'src-tauri/Cargo.toml',
  ],
  all: true,
  execute: 'cargo check --manifest-path src-tauri/Cargo.toml',
  commit: 'chore(release): v{version}',
  tag: 'v{version}',
  push: true,
})
