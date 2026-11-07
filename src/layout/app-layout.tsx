import type { View } from '@/types/view'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router'
import { ConnectionDialog } from '@/components/connection/connection-dialog'
import { TransferConfirmationDialogs } from '@/components/transfers/transfer-confirmation-dialogs'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { useAppUpdateQuery } from '@/hooks/use-app-update-query'
import { useConnectionActions } from '@/hooks/use-connection-actions'
import { useStorageConnection } from '@/hooks/use-storage-connection'
import { useTransferTasks } from '@/hooks/use-transfer-tasks'
import { AppHeader } from '@/layout/app-header'
import { AppSidebar } from '@/layout/app-sidebar'
import { viewFromPath, viewPaths, viewTitleKeys } from '@/lib/navigation'
import { showNotice } from '@/lib/notice'
import { useConnectionDialogStore } from '@/store/connection-dialog-store'
import { FilesView } from '@/views/files'
import { RecentView } from '@/views/recent'
import { SettingsView } from '@/views/settings'
import { TransfersView } from '@/views/transfers'

export function AppLayout() {
  const { t } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()
  const openConnectionDialog = useConnectionDialogStore(state => state.openDialog)
  const connectionDialogInstance = useConnectionDialogStore(state => state.dialogInstance)
  const { connection, connections, savedConnections, selectConnection, connectSavedConnection, disconnectConnection } = useStorageConnection()
  const [editingConnectionId, setEditingConnectionId] = useState<string | null>(null)
  const editingProfile = savedConnections.find(profile => profile.id === editingConnectionId)
  const savedConnectionIds = new Set(savedConnections.map(profile => profile.id))
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
      showNotice(t('dynamic.updateAvailable', { version: availableUpdate.version }))
    }
  }, [availableUpdate, t])

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
        savedConnectionIds={savedConnectionIds}
        connectingConnectionIds={connectingConnectionIds}
        activeConnectionId={connection?.connectionId ?? ''}
        onViewChange={navigateToView}
        onConnectionChange={selectStorageConnection}
        onManageConnection={() => navigateToView('settings')}
        onEditConnection={setEditingConnectionId}
        onConnectConnection={connectionId => void connectStorageConnection(connectionId)}
        onDisconnectConnection={connectionId => void disconnectStorageConnection(connectionId)}
        onAddConnection={openConnectionDialog}
      />
      <SidebarInset className="h-svh min-h-0 min-w-0 overflow-hidden bg-background">
        <AppHeader
          title={t(viewTitleKeys[view])}
          connected={Boolean(connection)}
          tasks={transferTasks}
          onViewTransfers={() => navigateToView('transfers')}
        />
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
      <ConnectionDialog key={connectionDialogInstance} />
      {editingProfile && (
        <ConnectionDialog
          key={editingProfile.id}
          open
          editProfile={editingProfile}
          onOpenChange={open => !open && setEditingConnectionId(null)}
        />
      )}
      <TransferConfirmationDialogs />
    </SidebarProvider>
  )
}
