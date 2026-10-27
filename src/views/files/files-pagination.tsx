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
import i18n from '@/i18n'
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
            ? i18n.t('common.noBucketConnected')
            : isCounting
              ? i18n.t('filesPagination.countingObjects')
              : countError
                ? i18n.t('filesPagination.countObjectsFailed')
                : displayMode === 'infinite'
                  ? i18n.t('dynamic.pageLoaded', { loaded: loadedCount, total: totalCount ?? 0 })
                  : i18n.t('dynamic.pageTotal', { total: totalCount ?? 0, count: totalCount ?? 0 })}
        </span>
        {countError && (
          <Button variant="link" size="sm" className="h-auto shrink-0 p-0" onClick={onRetryCount}>
            {i18n.t('common.retry')}
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
                        text={i18n.t('filesPagination.previousPage')}
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
                              aria-label={i18n.t('dynamic.pageNumber', { page })}
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
                        text={i18n.t('filesPagination.nextPage')}
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
                  {isLoadingPage ? i18n.t('shared.loading') : hasNextPage ? i18n.t('filesPagination.loadMore') : i18n.t('filesPagination.itemsLoaded')}
                </Button>
              )}
          <Tooltip>
            <TooltipTrigger
              render={(
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label={displayMode === 'pagination' ? i18n.t('filesPagination.switchInfiniteLoading') : i18n.t('filesPagination.switchPaginatedView')}
                  aria-pressed={displayMode === 'infinite'}
                  onClick={() => onDisplayModeChange(displayMode === 'pagination' ? 'infinite' : 'pagination')}
                >
                  {displayMode === 'pagination' ? <InfinityIcon /> : <ListNumbersIcon />}
                </Button>
              )}
            />
            <TooltipContent>
              {displayMode === 'pagination' ? i18n.t('filesPagination.switchInfiniteLoading') : i18n.t('filesPagination.switchPaginatedView')}
            </TooltipContent>
          </Tooltip>
        </div>
      )}
    </CardFooter>
  )
}
