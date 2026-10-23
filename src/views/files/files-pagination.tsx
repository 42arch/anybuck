import { InfinityIcon, ListNumbersIcon } from '@phosphor-icons/react'
import { Fragment } from 'react'
import { Button } from '@/components/ui/button'
import { CardFooter } from '@/components/ui/card'
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination'
import { Spinner } from '@/components/ui/spinner'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface FilesPaginationProps {
  hasRemoteConnection: boolean
  isCounting: boolean
  countError?: string
  displayMode: 'pagination' | 'infinite'
  loadedCount: number
  totalCount?: number
  currentPage: number
  pageCount?: number
  canGoToNextPage: boolean
  hasNextPage: boolean
  isLoadingPage: boolean
  onRetryCount: () => void
  onPageChange: (page: number) => void
  onLoadMore: () => void
  onDisplayModeChange: (mode: 'pagination' | 'infinite') => void
}

export function FilesPagination({
  hasRemoteConnection,
  isCounting,
  countError,
  displayMode,
  loadedCount,
  totalCount,
  currentPage,
  pageCount,
  canGoToNextPage,
  hasNextPage,
  isLoadingPage,
  onRetryCount,
  onPageChange,
  onLoadMore,
  onDisplayModeChange,
}: FilesPaginationProps) {
  const canGoToPreviousPage = currentPage > 1

  return (
    <CardFooter className="justify-between gap-3 border-t pt-3 text-xs text-muted-foreground">
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate">
          {!hasRemoteConnection
            ? '尚未连接存储桶'
            : isCounting
              ? '正在统计对象数量…'
              : countError
                ? '对象总数获取失败'
                : displayMode === 'infinite'
                  ? `已加载 ${loadedCount} / ${totalCount ?? 0} 个项目`
                  : `共 ${totalCount ?? 0} 个项目`}
        </span>
        {countError && (
          <Button variant="link" size="sm" className="h-auto shrink-0 p-0" onClick={onRetryCount}>
            重试
          </Button>
        )}
      </div>
      {hasRemoteConnection && (
        <div className="flex shrink-0 items-center gap-2">
          {displayMode === 'pagination'
            ? (
                <Pagination className="mx-0 w-auto">
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        href="#"
                        text="上一页"
                        aria-disabled={!canGoToPreviousPage || isLoadingPage}
                        className={cn((!canGoToPreviousPage || isLoadingPage) && 'pointer-events-none opacity-50')}
                        onClick={(event) => {
                          event.preventDefault()
                          if (canGoToPreviousPage && !isLoadingPage)
                            onPageChange(currentPage - 1)
                        }}
                      />
                    </PaginationItem>
                    {pageCount && Array.from({ length: pageCount }, (_, index) => index + 1)
                      .filter(page => page === 1 || page === pageCount || Math.abs(page - currentPage) <= 1)
                      .map((page, index, pages) => (
                        <Fragment key={page}>
                          {index > 0 && page - pages[index - 1] > 1 && (
                            <PaginationItem><PaginationEllipsis /></PaginationItem>
                          )}
                          <PaginationItem>
                            <PaginationLink
                              href="#"
                              isActive={page === currentPage}
                              aria-label={`第 ${page} 页`}
                              aria-current={page === currentPage ? 'page' : undefined}
                              aria-disabled={isLoadingPage}
                              className={cn(isLoadingPage && 'pointer-events-none opacity-50')}
                              onClick={(event) => {
                                event.preventDefault()
                                if (!isLoadingPage)
                                  onPageChange(page)
                              }}
                            >
                              {page}
                            </PaginationLink>
                          </PaginationItem>
                        </Fragment>
                      ))}
                    <PaginationItem>
                      <PaginationNext
                        href="#"
                        text="下一页"
                        aria-disabled={!canGoToNextPage || isLoadingPage}
                        className={cn((!canGoToNextPage || isLoadingPage) && 'pointer-events-none opacity-50')}
                        onClick={(event) => {
                          event.preventDefault()
                          if (canGoToNextPage && !isLoadingPage)
                            onPageChange(currentPage + 1)
                        }}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              )
            : (
                <Button variant="outline" size="sm" disabled={!hasNextPage || isLoadingPage} onClick={onLoadMore}>
                  {isLoadingPage && <Spinner data-icon="inline-start" />}
                  {isLoadingPage ? '正在加载…' : hasNextPage ? '加载更多' : '已加载全部'}
                </Button>
              )}
          <Tooltip>
            <TooltipTrigger
              render={(
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label={displayMode === 'pagination' ? '切换到无限加载模式' : '切换到分页模式'}
                  aria-pressed={displayMode === 'infinite'}
                  onClick={() => onDisplayModeChange(displayMode === 'pagination' ? 'infinite' : 'pagination')}
                >
                  {displayMode === 'pagination' ? <InfinityIcon /> : <ListNumbersIcon />}
                </Button>
              )}
            />
            <TooltipContent>
              {displayMode === 'pagination' ? '切换到无限加载模式' : '切换到分页模式'}
            </TooltipContent>
          </Tooltip>
        </div>
      )}
    </CardFooter>
  )
}
