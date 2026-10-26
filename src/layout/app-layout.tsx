import type { StorageProvider } from '@/types/connection'
import type { View } from '@/types/view'
import { useEffect, useRef } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router'
import { ConnectionDialog } from '@/components/connection/connection-dialog'
import { TransferConfirmationDialogs } from '@/components/transfers/transfer-confirmation-dialogs'
import { TransferProgressToast } from '@/components/transfers/transfer-progress-toast'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { useAppUpdateQuery } from '@/hooks/use-app-update-query'
import { useConnectionActions } from '@/hooks/use-connection-actions'
import { useStorageConnection } from '@/hooks/use-storage-connection'
import { useTransferTasks } from '@/hooks/use-transfer-tasks'
import { AppHeader } from '@/layout/app-header'
import { AppSidebar } from '@/layout/app-sidebar'
import { viewFromPath, viewPaths, viewTitles } from '@/lib/navigation'
import { showNotice } from '@/lib/notice'
import { useConnectionDialogStore } from '@/store/connection-dialog-store'
import { FilesView } from '@/views/files'
import { RecentView } from '@/views/recent'
import { SettingsView } from '@/views/settings'
import { TransfersView } from '@/views/transfers'

export function AppLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const openConnectionDialog = useConnectionDialogStore(state => state.openDialog)
  const { connection, connections, selectConnection, connectSavedConnection, disconnectConnection } = useStorageConnection()
  const view = viewFromPath(location.pathname)

  const { connectingConnectionIds, connectStorageConnection, disconnectStorageConnection } = useConnectionActions({
    connectSavedConnection,
    disconnectConnection,
    onConnected: () => navigateToView('files'),
  })
  const transferTasks = useTransferTasks()
  const { data: availableUpdate } = useAppUpdateQuery()
  const notifiedUpdateVersionRef = useRef<string | null>(null)

  useEffect(() => {
    if (availableUpdate && notifiedUpdateVersionRef.current !== availableUpdate.version) {
      notifiedUpdateVersionRef.current = availableUpdate.version
      showNotice(`发现新版本 ${availableUpdate.version}，可在设置中安装。`)
    }
  }, [availableUpdate])

  function navigateToView(nextView: View) {
    navigate(viewPaths[nextView])
  }

  function selectStorageConnection(connectionId: string) {
    selectConnection(connectionId)
    navigateToView('files')
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
        onAddConnection={(provider?: StorageProvider) => openConnectionDialog(provider)}
      />
      <SidebarInset className="h-svh min-h-0 min-w-0 overflow-hidden bg-background">
        <AppHeader title={viewTitles[view]} connected={Boolean(connection)} />
        <div className="mx-auto flex min-h-0 w-full max-w-screen-2xl flex-1 flex-col gap-4 overflow-y-auto p-2 md:p-3">
          <div className="flex min-h-0 flex-1 flex-col">
            <Routes>
              <Route path="/" element={<Navigate to={viewPaths.files} replace />} />
              <Route path="/files/*" element={<FilesView />} />
              <Route path="/transfers" element={<TransfersView tasks={transferTasks} onNotice={showNotice} />} />
              <Route path="/recent" element={<RecentView />} />
              <Route path="/settings" element={<SettingsView onNotice={showNotice} />} />
              <Route path="*" element={<Navigate to={viewPaths.files} replace />} />
            </Routes>
          </div>
        </div>
      </SidebarInset>
      <ConnectionDialog />
      <TransferConfirmationDialogs />
      <TransferProgressToast tasks={transferTasks} />
    </SidebarProvider>
  )
}
