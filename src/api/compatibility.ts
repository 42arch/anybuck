import { invokeCommand } from '@/api/invoke'

export type ProbeMode = 'quick' | 'full'
export type ProbeStatus = 'passed' | 'failed' | 'unsupported' | 'permissionDenied' | 'skipped'

export interface ProbeDiagnostic {
  code: string
  params?: Record<string, string>
  detail?: string
}

export interface ProbeCheck {
  id: string
  status: ProbeStatus
  diagnostic: ProbeDiagnostic
}

export interface ProbeReport {
  connectionId: string
  bucket: string
  mode: ProbeMode
  prefix: string
  checks: ProbeCheck[]
  cleanupFailures: ProbeDiagnostic[]
}

export function runCompatibilityProbe(connectionId: string, mode: ProbeMode) {
  return invokeCommand<ProbeReport>('run_compatibility_probe', { connectionId, mode })
}
