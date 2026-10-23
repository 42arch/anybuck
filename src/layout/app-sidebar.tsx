import type { StorageConnectionEntry, StorageProvider } from '@/types/connection'
import type { View } from '@/types/view'
import {
  ClockCounterClockwiseIcon,
  CloudArrowUpIcon,
  CloudIcon,
  DatabaseIcon,
  FoldersIcon,
  GearSixIcon,
  PlusIcon,
  SpinnerIcon,
} from '@phosphor-icons/react'
import { useState } from 'react'
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

interface AppSidebarProps {
  view: View
  connections: StorageConnectionEntry[]
  connectingConnectionIds: ReadonlySet<string>
  activeConnectionId: string
  onViewChange: (view: View) => void
  onConnectionChange: (connectionId: string) => void
  onManageConnection: (connectionId: string) => void
  onConnectConnection: (connectionId: string) => void
  onDisconnectConnection: (connectionId: string) => void
  onAddConnection: (provider?: StorageProvider) => void
}

export function AppSidebar({ view, connections, connectingConnectionIds, activeConnectionId, onViewChange, onConnectionChange, onManageConnection, onConnectConnection, onDisconnectConnection, onAddConnection }: AppSidebarProps) {
  const { setOpenMobile } = useSidebar()
  const [expandedProviders, setExpandedProviders] = useState<StorageProvider[]>([
    'cloudflare-r2',
    'aws-s3',
    'tencent-cos',
    'aliyun-oss',
  ])
  const [selectedConnectionId, setSelectedConnectionId] = useState(activeConnectionId)
  const providerGroups: { id: StorageProvider, label: string }[] = [
    { id: 'cloudflare-r2', label: 'Cloudflare R2' },
    { id: 'aws-s3', label: 'AWS S3' },
    { id: 'tencent-cos', label: '腾讯云 COS' },
    { id: 'aliyun-oss', label: '阿里云 OSS' },
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

  function openConnectionDialog(provider: StorageProvider = 'cloudflare-r2') {
    setExpandedProviders(expanded => (expanded.includes(provider) ? expanded : [...expanded, provider]))
    setOpenMobile(false)
    onAddConnection(provider)
  }

  function manageConnection(connectionId: string) {
    setOpenMobile(false)
    onManageConnection(connectionId)
  }

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader className="gap-4 p-4">
        <div className="flex items-center gap-3 px-1 py-1">
          <span className="flex size-9 items-center justify-center rounded-lg bg-linear-to-br from-[#ff9d61] to-[#ea6636] text-white shadow-[0_8px_20px_#e86b3435]">
            <CloudIcon className="size-5" weight="fill" />
          </span>
          <div className="flex min-w-0 flex-col">
            <strong className="text-sm tracking-tight text-white">cloudstore</strong>
            <span className="text-xs text-muted-foreground">对象存储工作台</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-[#78879a]">工作台</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton className="data-active:[&>svg]:text-[#ff965f]" isActive={view === 'files'} onClick={() => selectView('files')}>
                  <FoldersIcon />
                  <span>文件管理</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton className="data-active:[&>svg]:text-[#ff965f]" isActive={view === 'transfers'} onClick={() => selectView('transfers')}>
                  <CloudArrowUpIcon />
                  <span>任务中心</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton className="data-active:[&>svg]:text-[#ff965f]" isActive={view === 'recent'} onClick={() => selectView('recent')}>
                  <ClockCounterClockwiseIcon />
                  <span>最近访问</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-[#78879a]">存储连接</SidebarGroupLabel>
          <SidebarGroupAction aria-label="添加连接" title="添加连接" onClick={() => openConnectionDialog()}>
            <PlusIcon />
          </SidebarGroupAction>
          <SidebarGroupContent className='pl-2'>
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
                  <AccordionTrigger className="h-8 cursor-pointer items-center gap-2 rounded-md font-normal text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:no-underline">
                    <div className="flex min-w-0 items-center gap-2 truncate">
                      <CloudIcon className="size-4 shrink-0" />
                      <span className="truncate">{group.label}</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-1">
                    <SidebarMenuSub className="mx-0 ml-1.5">
                      {connections.filter(item => item.provider === group.id).map(item => (
                        <SidebarMenuSubItem key={item.connectionId}>
                          <ContextMenu>
                            <ContextMenuTrigger
                              render={(
                                <SidebarMenuSubButton
                                  render={<button type="button" />}
                                  isActive={selectedConnectionId === item.connectionId || (view === 'files' && activeConnectionId === item.connectionId)}
                                  className="w-full [&>svg]:text-sidebar-foreground data-active:[&>svg]:text-[#ff955e]"
                                  aria-busy={connectingConnectionIds.has(item.connectionId)}
                                  onClick={() => selectConnectionItem(item)}
                                  onDoubleClick={() => onConnectConnection(item.connectionId)}
                                  title={item.name}
                                />
                              )}
                            >
                              <DatabaseIcon />
                              <span className="min-w-0 flex-1 truncate text-left">{item.name}</span>
                              {connectingConnectionIds.has(item.connectionId)
                                ? <SpinnerIcon className="size-3.5 shrink-0 animate-spin text-primary" role="status" aria-label="正在连接" />
                                : (
                                  <span
                                    role="status"
                                    aria-label={item.connected ? '已连接' : '已断开'}
                                    title={item.connected ? '已连接' : '已断开'}
                                    className={`size-2 shrink-0 rounded-full ${item.connected ? 'bg-emerald-500' : 'bg-muted-foreground/50'}`}
                                  />
                                )}
                            </ContextMenuTrigger>
                            <ContextMenuContent>
                              {item.connected
                                ? (
                                  <>
                                    <ContextMenuItem onClick={() => selectConnection(item.connectionId)}>切换到此连接</ContextMenuItem>
                                    <ContextMenuItem onClick={() => onDisconnectConnection(item.connectionId)}>断开连接</ContextMenuItem>
                                  </>
                                )
                                : <ContextMenuItem onClick={() => onConnectConnection(item.connectionId)}>连接</ContextMenuItem>}
                              <ContextMenuItem onClick={() => manageConnection(item.connectionId)}>查看连接管理</ContextMenuItem>
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
            <SidebarMenuButton className="data-active:[&>svg]:text-[#ff965f]" isActive={view === 'settings'} onClick={() => selectView('settings')}>
              <GearSixIcon />
              <span>设置</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
