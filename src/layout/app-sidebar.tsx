import type { StorageConnectionEntry, StorageProvider } from '@/types/connection'
import type { View } from '@/types/view'
import {
  ClockCounterClockwiseIcon,
  CloudArrowUpIcon,
  DatabaseIcon,
  FoldersIcon,
  GearSixIcon,
  PlusIcon,
  SpinnerIcon,
} from '@phosphor-icons/react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import anybuckLogo from '@/assets/logo.png'
import { RenameConnectionDialog } from '@/components/connection/rename-connection-dialog'
import { ProviderLogo } from '@/components/providers/provider-logo'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from '@/components/ui/sidebar'
import i18n from '@/i18n'
import { cn } from '@/lib/utils'

interface AppSidebarProps {
  view: View
  connections: StorageConnectionEntry[]
  savedConnectionIds: ReadonlySet<string>
  connectingConnectionIds: ReadonlySet<string>
  activeConnectionId: string
  onViewChange: (view: View) => void
  onConnectionChange: (connectionId: string) => void
  onManageConnection: (connectionId: string) => void
  onEditConnection: (connectionId: string) => void
  onConnectConnection: (connectionId: string) => void
  onDisconnectConnection: (connectionId: string) => void
  onAddConnection: () => void
}

export function AppSidebar({ view, connections, savedConnectionIds, connectingConnectionIds, activeConnectionId, onViewChange, onConnectionChange, onManageConnection, onEditConnection, onConnectConnection, onDisconnectConnection, onAddConnection }: AppSidebarProps) {
  const { t } = useTranslation()
  const { setOpenMobile } = useSidebar()
  const [expandedProviders, setExpandedProviders] = useState<StorageProvider[]>([
    'cloudflare-r2',
    'aws-s3',
    'tencent-cos',
    'aliyun-oss',
    'google-cloud-storage',
    'qiniu-kodo',
    'volcengine-tos',
  ])
  const [selectedConnectionId, setSelectedConnectionId] = useState(activeConnectionId)
  const [renamingConnection, setRenamingConnection] = useState<StorageConnectionEntry | null>(null)
  const providerGroups: { id: StorageProvider, label: string }[] = [
    { id: 'cloudflare-r2', label: 'Cloudflare R2' },
    { id: 'aws-s3', label: 'AWS S3' },
    { id: 'tencent-cos', label: i18n.t('providers.tencentCloudCos') },
    { id: 'aliyun-oss', label: i18n.t('providers.alibabaCloudOss') },
    { id: 'google-cloud-storage', label: 'Google Cloud Storage' },
    { id: 'qiniu-kodo', label: i18n.t('providers.qiniuKodo') },
    { id: 'volcengine-tos', label: i18n.t('providers.volcengineTos') },
  ]
  const visibleProviderGroups = providerGroups.filter(group => connections.some(item => item.provider === group.id))

  function selectView(nextView: View) {
    onViewChange(nextView)
    setOpenMobile(false)
  }

  function selectConnection(nextConnection: string) {
    onConnectionChange(nextConnection)
    selectView('files')
    setOpenMobile(false)
  }

  function selectConnectionItem(item: StorageConnectionEntry) {
    setSelectedConnectionId(item.connectionId)
    selectConnection(item.connectionId)
  }

  function openConnectionDialog() {
    setOpenMobile(false)
    onAddConnection()
  }

  function manageConnection(connectionId: string) {
    setOpenMobile(false)
    onManageConnection(connectionId)
  }

  function editConnection(connectionId: string) {
    setOpenMobile(false)
    onEditConnection(connectionId)
  }

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader className="gap-4 p-4">
        <div className="flex items-center gap-3 px-1 py-1">
          <img
            src={anybuckLogo}
            alt="AnyBuck"
            className="size-9 object-contain select-none"
          />
          <div className="flex min-w-0 flex-col">
            <strong className="text-sm tracking-tight text-sidebar-accent-foreground">AnyBuck</strong>
            <span className="text-xs text-sidebar-foreground">{t('nav.subtitle')}</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground">{t('nav.workspace')}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              <SidebarMenuItem>
                <SidebarMenuButton className="data-active:[&>svg]:text-sidebar-primary" isActive={view === 'files'} onClick={() => selectView('files')}>
                  <FoldersIcon />
                  <span>{t('nav.files')}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton className="data-active:[&>svg]:text-sidebar-primary" isActive={view === 'transfers'} onClick={() => selectView('transfers')}>
                  <CloudArrowUpIcon />
                  <span>{t('nav.transfers')}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton className="data-active:[&>svg]:text-sidebar-primary" isActive={view === 'recent'} onClick={() => selectView('recent')}>
                  <ClockCounterClockwiseIcon />
                  <span>{t('nav.recent')}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground">{t('nav.connections')}</SidebarGroupLabel>
          <SidebarGroupAction aria-label={t('nav.addConnection')} title={t('nav.addConnection')} onClick={() => openConnectionDialog()}>
            <PlusIcon />
          </SidebarGroupAction>
          <SidebarGroupContent className="pl-2">
            <Accordion
              multiple
              value={expandedProviders}
              onValueChange={val => setExpandedProviders(val as StorageProvider[])}
              className="flex w-full flex-col gap-px border-none"
            >
              {visibleProviderGroups.map(group => (
                <AccordionItem
                  key={group.id}
                  value={group.id}
                  className="border-none not-last:border-b-0 data-open:bg-transparent"
                >
                  <AccordionTrigger className="h-8 cursor-pointer items-center gap-2 rounded-md font-normal text-sidebar-foreground hover:bg-sidebar-surface hover:no-underline">
                    <div className="flex min-w-0 items-center gap-2 truncate">
                      <ProviderLogo provider={group.id} />
                      <span className="truncate">{group.label}</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-1">
                    <SidebarMenuSub className="mx-0 ml-1.5 px-2">
                      {connections.filter(item => item.provider === group.id).map(item => (
                        <SidebarMenuSubItem key={item.connectionId}>
                          <ContextMenu>
                            <ContextMenuTrigger
                              render={(
                                <SidebarMenuSubButton
                                  render={<button type="button" />}
                                  isActive={selectedConnectionId === item.connectionId || (view === 'files' && activeConnectionId === item.connectionId)}
                                  className="w-full"
                                  aria-busy={connectingConnectionIds.has(item.connectionId)}
                                  onClick={() => selectConnectionItem(item)}
                                  onDoubleClick={() => onConnectConnection(item.connectionId)}
                                  title={item.name}
                                />
                              )}
                            >
                              <span
                                role="status"
                                aria-label={connectingConnectionIds.has(item.connectionId) ? t('nav.connecting') : item.connected ? t('nav.connected') : t('nav.disconnected')}
                                title={connectingConnectionIds.has(item.connectionId) ? t('nav.connecting') : item.connected ? t('nav.connected') : t('nav.disconnected')}
                                className={cn('shrink-0', (connectingConnectionIds.has(item.connectionId) || item.connected) && 'text-primary')}
                              >
                                {connectingConnectionIds.has(item.connectionId)
                                  ? <SpinnerIcon className="size-4 animate-spin" />
                                  : <DatabaseIcon className="size-4" weight={item.connected ? 'fill' : 'regular'} />}
                              </span>
                              <span className="min-w-0 flex-1 truncate text-left">{item.name}</span>
                            </ContextMenuTrigger>
                            <ContextMenuContent>
                              {item.connected
                                ? (
                                    <>
                                      <ContextMenuItem onClick={() => selectConnection(item.connectionId)}>{t('nav.switchConnection')}</ContextMenuItem>
                                      <ContextMenuItem onClick={() => onDisconnectConnection(item.connectionId)}>{t('nav.disconnect')}</ContextMenuItem>
                                    </>
                                  )
                                : <ContextMenuItem onClick={() => onConnectConnection(item.connectionId)}>{t('nav.connect')}</ContextMenuItem>}
                              <ContextMenuItem onClick={() => setRenamingConnection(item)}>{t('nav.rename')}</ContextMenuItem>
                              {savedConnectionIds.has(item.connectionId) && (
                                <ContextMenuItem onClick={() => editConnection(item.connectionId)}>{t('common.edit')}</ContextMenuItem>
                              )}
                              <ContextMenuItem onClick={() => manageConnection(item.connectionId)}>{t('nav.manageConnection')}</ContextMenuItem>
                            </ContextMenuContent>
                          </ContextMenu>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton className="data-active:[&>svg]:text-sidebar-primary" isActive={view === 'settings'} onClick={() => selectView('settings')}>
              <GearSixIcon />
              <span>{t('common.settings')}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      {renamingConnection && (
        <RenameConnectionDialog
          key={renamingConnection.connectionId}
          connection={renamingConnection}
          onClose={() => setRenamingConnection(null)}
        />
      )}
    </Sidebar>
  )
}
