import type { StorageProvider } from '@/types/connection'
import type { View } from '@/types/view'
import { useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router'
import { ConnectionDialog } from '@/components/connection/connection-dialog'
import { TransferConfirmationDialogs } from '@/components/transfers/transfer-confirmation-dialogs'
import { TransferProgressToast } from '@/components/transfers/transfer-progress-toast'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { toast } from '@/components/ui/toast-manager'
import { useConnectionActions } from '@/hooks/use-connection-actions'
import { useConnectionSelection } from '@/hooks/use-connection-selection'
import { useFileTransfers } from '@/hooks/use-file-transfers'
import { useR2Connection } from '@/hooks/use-r2-connection'
import { useTransferTasks } from '@/hooks/use-transfer-tasks'
import { AppHeader } from '@/layout/app-header'
import { AppSidebar } from '@/layout/app-sidebar'
import { viewFromPath, viewPaths, viewTitles } from '@/lib/navigation'
import { useSettingsStore } from '@/store/settings-store'
import { FilesView } from '@/views/files'
import { RecentView } from '@/views/recent'
import { SettingsView } from '@/views/settings'
import { TransfersView } from '@/views/transfers'

export function AppLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const [addConnectionOpen, setAddConnectionOpen] = useState(false)
  const [newConnectionProvider, setNewConnectionProvider] = useState<StorageProvider>('cloudflare-r2')
  const [connectionDialogInstance, setConnectionDialogInstance] = useState(0)
  const { connection, connections, selectConnection, connectSavedConnection, disconnectConnection } = useR2Connection()
  const { defaultDownloadPath, setDefaultDownloadPath } = useSettingsStore()
  const view = viewFromPath(location.pathname)
  const { selectedConnection, bucketSelection, selectStorageConnection } = useConnectionSelection({
    connection,
    connections,
    selectConnection,
    onSelect: () => navigateToView('files'),
  })
  const { connectingConnectionIds, connectStorageConnection, disconnectStorageConnection } = useConnectionActions({
    connectSavedConnection,
    disconnectConnection,
    onConnected: () => navigateToView('files'),
  })
  const transferTasks = useTransferTasks()
  const {
    pendingUpload,
    pendingDownload,
    isSelectingFiles,
    uploadFiles,
    downloadItems,
    confirmUpload,
    confirmDownload,
    cancelUpload,
    cancelDownload,
  } = useFileTransfers({ connection, defaultDownloadPath, setDefaultDownloadPath, onNotice: showNotice })

  function showNotice(message: string) {
    toast.add({ title: message, type: 'info', timeout: 4500 })
  }

  function navigateToView(nextView: View) {
    navigate(viewPaths[nextView])
  }

  function openConnectionDialog(provider: StorageProvider = 'cloudflare-r2') {
    setNewConnectionProvider(provider)
    setConnectionDialogInstance(instance => instance + 1)
    setAddConnectionOpen(true)
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
        onManageConnection={() => navigateToView('settings')}
        onConnectConnection={connectionId => void connectStorageConnection(connectionId)}
        onDisconnectConnection={connectionId => void disconnectStorageConnection(connectionId)}
        onAddConnection={openConnectionDialog}
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
                    onAddConnection={() => openConnectionDialog()}
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
      <ConnectionDialog
        key={connectionDialogInstance}
        open={addConnectionOpen}
        initialProvider={newConnectionProvider}
        onOpenChange={setAddConnectionOpen}
        onNotice={showNotice}
      />
      <TransferConfirmationDialogs
        pendingUpload={pendingUpload}
        pendingDownload={pendingDownload}
        onCancelUpload={cancelUpload}
        onCancelDownload={cancelDownload}
        onConfirmUpload={() => void confirmUpload()}
        onConfirmDownload={action => void confirmDownload(action)}
      />
      <TransferProgressToast tasks={transferTasks} />
    </SidebarProvider>
  )
}
