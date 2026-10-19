import type { View } from '@/features/storage/models'
import { X } from '@phosphor-icons/react'
import { useState } from 'react'
import { HashRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router'
import { AppHeader } from '@/components/app-header'
import { AppSidebar } from '@/components/app-sidebar'
import { PageHeading } from '@/components/page-heading'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { Toaster } from '@/components/ui/toast'
import { toast } from '@/components/ui/toast-manager'
import { useR2Connection } from '@/features/storage/r2-connection-context'
import { R2ConnectionProvider } from '@/features/storage/r2-connection-provider'
import { FilesView } from '@/pages/files/files-page'
import { RecentView } from '@/pages/recent/recent-page'
import { SettingsView } from '@/pages/settings/settings-page'
import { TransfersView } from '@/pages/transfers/transfers-page'

const viewTitles: Record<View, string> = {
  files: '文件管理',
  transfers: '传输任务',
  recent: '最近访问',
  settings: '设置',
}

const viewDescriptions: Record<View, string> = {
  files: '浏览、整理和管理你的云端文件。',
  transfers: '查看上传和下载任务的进度。',
  recent: '快速回到最近访问的文件。',
  settings: '管理应用和存储连接偏好。',
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
        <R2ConnectionProvider>
          <AppLayout />
        </R2ConnectionProvider>
      </HashRouter>
    </Toaster>
  )
}

function AppLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const { connection, connections, selectConnection, connectSavedConnection, disconnectConnection } = useR2Connection()
  const view = viewFromPath(location.pathname)
  const [addConnectionOpen, setAddConnectionOpen] = useState(false)
  const [bucketSelection, setBucketSelection] = useState(0)
  const [selectedConnectionId, setSelectedConnectionId] = useState('')
  const selectedConnection = connections.find(item => item.connectionId === selectedConnectionId) ?? connection

  function showNotice(message: string) {
    toast.add({ title: message, type: 'info', timeout: 4500 })
  }

  function navigateToView(nextView: View) {
    navigate(viewPaths[nextView])
  }

  function showUnavailableUpload() {
    showNotice(connection ? '上传文件功能尚未接入。' : '请先在设置中连接 Cloudflare R2。')
  }

  function selectStorageConnection(connectionId: string) {
    setSelectedConnectionId(connectionId)
    if (connectionId === connection?.connectionId)
      setBucketSelection(current => current + 1)
    selectConnection(connectionId)
    navigateToView('files')
  }

  async function connectStorageConnection(connectionId: string) {
    try {
      await connectSavedConnection(connectionId)
      navigateToView('files')
    }
    catch (cause) {
      toast.add({ title: `连接失败：${cause instanceof Error ? cause.message : String(cause)}`, type: 'error', timeout: 4500 })
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
        activeConnectionId={connection?.connectionId ?? ''}
        onViewChange={navigateToView}
        onConnectionChange={selectStorageConnection}
        onConnectConnection={connectionId => void connectStorageConnection(connectionId)}
        onDisconnectConnection={connectionId => void disconnectStorageConnection(connectionId)}
        onAddConnection={() => setAddConnectionOpen(true)}
      />
      <SidebarInset className="h-svh min-h-0 min-w-0 overflow-hidden bg-background">
        <AppHeader title={viewTitles[view]} connected={Boolean(connection)} />
        <div className="mx-auto flex min-h-0 w-full max-w-screen-2xl flex-1 flex-col gap-6 overflow-y-auto p-4 md:p-6">
          <PageHeading
            title={viewTitles[view]}
            description={viewDescriptions[view]}
            section={view === 'files' ? '文件浏览器' : '工作台'}
            showUpload={view === 'files' || view === 'transfers'}
            onUpload={showUnavailableUpload}
          />
          <div className="flex min-h-0 flex-1 flex-col">
            <Routes>
              <Route path="/" element={<Navigate to={viewPaths.files} replace />} />
              <Route
                path="/files/*"
                element={(
                  <FilesView
                    key={`${connection?.connectionId ?? 'none'}:${bucketSelection}`}
                    selectedConnection={selectedConnection}
                    onNavigateToSettings={() => navigateToView('settings')}
                    onNotice={showNotice}
                  />
                )}
              />
              <Route path="/transfers" element={<TransfersView />} />
              <Route path="/recent" element={<RecentView />} />
              <Route path="/settings" element={<SettingsView onNotice={showNotice} />} />
              <Route path="*" element={<Navigate to={viewPaths.files} replace />} />
            </Routes>
          </div>
        </div>
      </SidebarInset>
      <Drawer open={addConnectionOpen} onOpenChange={setAddConnectionOpen} swipeDirection="right">
        <DrawerContent className="w-[min(32rem,calc(100vw-1rem))]">
          <DrawerHeader className="text-left">
            <div className="flex items-start justify-between gap-4">
              <DrawerTitle>添加存储连接</DrawerTitle>
              <Button variant="ghost" size="icon-sm" aria-label="关闭添加连接" onClick={() => setAddConnectionOpen(false)}>
                <X />
              </Button>
            </div>
            <DrawerDescription>填写 Cloudflare R2 账号和 Bucket 信息。</DrawerDescription>
          </DrawerHeader>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <SettingsView
              layout="drawer"
              onNotice={showNotice}
              onConnected={() => setAddConnectionOpen(false)}
            />
          </div>
        </DrawerContent>
      </Drawer>
    </SidebarProvider>
  )
}

export default App
