import { invoke } from '@tauri-apps/api/core'

export type ProbeMode = 'quick' | 'full'
export type ProbeStatus = 'passed' | 'failed' | 'unsupported' | 'permissionDenied' | 'skipped'

export interface ProbeCheck {
  id: string
  status: ProbeStatus
  detail: string
}

export interface ProbeReport {
  connectionId: string
  bucket: string
  mode: ProbeMode
  prefix: string
  checks: ProbeCheck[]
  cleanupFailures: string[]
}

export function runCompatibilityProbe(connectionId: string, mode: ProbeMode) {
  return invoke<ProbeReport>('run_compatibility_probe', { connectionId, mode })
}
