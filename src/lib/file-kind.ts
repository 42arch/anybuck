import type { FileKind } from '@/types/storage'

const textExtensions = new Set([
  'txt',
  'md',
  'markdown',
  'csv',
  'json',
  'jsonl',
  'ndjson',
  'yaml',
  'yml',
  'xml',
  'html',
  'htm',
  'css',
  'scss',
  'js',
  'jsx',
  'mjs',
  'cjs',
  'ts',
  'tsx',
  'mts',
  'cts',
  'py',
  'rs',
  'go',
  'java',
  'kt',
  'swift',
  'rb',
  'php',
  'sh',
  'bash',
  'zsh',
  'sql',
  'toml',
  'ini',
  'conf',
  'config',
  'log',
  'properties',
  'env',
  'gitignore',
])
const textFileNames = new Set(['readme', 'license', 'dockerfile', 'makefile', '.gitignore', '.env', '.npmrc'])

export function isTextPreviewable(name: string): boolean {
  const lowerName = name.toLowerCase()
  return textFileNames.has(lowerName) || textExtensions.has(lowerName.split('.').pop() ?? '')
}

export function fileKindFromName(name: string): FileKind {
  const extension = name.split('.').pop()?.toLowerCase() ?? ''
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'avif', 'ico'].includes(extension))
    return 'image'
  if (['pdf', 'txt', 'md', 'csv', 'json', 'yaml', 'yml'].includes(extension))
    return 'document'
  if (['zip', 'tar', 'gz', '7z', 'rar'].includes(extension))
    return 'archive'
  return 'file'
}
