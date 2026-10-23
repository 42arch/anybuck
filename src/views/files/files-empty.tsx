import { CloudArrowUpIcon, MagnifyingGlassIcon } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Spinner } from '@/components/ui/spinner'

interface FilesEmptyProps {
  isLoading: boolean
  hasRemoteConnection: boolean
  loadError?: string
  search?: string
  onConnect: () => void
}

export function FilesEmpty({
  isLoading,
  hasRemoteConnection,
  loadError,
  search,
  onConnect,
}: FilesEmptyProps) {
  return (
    <Empty className="min-h-72">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          {isLoading ? <Spinner /> : hasRemoteConnection ? <MagnifyingGlassIcon /> : <CloudArrowUpIcon />}
        </EmptyMedia>
        <EmptyTitle>
          {isLoading
            ? '正在读取对象…'
            : loadError
              ? '对象列表读取失败'
              : !hasRemoteConnection
                  ? '尚未连接存储桶'
                  : search
                    ? '没有找到匹配的文件'
                    : 'Bucket 暂无对象'}
        </EmptyTitle>
        <EmptyDescription>
          {isLoading
            ? '正在读取当前目录。'
            : loadError
              ? '请检查连接配置或网络后重试。'
              : !hasRemoteConnection
                  ? '连接存储桶后即可浏览对象。'
                  : search
                    ? '试试其他搜索词'
                    : '这个 Bucket 或目录当前没有对象。'}
        </EmptyDescription>
      </EmptyHeader>
      {!hasRemoteConnection && !isLoading && (
        <Button onClick={onConnect}>添加并连接存储桶</Button>
      )}
    </Empty>
  )
}
