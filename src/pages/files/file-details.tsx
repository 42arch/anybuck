import type { StorageItem } from '@/features/storage/models'
import { Copy, DownloadSimple, Folders, Info, Trash } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { FileKindIcon } from './file-kind-icon'
import { fileKindSurfaceClass } from './file-kind-styles'

interface FileDetailsProps {
  item?: StorageItem
  path: string
  onCopyKey: (key: string) => void
  onOpenFolder: (item: StorageItem) => void
  onUnavailableAction: (label: string) => void
  onDelete: (item: StorageItem) => void
}

export function FileDetails({ item, path, onCopyKey, onOpenFolder, onUnavailableAction, onDelete }: FileDetailsProps) {
  if (!item) {
    return (
      <Card size="sm" className="h-full min-h-72">
        <CardHeader><CardTitle>文件详情</CardTitle></CardHeader>
        <CardContent className="flex flex-1 items-center">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon"><Info /></EmptyMedia>
              <EmptyTitle>选择一个项目</EmptyTitle>
              <EmptyDescription>查看文件或文件夹的详细信息</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </CardContent>
      </Card>
    )
  }

  const key = `${path ? `${path}/` : ''}${item.name}`

  return (
    <Card size="sm" className="h-full min-h-72">
      <CardHeader>
        <CardTitle>文件详情</CardTitle>
        <CardDescription>当前选中的项目</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <div className="flex flex-col items-center gap-2 py-2 text-center">
          <span className={cn('flex size-16 items-center justify-center rounded-xl', fileKindSurfaceClass(item.kind))}>
            <FileKindIcon kind={item.kind} size={32} />
          </span>
          <strong className="max-w-full truncate text-xs">{item.name}</strong>
          <span className="text-xs text-muted-foreground">{item.detail}</span>
        </div>
        <Separator />
        <dl className="flex flex-col gap-3 text-xs">
          <div className="flex items-start justify-between gap-3">
            <dt className="text-muted-foreground">文件类型</dt>
            <dd className="text-right font-medium">{item.kind === 'folder' ? '文件夹' : item.name.split('.').pop()?.toUpperCase()}</dd>
          </div>
          <div className="flex items-start justify-between gap-3">
            <dt className="text-muted-foreground">文件大小</dt>
            <dd className="text-right font-medium">{item.size}</dd>
          </div>
          <div className="flex items-start justify-between gap-3">
            <dt className="text-muted-foreground">修改时间</dt>
            <dd className="text-right font-medium">{item.updated}</dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-muted-foreground">对象 Key</dt>
            <dd className="break-all rounded-md bg-muted p-2 font-mono text-xs">{key}</dd>
          </div>
        </dl>
      </CardContent>
      <CardFooter className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={() => onCopyKey(key)}>
          <Copy data-icon="inline-start" />
          复制 Key
        </Button>
        {item.kind === 'folder'
          ? (
              <Button className="flex-1" onClick={() => onOpenFolder(item)}>
                <Folders data-icon="inline-start" />
                打开
              </Button>
            )
          : (
              <Button className="flex-1" onClick={() => onUnavailableAction('下载')}>
                <DownloadSimple data-icon="inline-start" />
                下载
              </Button>
            )}
        <Button variant="outline" size="icon" aria-label={`删除 ${item.name}`} onClick={() => onDelete(item)}>
          <Trash />
        </Button>
      </CardFooter>
    </Card>
  )
}
