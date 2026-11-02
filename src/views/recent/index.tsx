import { ClockCounterClockwiseIcon } from '@phosphor-icons/react'
import { Card, CardContent } from '@/components/ui/card'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import i18n from '@/i18n'

export function RecentView() {
  return (
    <Card>
      <CardContent>
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><ClockCounterClockwiseIcon /></EmptyMedia>
            <EmptyTitle>{i18n.t('recent.recentActivityNotAvailableYet')}</EmptyTitle>
          </EmptyHeader>
        </Empty>
      </CardContent>
    </Card>
  )
}
