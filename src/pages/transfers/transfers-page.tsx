import { CloudArrowUp } from '@phosphor-icons/react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'

export function TransfersView() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>传输队列</CardTitle>
        <CardDescription>上传与下载任务</CardDescription>
      </CardHeader>
      <CardContent>
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><CloudArrowUp /></EmptyMedia>
            <EmptyTitle>传输任务尚未接入</EmptyTitle>
            <EmptyDescription>当前版本支持连接和预览 R2 对象。</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </CardContent>
    </Card>
  )
}
