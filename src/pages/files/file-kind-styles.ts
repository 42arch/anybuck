import type { FileKind } from '@/types/storage'

const kindColors: Record<FileKind, string> = {
  folder: 'text-[#e6a642]',
  image: 'text-[#7994d2]',
  document: 'text-[#df7974]',
  archive: 'text-[#9c81c5]',
  file: 'text-[#7f9ca6]',
}

const kindSurfaces: Record<FileKind, string> = {
  folder: 'bg-[#fff3db]',
  image: 'bg-[#edf2fd]',
  document: 'bg-[#fdf0ef]',
  archive: 'bg-[#f4eff9]',
  file: 'bg-[#eff5f6]',
}

export function fileKindColorClass(kind: FileKind) {
  return kindColors[kind]
}

export function fileKindSurfaceClass(kind: FileKind) {
  return kindSurfaces[kind]
}
