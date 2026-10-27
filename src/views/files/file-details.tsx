import type { ActiveStorageConnection } from '@/types/connection'
import type { StorageItem } from '@/types/storage'
import { CheckIcon, CopyIcon, DownloadSimpleIcon, FoldersIcon } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { probePublicObjectUrl } from '@/api/public-access'
import { FileBadge } from '@/components/files/file-icon'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import i18n from '@/i18n'
import { showNotice } from '@/lib/notice'
import { getAuthenticatedBrowserUrl, getObjectUrl, getPublicObjectUrl } from '@/lib/object-url'
import { useFileTransferStore } from '@/store/file-transfer-store'
import { useSettingsStore } from '@/store/settings-store'

interface FileDetailsProps {
  item: StorageItem
  connection: ActiveStorageConnection | null
  path: string
  onClose: () => void
  onOpenFolder: (item: StorageItem) => void
}

export function FileDetails({ item, connection, path, onClose, onOpenFolder }: FileDetailsProps) {
  const [copiedLink, setCopiedLink] = useState<'public' | 'object' | 'browser' | null>(null)
  const copyFeedbackTimerRef = useRef<number | undefined>(undefined)
  const downloadItems = useFileTransferStore(state => state.downloadItems)
  const pendingDownload = useFileTransferStore(state => state.pendingDownload)
  const isDownloading = Boolean(pendingDownload)
  const publicBaseUrl = useSettingsStore(state => connection ? state.publicBaseUrls[connection.connectionId] : undefined)
  const candidatePublicUrl = item.kind !== 'folder' && connection
    ? getPublicObjectUrl(connection, item.id, publicBaseUrl)
    : null
  const publicAccessQuery = useQuery({
    queryKey: ['storage', 'public-access', candidatePublicUrl],
    queryFn: () => probePublicObjectUrl(candidatePublicUrl!),
    enabled: Boolean(candidatePublicUrl),
    retry: false,
    staleTime: 60_000,
  })

  useEffect(() => () => window.clearTimeout(copyFeedbackTimerRef.current), [])

  async function copyLink(url: string, link: 'public' | 'object' | 'browser') {
    try {
      await navigator.clipboard.writeText(url)
      showNotice(i18n.t('fileDetails.objectLinkCopied'))
    }
    catch {
      showNotice(i18n.t('fileDetails.copyFailedCheckClipboardPermissions'))
      return
    }

    window.clearTimeout(copyFeedbackTimerRef.current)
    setCopiedLink(link)
    copyFeedbackTimerRef.current = window.setTimeout(setCopiedLink, 1400, null)
  }

  const key = `${path ? `${path}/` : ''}${item.name}`
  const objectUrl = item.kind !== 'folder' && connection ? getObjectUrl(connection, item.id) : null
  const browserUrl = item.kind !== 'folder' && connection ? getAuthenticatedBrowserUrl(connection, item.id) : null
  const isPublic = publicAccessQuery.data?.accessible === true
  const publicStatus = publicAccessQuery.isFetching
    ? i18n.t('fileDetails.checkingAnonymousAccess')
    : publicAccessQuery.isError
      ? i18n.t('fileDetails.anonymousCheckFailed')
      : isPublic
        ? i18n.t('fileDetails.fileAccessibleAnonymously')
        : publicAccessQuery.data?.statusCode === 403
          ? i18n.t('fileDetails.http403PublicAccessHint')
          : publicAccessQuery.data?.statusCode === 404
            ? i18n.t('fileDetails.http404BucketPathHint')
            : i18n.t('dynamic.httpUnverified', { status: publicAccessQuery.data?.statusCode ?? i18n.t('common.unknown') })

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent className="flex max-h-[calc(100svh-2rem)] min-h-0 flex-col gap-3 sm:max-w-lg">
        <DialogHeader className="shrink-0">
          <DialogTitle>{item.kind === 'folder' ? i18n.t('fileDetails.folderDetails') : i18n.t('fileDetails.fileDetails')}</DialogTitle>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
          <div className="flex min-w-0 items-center gap-3 py-1">
            <FileBadge kind={item.kind} size={20} className="size-10 shrink-0 rounded-lg" />
            <div className="flex min-w-0 flex-col gap-0.5">
              <strong className="truncate text-xs">{item.name}</strong>
              <span className="text-xs text-muted-foreground">{item.detail}</span>
            </div>
          </div>
          <Separator />
          <dl className="flex flex-col gap-2 text-xs">
            <div className="flex items-start justify-between gap-3">
              <dt className="text-muted-foreground">{i18n.t('fileDetails.fileType')}</dt>
              <dd className="text-right font-medium">{item.kind === 'folder' ? i18n.t('common.folder') : item.name.split('.').pop()?.toUpperCase()}</dd>
            </div>
            <div className="flex items-start justify-between gap-3">
              <dt className="text-muted-foreground">{i18n.t('common.fileSize')}</dt>
              <dd className="text-right font-medium">{item.size}</dd>
            </div>
            <div className="flex items-start justify-between gap-3">
              <dt className="text-muted-foreground">{i18n.t('common.modifiedAt')}</dt>
              <dd className="text-right font-medium">{item.updated}</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-muted-foreground">{i18n.t('fileDetails.objectKey')}</dt>
              <dd className="break-all rounded-md bg-muted p-2 font-mono text-xs">{key}</dd>
            </div>
            {browserUrl && (
              <div className="flex flex-col gap-1">
                <dt className="text-muted-foreground">{i18n.t('fileDetails.googleSignLink')}</dt>
                <dd className="flex flex-col gap-1.5">
                  <div className="group/link relative min-w-0 rounded-md bg-muted p-2 pr-10 font-mono text-xs">
                    <span className="block break-all">{browserUrl}</span>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="pointer-events-none absolute top-1 right-1 opacity-0 transition-opacity group-hover/link:pointer-events-auto group-hover/link:opacity-100 group-focus-within/link:pointer-events-auto group-focus-within/link:opacity-100"
                      aria-label={copiedLink === 'browser' ? i18n.t('fileDetails.googleSignLinkCopied') : i18n.t('fileDetails.copyGoogleSignLink')}
                      title={copiedLink === 'browser' ? i18n.t('fileDetails.copied') : i18n.t('fileDetails.copyGoogleSignLink')}
                      onClick={() => void copyLink(browserUrl, 'browser')}
                    >
                      {copiedLink === 'browser' ? <CheckIcon /> : <CopyIcon />}
                    </Button>
                  </div>
                  <span className="text-muted-foreground">{i18n.t('fileDetails.googleSignInHint')}</span>
                </dd>
              </div>
            )}
            {candidatePublicUrl && (
              <div className="flex flex-col gap-1">
                <dt className="text-muted-foreground">{isPublic ? i18n.t('fileDetails.publicFileLink') : connection?.provider === 'google-cloud-storage' ? i18n.t('fileDetails.anonymousAccessLinkPublicAccess') : i18n.t('fileDetails.domainLink')}</dt>
                <dd className="flex flex-col gap-1.5">
                  <div className="group/link relative min-w-0 rounded-md bg-muted p-2 pr-10 font-mono text-xs">
                    <span className="block break-all">{candidatePublicUrl}</span>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="pointer-events-none absolute top-1 right-1 opacity-0 transition-opacity group-hover/link:pointer-events-auto group-hover/link:opacity-100 group-focus-within/link:pointer-events-auto group-focus-within/link:opacity-100"
                      aria-label={copiedLink === 'public' ? i18n.t('fileDetails.publicLinkCopied') : isPublic ? i18n.t('fileDetails.copyPublicLink') : i18n.t('fileDetails.copyLink')}
                      title={copiedLink === 'public' ? i18n.t('fileDetails.copied') : isPublic ? i18n.t('fileDetails.copyPublicLink') : i18n.t('fileDetails.copyLink')}
                      onClick={() => void copyLink(candidatePublicUrl, 'public')}
                    >
                      {copiedLink === 'public' ? <CheckIcon /> : <CopyIcon />}
                    </Button>
                  </div>
                  <span className="text-muted-foreground">
                    {connection?.provider === 'google-cloud-storage' && publicAccessQuery.data?.statusCode === 403
                      ? i18n.t('fileDetails.googlePublicAccessDeniedHint')
                      : publicStatus}
                  </span>
                  <Button variant="outline" size="sm" className="self-start" disabled={publicAccessQuery.isFetching} onClick={() => void publicAccessQuery.refetch()}>
                    {i18n.t('fileDetails.recheck')}
                  </Button>
                </dd>
              </div>
            )}
            {item.kind !== 'folder' && (connection?.provider === 'cloudflare-r2' || connection?.provider === 'qiniu-kodo') && !candidatePublicUrl && (
              <div className="flex flex-col gap-1">
                <dt className="text-muted-foreground">{i18n.t('fileDetails.publicFileLink')}</dt>
                <dd className="break-all text-muted-foreground">
                  {i18n.t('fileDetails.noPublicDomainPrefix')}
                  {connection.connectionId}
                  {i18n.t('fileDetails.noPublicDomainSuffix')}
                </dd>
              </div>
            )}
            {objectUrl && !candidatePublicUrl && (
              <div className="flex flex-col gap-1">
                <dt className="text-muted-foreground">{i18n.t('fileDetails.objectLink')}</dt>
                <dd className="flex flex-col gap-1.5">
                  <div className="group/link relative rounded-md bg-muted p-2 pr-10 font-mono text-xs">
                    <span className="block break-all">{objectUrl}</span>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="pointer-events-none absolute top-1 right-1 opacity-0 transition-opacity group-hover/link:pointer-events-auto group-hover/link:opacity-100 group-focus-within/link:pointer-events-auto group-focus-within/link:opacity-100"
                      aria-label={copiedLink === 'object' ? i18n.t('fileDetails.objectLinkCopiedStatus') : i18n.t('fileDetails.copyObjectLink')}
                      title={copiedLink === 'object' ? i18n.t('fileDetails.copied') : i18n.t('fileDetails.copyObjectLink')}
                      onClick={() => void copyLink(objectUrl, 'object')}
                    >
                      {copiedLink === 'object' ? <CheckIcon /> : <CopyIcon />}
                    </Button>
                  </div>
                  <span className="text-muted-foreground">
                    {connection?.provider === 'cloudflare-r2'
                      ? i18n.t('fileDetails.r2SignedUrlHint')
                      : connection?.provider === 'qiniu-kodo'
                        ? i18n.t('fileDetails.qiniuSignedUrlHint')
                        : connection?.provider === 'aws-s3'
                          ? i18n.t('fileDetails.s3PrivateObjectHint')
                          : connection?.provider === 'aliyun-oss'
                            ? i18n.t('fileDetails.ossPrivateObjectHint')
                            : connection?.provider === 'google-cloud-storage'
                              ? i18n.t('fileDetails.gcsPrivateObjectHint')
                              : i18n.t('fileDetails.cosPrivateObjectHint')}
                  </span>
                </dd>
              </div>
            )}
          </dl>
        </div>
        <DialogFooter className="shrink-0 flex-row flex-wrap">
          {item.kind === 'folder'
            ? (
                <Button onClick={() => onOpenFolder(item)}>
                  <FoldersIcon data-icon="inline-start" />
                  {i18n.t('common.open')}
                </Button>
              )
            : (
                <Button disabled={isDownloading} onClick={() => void downloadItems(path, [item])}>
                  <DownloadSimpleIcon data-icon="inline-start" />
                  {i18n.t('common.download')}
                </Button>
              )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
