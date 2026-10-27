import { ClockCounterClockwiseIcon } from '@phosphor-icons/react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import i18n from '@/i18n'

export function RecentView() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{i18n.t('nav.recent')}</CardTitle>
        <CardDescription>{i18n.t('recent.recentActivity')}</CardDescription>
      </CardHeader>
      <CardContent>
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><ClockCounterClockwiseIcon /></EmptyMedia>
            <EmptyTitle>{i18n.t('recent.recentActivityNotAvailableYet')}</EmptyTitle>
            <EmptyDescription>{i18n.t('recent.futureVersionShowRecentlyOpened')}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </CardContent>
    </Card>
  )
}
