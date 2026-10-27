import { CloudArrowUpIcon, MagnifyingGlassIcon } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Spinner } from '@/components/ui/spinner'
import i18n from '@/i18n'

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
            ? i18n.t('filesEmpty.loadingObjects')
            : loadError
              ? i18n.t('filesEmpty.loadObjectsFailed')
              : !hasRemoteConnection
                  ? i18n.t('common.noBucketConnected')
                  : search
                    ? i18n.t('filesEmpty.noMatchingFiles')
                    : i18n.t('filesEmpty.bucketEmpty')}
        </EmptyTitle>
        <EmptyDescription>
          {isLoading
            ? i18n.t('filesEmpty.loadingCurrentFolder')
            : loadError
              ? i18n.t('filesEmpty.checkConnectionSettingsNetworkTry')
              : !hasRemoteConnection
                  ? i18n.t('filesEmpty.connectBucketBrowseObjects')
                  : search
                    ? i18n.t('filesEmpty.tryAnotherSearchTerm')
                    : i18n.t('filesEmpty.bucketFolderEmpty')}
        </EmptyDescription>
      </EmptyHeader>
      {!hasRemoteConnection && !isLoading && (
        <Button onClick={onConnect}>{i18n.t('filesEmpty.addConnectBucket')}</Button>
      )}
    </Empty>
  )
}
