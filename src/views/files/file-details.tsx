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
      showNotice('对象链接已复制。')
    }
    catch {
      showNotice('复制失败，请检查剪贴板权限。')
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
    ? '正在验证匿名访问…'
    : publicAccessQuery.isError
      ? '暂时无法验证匿名访问，请稍后重新检查。'
      : isPublic
        ? '已确认此文件可匿名访问。'
        : publicAccessQuery.data?.statusCode === 403
          ? 'HTTP 403：请检查公开访问是否已开启，以及域名是否绑定当前 Bucket。'
          : publicAccessQuery.data?.statusCode === 404
            ? 'HTTP 404：请检查域名绑定的 Bucket 和文件路径。'
            : `HTTP ${publicAccessQuery.data?.statusCode ?? '未知'}：此链接尚未通过匿名访问检查。`

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent className="flex max-h-[calc(100svh-2rem)] min-h-0 flex-col gap-3 sm:max-w-lg">
        <DialogHeader className="shrink-0">
          <DialogTitle>{item.kind === 'folder' ? '文件夹详情' : '文件详情'}</DialogTitle>
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
            {browserUrl && (
              <div className="flex flex-col gap-1">
                <dt className="text-muted-foreground">Google 登录访问链接</dt>
                <dd className="flex flex-col gap-1.5">
                  <div className="group/link relative min-w-0 rounded-md bg-muted p-2 pr-10 font-mono text-xs">
                    <span className="block break-all">{browserUrl}</span>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="pointer-events-none absolute top-1 right-1 opacity-0 transition-opacity group-hover/link:pointer-events-auto group-hover/link:opacity-100 group-focus-within/link:pointer-events-auto group-focus-within/link:opacity-100"
                      aria-label={copiedLink === 'browser' ? '已复制登录访问链接' : '复制登录访问链接'}
                      title={copiedLink === 'browser' ? '已复制' : '复制登录访问链接'}
                      onClick={() => void copyLink(browserUrl, 'browser')}
                    >
                      {copiedLink === 'browser' ? <CheckIcon /> : <CopyIcon />}
                    </Button>
                  </div>
                  <span className="text-muted-foreground">需要登录有该对象读取权限的 Google 账号；此链接不能用于匿名分享。</span>
                </dd>
              </div>
            )}
            {candidatePublicUrl && (
              <div className="flex flex-col gap-1">
                <dt className="text-muted-foreground">{isPublic ? '公开文件链接' : connection?.provider === 'google-cloud-storage' ? '匿名访问链接（尚未验证公开）' : '域名链接'}</dt>
                <dd className="flex flex-col gap-1.5">
                  <div className="group/link relative min-w-0 rounded-md bg-muted p-2 pr-10 font-mono text-xs">
                    <span className="block break-all">{candidatePublicUrl}</span>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="pointer-events-none absolute top-1 right-1 opacity-0 transition-opacity group-hover/link:pointer-events-auto group-hover/link:opacity-100 group-focus-within/link:pointer-events-auto group-focus-within/link:opacity-100"
                      aria-label={copiedLink === 'public' ? '已复制公开链接' : isPublic ? '复制公开链接' : '复制链接'}
                      title={copiedLink === 'public' ? '已复制' : isPublic ? '复制公开链接' : '复制链接'}
                      onClick={() => void copyLink(candidatePublicUrl, 'public')}
                    >
                      {copiedLink === 'public' ? <CheckIcon /> : <CopyIcon />}
                    </Button>
                  </div>
                  <span className="text-muted-foreground">
                    {connection?.provider === 'google-cloud-storage' && publicAccessQuery.data?.statusCode === 403
                      ? 'HTTP 403：匿名访问被拒绝。Google 登录访问链接可用并不代表对象已公开；请检查 Bucket 的公开访问阻止策略及 allUsers 权限。'
                      : publicStatus}
                  </span>
                  <Button variant="outline" size="sm" className="self-start" disabled={publicAccessQuery.isFetching} onClick={() => void publicAccessQuery.refetch()}>
                    重新检查
                  </Button>
                </dd>
              </div>
            )}
            {item.kind !== 'folder' && (connection?.provider === 'cloudflare-r2' || connection?.provider === 'qiniu-kodo') && !candidatePublicUrl && (
              <div className="flex flex-col gap-1">
                <dt className="text-muted-foreground">公开文件链接</dt>
                <dd className="break-all text-muted-foreground">
                  当前连接（ID：
                  {connection.connectionId}
                  ）尚未配置公开访问域名，请在连接管理中找到该连接并保存域名。
                </dd>
              </div>
            )}
            {objectUrl && !candidatePublicUrl && (
              <div className="flex flex-col gap-1">
                <dt className="text-muted-foreground">对象链接</dt>
                <dd className="flex flex-col gap-1.5">
                  <div className="group/link relative rounded-md bg-muted p-2 pr-10 font-mono text-xs">
                    <span className="block break-all">{objectUrl}</span>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="pointer-events-none absolute top-1 right-1 opacity-0 transition-opacity group-hover/link:pointer-events-auto group-hover/link:opacity-100 group-focus-within/link:pointer-events-auto group-focus-within/link:opacity-100"
                      aria-label={copiedLink === 'object' ? '已复制对象链接' : '复制对象链接'}
                      title={copiedLink === 'object' ? '已复制' : '复制对象链接'}
                      onClick={() => void copyLink(objectUrl, 'object')}
                    >
                      {copiedLink === 'object' ? <CheckIcon /> : <CopyIcon />}
                    </Button>
                  </div>
                  <span className="text-muted-foreground">
                    {connection?.provider === 'cloudflare-r2'
                      ? '这是 R2 S3 API 地址，直接访问需要签名；公开访问需配置公开域名。'
                      : connection?.provider === 'qiniu-kodo'
                        ? '这是七牛 S3 API 地址，直接访问需要签名；公开访问需配置空间绑定域名。'
                        : connection?.provider === 'aws-s3'
                          ? '私有对象需要签名链接才能访问；公开读取取决于该 S3 Bucket 和对象的访问权限。'
                          : connection?.provider === 'aliyun-oss'
                            ? '私有对象需要签名链接才能访问；公开读取取决于该 OSS Bucket 和对象的访问权限。'
                            : connection?.provider === 'google-cloud-storage'
                              ? '私有对象需要签名链接才能访问；公开读取取决于该 GCS Bucket 和对象的访问权限。'
                              : '私有对象需要签名链接才能访问；部分 COS Bucket 的默认域名不支持浏览器预览。'}
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
                  打开
                </Button>
              )
            : (
                <Button disabled={isDownloading} onClick={() => void downloadItems(path, [item])}>
                  <DownloadSimpleIcon data-icon="inline-start" />
                  下载
                </Button>
              )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
