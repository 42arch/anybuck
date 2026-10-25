import type { ProbeMode, ProbeStatus } from '@/api/compatibility'
import { CheckCircleIcon, InfoIcon, WarningCircleIcon } from '@phosphor-icons/react'
import { useMutation } from '@tanstack/react-query'
import { runCompatibilityProbe } from '@/api/compatibility'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

const checkNames: Record<string, string> = {
  list: '隔离前缀与列举权限',
  basicReadWrite: '基础读写',
  conditionalPut: '同名上传保护',
  pagination: '分页列举',
  copyDelete: '复制与删除',
  multipartUpload: '普通上传分片路径',
  multipartAbort: '分片中止',
  conditionalComplete: '分片完成时同名保护',
}

const statusNames: Record<ProbeStatus, string> = {
  passed: '通过',
  failed: '失败',
  unsupported: '不支持',
  permissionDenied: '权限不足',
  skipped: '未运行',
}

function statusVariant(status: ProbeStatus): 'secondary' | 'destructive' | 'outline' {
  if (status === 'passed')
    return 'secondary'
  if (status === 'skipped')
    return 'outline'
  return 'destructive'
}

export function ConnectionCompatibilityCheck({ connectionId, connected }: { connectionId: string, connected: boolean }) {
  const probe = useMutation({ mutationFn: (mode: ProbeMode) => runCompatibilityProbe(connectionId, mode) })
  const report = probe.data
  const passed = report?.checks.filter(check => check.status === 'passed').length ?? 0
  const allPassed = report?.checks.every(check => check.status === 'passed') && report.cleanupFailures.length === 0

  return (
    <div className="flex flex-col gap-3 border-t pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <h3 className="text-xs font-medium">真实云端兼容性验证</h3>
          <Tooltip>
            <TooltipTrigger
              type="button"
              className="inline-flex items-center justify-center rounded-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              aria-label="兼容性验证说明"
            >
              <InfoIcon className="size-3.5" />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs text-xs leading-relaxed">
              手动运行；仅在随机隔离前缀下写入测试对象，结束后尝试清理。完整检查约上传 110 MiB，可能产生流量费用。
            </TooltipContent>
          </Tooltip>
        </div>
        <div className="flex gap-2">
          <Tooltip disabled={connected}>
            <TooltipTrigger
              render={<span tabIndex={!connected ? 0 : undefined} className={cn('inline-flex focus:outline-none', !connected && 'cursor-not-allowed')} />}
            >
              <Button size="sm" variant="outline" disabled={!connected || probe.isPending} onClick={() => probe.mutate('quick')}>
                {probe.isPending && probe.variables === 'quick' && <Spinner data-icon="inline-start" />}
                快速检查
              </Button>
            </TooltipTrigger>
            <TooltipContent>连接 Bucket 后即可运行验证。</TooltipContent>
          </Tooltip>
          <Tooltip disabled={connected}>
            <TooltipTrigger
              render={<span tabIndex={!connected ? 0 : undefined} className={cn('inline-flex focus:outline-none', !connected && 'cursor-not-allowed')} />}
            >
              <Button size="sm" variant="outline" disabled={!connected || probe.isPending} onClick={() => probe.mutate('full')}>
                {probe.isPending && probe.variables === 'full' && <Spinner data-icon="inline-start" />}
                完整检查
              </Button>
            </TooltipTrigger>
            <TooltipContent>连接 Bucket 后即可运行验证。</TooltipContent>
          </Tooltip>
        </div>
      </div>
      {probe.isPending && <p role="status" className="text-xs text-muted-foreground">正在访问真实云端；完整检查需要上传并读回测试数据，请等待结果…</p>}
      {probe.isError && (
        <Alert variant="destructive">
          <AlertTitle>无法启动兼容性验证</AlertTitle>
          <AlertDescription>{String(probe.error)}</AlertDescription>
        </Alert>
      )}
      {report && !probe.isPending && !probe.isError && (
        <div className="flex flex-col gap-2 rounded-md border bg-background p-3 text-xs">
          <div className="flex flex-wrap items-center gap-2 font-medium">
            {allPassed ? <CheckCircleIcon className="size-4 text-primary" /> : <WarningCircleIcon className="size-4 text-destructive" />}
            {allPassed ? '所有检查通过' : `${passed}/${report.checks.length} 项通过`}
            <Badge variant="outline">{report.mode === 'quick' ? '快速' : '完整'}</Badge>
          </div>
          <p className="break-all text-muted-foreground">
            测试前缀：
            {report.prefix}
          </p>
          <ul className="divide-y">
            {report.checks.map(check => (
              <li key={check.id} className="flex flex-wrap items-start gap-2 py-2">
                <span className="min-w-32 font-medium">{checkNames[check.id] ?? check.id}</span>
                <Badge variant={statusVariant(check.status)}>{statusNames[check.status]}</Badge>
                <span className="min-w-0 flex-1 text-muted-foreground">{check.detail}</span>
              </li>
            ))}
          </ul>
          {report.cleanupFailures.length === 0
            ? (
                <p className="text-muted-foreground">
                  {report.checks[0]?.status === 'passed'
                    ? '清理：当前可列举对象已清空。启用版本控制的 Bucket 可能仍保留历史测试版本。'
                    : '隔离前缀检查未通过，未写入测试对象。'}
                </p>
              )
            : (
                <Alert variant="destructive">
                  <AlertTitle>测试资源清理未完成</AlertTitle>
                  <AlertDescription>
                    {report.cleanupFailures.map(failure => <p key={failure} className="break-all">{failure}</p>)}
                  </AlertDescription>
                </Alert>
              )}
        </div>
      )}
    </div>
  )
}
