import { ClockCounterClockwise } from '@phosphor-icons/react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'

export function RecentView() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>最近访问</CardTitle>
        <CardDescription>最近访问记录</CardDescription>
      </CardHeader>
      <CardContent>
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><ClockCounterClockwise /></EmptyMedia>
            <EmptyTitle>最近访问记录尚未接入</EmptyTitle>
            <EmptyDescription>后续版本可在这里查看最近打开的对象。</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </CardContent>
    </Card>
  )
}
