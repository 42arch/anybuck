import type { DownloadPlanSummary, TransferTask } from '@/api/storage'
import type { View } from '@/types/view'
import { CloudArrowUpIcon, SpinnerIcon } from '@phosphor-icons/react'
import { useQueryClient } from '@tanstack/react-query'
import { open } from '@tauri-apps/plugin-dialog'
import { useEffect, useState } from 'react'
import { HashRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router'
import { enqueueR2Download, enqueueR2Uploads, listTransferTasks, onTransferHistoryCleared, onTransferTaskUpdated, prepareR2Download } from '@/api/storage'
import { AppHeader } from '@/components/app-header'
import { AppSidebar } from '@/components/app-sidebar'
import { ConnectionDrawer } from '@/components/connection/connection-drawer'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { Toaster } from '@/components/ui/toast'
import { toast } from '@/components/ui/toast-manager'
import { FilesView } from '@/pages/files'
import { RecentView } from '@/pages/recent'
import { SettingsView } from '@/pages/settings'
import { TransfersView } from '@/pages/transfers'
import { useR2Connection } from '@/store/r2-connection-store'
import { useSettingsStore } from '@/store/settings-store'

const viewTitles: Record<View, string> = {
  files: '文件管理',
  transfers: '传输任务',
  recent: '最近访问',
  settings: '设置',
}

const viewPaths: Record<View, string> = {
  files: '/files',
  transfers: '/transfers',
  recent: '/recent',
  settings: '/settings',
}

function viewFromPath(pathname: string): View {
  if (pathname.startsWith('/transfers'))
    return 'transfers'
  if (pathname.startsWith('/recent'))
    return 'recent'
  if (pathname.startsWith('/settings'))
    return 'settings'
  return 'files'
}

function App() {
  return (
    <Toaster>
      <HashRouter>
        <AppLayout />
      </HashRouter>
    </Toaster>
  )
}

function AppLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { connection, connections, selectConnection, connectSavedConnection, disconnectConnection } = useR2Connection()
  const { defaultDownloadPath, setDefaultDownloadPath } = useSettingsStore()
  const view = viewFromPath(location.pathname)
  const [addConnectionOpen, setAddConnectionOpen] = useState(false)
  const [bucketSelection, setBucketSelection] = useState(0)
  const [selectedConnectionId, setSelectedConnectionId] = useState('')
  const [pendingUpload, setPendingUpload] = useState<{ connectionId: string, bucket: string, prefix: string, paths: string[] } | null>(null)
  const [pendingDownload, setPendingDownload] = useState<DownloadPlanSummary | null>(null)
  const [isSelectingFiles, setIsSelectingFiles] = useState(false)
  const [transferTasks, setTransferTasks] = useState<TransferTask[]>([])
  const [connectingConnectionIds, setConnectingConnectionIds] = useState<Set<string>>(() => new Set())
  const selectedConnection = connection ?? connections.find(item => item.connectionId === selectedConnectionId) ?? null
  const activeTransfer = transferTasks.find(task => task.operation !== 'folder' && task.status === 'running')

  useEffect(() => {
    let mounted = true
    let unlistenTask: (() => void) | undefined
    let unlistenClear: (() => void) | undefined
    void Promise.all([
      onTransferTaskUpdated((task) => {
        setTransferTasks(current => [...current.filter(item => item.id !== task.id), task])
        if (task.operation === 'upload' && task.status === 'completed') {
          void queryClient.invalidateQueries({ queryKey: ['storage', 'r2', 'objects', task.connectionId] })
        }
      }),
      onTransferHistoryCleared(() => setTransferTasks(current => current.filter(task => !['completed', 'failed', 'cancelled', 'interrupted', 'skipped'].includes(task.status)))),
    ]).then(([taskListener, clearListener]) => {
      if (mounted) {
        unlistenTask = taskListener
        unlistenClear = clearListener
        void listTransferTasks().then((tasks) => {
          if (!mounted)
            return
          setTransferTasks((current) => {
            const newest = new Map(tasks.map(task => [task.id, task]))
            for (const task of current) {
              const snapshotTask = newest.get(task.id)
              if (!snapshotTask || task.updatedAt > snapshotTask.updatedAt)
                newest.set(task.id, task)
            }
            return [...newest.values()]
          })
        }).catch(() => {})
      }
      else {
        taskListener()
        clearListener()
      }
    })
    return () => {
      mounted = false
      unlistenTask?.()
      unlistenClear?.()
    }
  }, [queryClient])

  function showNotice(message: string) {
    toast.add({ title: message, type: 'info', timeout: 4500 })
  }

  function navigateToView(nextView: View) {
    navigate(viewPaths[nextView])
  }

  async function uploadFiles(prefix = '') {
    if (pendingUpload || isSelectingFiles)
      return
    if (!connection) {
      showNotice('请先添加并连接 Cloudflare R2。')
      return
    }

    let selection: string | string[] | null
    setIsSelectingFiles(true)
    try {
      selection = await open({ multiple: true, directory: false, title: '选择要上传的文件' })
    }
    catch (cause) {
      showNotice(`无法打开文件选择器：${cause instanceof Error ? cause.message : String(cause)}`)
      return
    }
    finally {
      setIsSelectingFiles(false)
    }
    const paths = selection ? Array.isArray(selection) ? selection : [selection] : []
    if (paths.length === 0)
      return

    setPendingUpload({ connectionId: connection.connectionId, bucket: connection.bucket, prefix, paths })
  }

  async function confirmUpload() {
    if (!pendingUpload)
      return

    const { connectionId, prefix, paths } = pendingUpload
    setPendingUpload(null)
    try {
      const tasks = await enqueueR2Uploads(connectionId, prefix, paths)
      showNotice(`已加入 ${tasks.length} 个上传任务。`)
    }
    catch (cause) {
      showNotice(`无法加入上传任务：${cause instanceof Error ? cause.message : String(cause)}`)
    }
  }

  async function downloadItems(prefix: string, items: { id: string, name: string }[]) {
    if (items.length === 0 || pendingUpload || pendingDownload || isSelectingFiles)
      return
    if (!connection) {
      showNotice('请先连接 Cloudflare R2。')
      return
    }

    let destinationPath = defaultDownloadPath
    if (!destinationPath) {
      try {
        const selectedPath = await open({ directory: true, multiple: false, title: '选择下载位置' })
        if (typeof selectedPath !== 'string')
          return
        destinationPath = selectedPath
        setDefaultDownloadPath(selectedPath)
      }
      catch (cause) {
        showNotice(`无法打开目录选择器：${cause instanceof Error ? cause.message : String(cause)}`)
        return
      }
    }

    try {
      const plan = await prepareR2Download(
        connection.connectionId,
        prefix,
        items.map(item => item.id),
        destinationPath,
      )
      if (plan.conflicts.length > 0) {
        setPendingDownload(plan)
      }
      else {
        const tasks = await enqueueR2Download(plan.planId, 'overwrite')
        showNotice(`已加入 ${tasks.filter(task => task.operation === 'download').length} 个下载任务。`)
      }
    }
    catch (cause) {
      showNotice(`无法加入下载任务：${cause instanceof Error ? cause.message : String(cause)}`)
    }
  }

  async function confirmDownload(conflictAction: 'overwrite' | 'skip') {
    if (!pendingDownload)
      return
    const plan = pendingDownload
    setPendingDownload(null)
    try {
      const tasks = await enqueueR2Download(plan.planId, conflictAction)
      showNotice(`已加入 ${tasks.filter(task => task.operation === 'download').length} 个下载任务。`)
    }
    catch (cause) {
      showNotice(`无法加入下载任务：${cause instanceof Error ? cause.message : String(cause)}`)
    }
  }

  function openConnectionDrawer() {
    setAddConnectionOpen(true)
  }

  function openConnectionSettings() {
    navigateToView('settings')
  }

  function selectStorageConnection(connectionId: string) {
    setSelectedConnectionId(connectionId)
    if (connectionId === connection?.connectionId)
      setBucketSelection(current => current + 1)
    selectConnection(connectionId)
    navigateToView('files')
  }

  async function connectStorageConnection(connectionId: string) {
    if (connectingConnectionIds.has(connectionId))
      return
    setConnectingConnectionIds(current => new Set(current).add(connectionId))
    try {
      await connectSavedConnection(connectionId)
      navigateToView('files')
    }
    catch (cause) {
      toast.add({ title: `连接失败：${cause instanceof Error ? cause.message : String(cause)}`, type: 'error', timeout: 4500 })
    }
    finally {
      setConnectingConnectionIds((current) => {
        const next = new Set(current)
        next.delete(connectionId)
        return next
      })
    }
  }

  async function disconnectStorageConnection(connectionId: string) {
    try {
      await disconnectConnection(connectionId)
    }
    catch (cause) {
      toast.add({ title: `断开连接失败：${cause instanceof Error ? cause.message : String(cause)}`, type: 'error', timeout: 4500 })
    }
  }

  return (
    <SidebarProvider>
      <AppSidebar
        view={view}
        connections={connections}
        connectingConnectionIds={connectingConnectionIds}
        activeConnectionId={connection?.connectionId ?? ''}
        onViewChange={navigateToView}
        onConnectionChange={selectStorageConnection}
        onManageConnection={openConnectionSettings}
        onConnectConnection={connectionId => void connectStorageConnection(connectionId)}
        onDisconnectConnection={connectionId => void disconnectStorageConnection(connectionId)}
        onAddConnection={openConnectionDrawer}
      />
      <SidebarInset className="h-svh min-h-0 min-w-0 overflow-hidden bg-background">
        <AppHeader title={viewTitles[view]} connected={Boolean(connection)} />
        <div className="mx-auto flex min-h-0 w-full max-w-screen-2xl flex-1 flex-col gap-6 overflow-y-auto p-3 md:p-4">
          <div className="flex min-h-0 flex-1 flex-col">
            <Routes>
              <Route path="/" element={<Navigate to={viewPaths.files} replace />} />
              <Route
                path="/files/*"
                element={(
                  <FilesView
                    key={`${connection?.connectionId ?? 'none'}:${bucketSelection}`}
                    selectedConnection={selectedConnection}
                    onAddConnection={openConnectionDrawer}
                    onUpload={prefix => void uploadFiles(prefix)}
                    isUploading={Boolean(isSelectingFiles || pendingUpload)}
                    onDownload={(prefix, items) => void downloadItems(prefix, items)}
                    isDownloading={Boolean(pendingDownload)}
                    onNotice={showNotice}
                  />
                )}
              />
              <Route path="/transfers" element={<TransfersView tasks={transferTasks} onNotice={showNotice} />} />
              <Route path="/recent" element={<RecentView />} />
              <Route path="/settings" element={<SettingsView onNotice={showNotice} />} />
              <Route path="*" element={<Navigate to={viewPaths.files} replace />} />
            </Routes>
          </div>
        </div>
      </SidebarInset>
      <ConnectionDrawer
        open={addConnectionOpen}
        onOpenChange={setAddConnectionOpen}
        onNotice={showNotice}
      />
      <Dialog open={Boolean(pendingUpload)} onOpenChange={open => !open && setPendingUpload(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认上传文件</DialogTitle>
            <DialogDescription>
              即将上传
              {' '}
              <strong className="font-semibold text-foreground">
                {pendingUpload?.paths.length ?? 0}
                {' '}
                个文件
              </strong>
              {' '}
              到
              {' '}
              <strong className="font-semibold text-foreground">
                {pendingUpload ? `${pendingUpload.bucket}/${pendingUpload.prefix ? `${pendingUpload.prefix}/` : ''}` : ''}
              </strong>
              。同名对象会被覆盖，确定继续吗？
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingUpload(null)}>取消</Button>
            <Button onClick={() => void confirmUpload()}>
              <CloudArrowUpIcon data-icon="inline-start" />
              开始上传
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(pendingDownload)} onOpenChange={open => !open && setPendingDownload(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>处理同名文件</DialogTitle>
            <DialogDescription>
              目标目录中已有
              {' '}
              <strong className="font-semibold text-foreground">
                {pendingDownload?.conflicts.length ?? 0}
                {' '}
                个文件
              </strong>
              。此选择将应用于全部冲突文件。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => void confirmDownload('skip')}>跳过冲突文件</Button>
            <Button onClick={() => void confirmDownload('overwrite')}>覆盖冲突文件</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {activeTransfer && (
        <div
          role="status"
          aria-live="polite"
          className="fixed right-4 bottom-4 z-[60] flex w-[min(22rem,calc(100vw-2rem))] items-center gap-3 rounded-lg border bg-popover px-4 py-3 text-popover-foreground shadow-lg"
        >
          <SpinnerIcon className="size-4 shrink-0 animate-spin text-primary" />
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-xs font-medium">
              正在
              {activeTransfer.operation === 'upload' ? '上传' : '下载'}
              文件
            </span>
            <span className="truncate text-xs text-muted-foreground" title={activeTransfer.displayName}>{activeTransfer.displayName}</span>
          </div>
        </div>
      )}
    </SidebarProvider>
  )
}

export default App
