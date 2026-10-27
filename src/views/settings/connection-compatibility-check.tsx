import type { ProbeDiagnostic, ProbeMode, ProbeStatus } from '@/api/compatibility'
import { CheckCircleIcon, InfoIcon, WarningCircleIcon } from '@phosphor-icons/react'
import { useMutation } from '@tanstack/react-query'
import { runCompatibilityProbe } from '@/api/compatibility'
import { errorMessage } from '@/api/invoke'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import i18n from '@/i18n'
import { cn } from '@/lib/utils'

const checkNames: Record<string, string> = {
  list: 'compatibility.isolatedPrefixListPermission',
  basicReadWrite: 'compatibility.basicReadWrite',
  conditionalPut: 'compatibility.duplicateNameUploadProtection',
  pagination: 'compatibility.paginatedListing',
  copyDelete: 'compatibility.copyDelete',
  multipartUpload: 'compatibility.regularMultipartUploadPath',
  multipartAbort: 'compatibility.abortMultipartUpload',
  conditionalComplete: 'compatibility.duplicateNameProtectionCompletingMultipart',
}

const statusNames: Record<ProbeStatus, string> = {
  passed: 'compatibility.passed',
  failed: 'common.failed',
  unsupported: 'compatibility.unsupported',
  permissionDenied: 'compatibility.permissionDenied',
  skipped: 'compatibility.notRun',
}

function statusVariant(status: ProbeStatus): 'secondary' | 'destructive' | 'outline' {
  if (status === 'passed')
    return 'secondary'
  if (status === 'skipped')
    return 'outline'
  return 'destructive'
}

function diagnosticMessage(diagnostic: ProbeDiagnostic): string {
  const key = `compatibilityDiagnostics.${diagnostic.code}`
  const fallbackKey = `backendErrors.${diagnostic.code}`
  const summary = i18n.exists(key)
    ? i18n.t(key, diagnostic.params ?? {})
    : i18n.exists(fallbackKey)
      ? i18n.t(fallbackKey, diagnostic.params ?? {})
      : i18n.t('backendErrors.unknown')
  return diagnostic.detail ? `${summary} (${diagnostic.detail})` : summary
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
          <h3 className="text-xs font-medium">{i18n.t('compatibility.liveCloudCompatibilityCheck')}</h3>
          <Tooltip>
            <TooltipTrigger
              type="button"
              className="inline-flex items-center justify-center rounded-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              aria-label={i18n.t('compatibility.compatibilityCheckInformation')}
            >
              <InfoIcon className="size-3.5" />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs text-xs leading-relaxed">
              {i18n.t('compatibility.testScopeAndCostHint')}
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
                {i18n.t('compatibility.quickCheck')}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{i18n.t('compatibility.connectBucketRunCheck')}</TooltipContent>
          </Tooltip>
          <Tooltip disabled={connected}>
            <TooltipTrigger
              render={<span tabIndex={!connected ? 0 : undefined} className={cn('inline-flex focus:outline-none', !connected && 'cursor-not-allowed')} />}
            >
              <Button size="sm" variant="outline" disabled={!connected || probe.isPending} onClick={() => probe.mutate('full')}>
                {probe.isPending && probe.variables === 'full' && <Spinner data-icon="inline-start" />}
                {i18n.t('compatibility.fullCheck')}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{i18n.t('compatibility.connectBucketRunCheck')}</TooltipContent>
          </Tooltip>
        </div>
      </div>
      {probe.isPending && <p role="status" className="text-xs text-muted-foreground">{i18n.t('compatibility.runningHint')}</p>}
      {probe.isError && (
        <Alert variant="destructive">
          <AlertTitle>{i18n.t('compatibility.startFailed')}</AlertTitle>
          <AlertDescription>{errorMessage(probe.error)}</AlertDescription>
        </Alert>
      )}
      {report && !probe.isPending && !probe.isError && (
        <div className="flex flex-col gap-2 rounded-md border bg-background p-3 text-xs">
          <div className="flex flex-wrap items-center gap-2 font-medium">
            {allPassed ? <CheckCircleIcon className="size-4 text-primary" /> : <WarningCircleIcon className="size-4 text-destructive" />}
            {allPassed ? i18n.t('compatibility.checksPassed') : i18n.t('dynamic.compatPassed', { passed, total: report.checks.length })}
            <Badge variant="outline">{report.mode === 'quick' ? i18n.t('compatibility.quick') : i18n.t('compatibility.full')}</Badge>
          </div>
          <p className="break-all text-muted-foreground">
            {i18n.t('compatibility.testPrefix')}
            {report.prefix}
          </p>
          <ul className="divide-y">
            {report.checks.map(check => (
              <li key={check.id} className="flex flex-wrap items-start gap-2 py-2">
                <span className="min-w-32 font-medium">{checkNames[check.id] ? i18n.t(checkNames[check.id]) : check.id}</span>
                <Badge variant={statusVariant(check.status)}>{i18n.t(statusNames[check.status])}</Badge>
                <span className="min-w-0 flex-1 text-muted-foreground">{diagnosticMessage(check.diagnostic)}</span>
              </li>
            ))}
          </ul>
          {report.cleanupFailures.length === 0
            ? (
                <p className="text-muted-foreground">
                  {report.checks[0]?.status === 'passed'
                    ? i18n.t('compatibility.cleanupCompleteHint')
                    : i18n.t('compatibility.prefixCheckFailedHint')}
                </p>
              )
            : (
                <Alert variant="destructive">
                  <AlertTitle>{i18n.t('compatibility.testResourceCleanupIncomplete')}</AlertTitle>
                  <AlertDescription>
                    {report.cleanupFailures.map(failure => <p key={`${failure.code}-${failure.params?.key ?? ''}-${failure.params?.uploadId ?? ''}-${failure.params?.prefix ?? ''}`} className="break-all">{diagnosticMessage(failure)}</p>)}
                  </AlertDescription>
                </Alert>
              )}
        </div>
      )}
    </div>
  )
}
