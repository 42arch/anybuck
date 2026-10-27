import type { TransferTask } from '@/types/transfer'
import { invoke } from '@tauri-apps/api/core'
import i18n from '@/i18n'

interface IpcErrorPayload {
  code: string
  params?: Record<string, string>
  detail?: string
}

function isIpcErrorPayload(value: unknown): value is IpcErrorPayload {
  return typeof value === 'object' && value !== null && 'code' in value && typeof value.code === 'string'
}

export class AppError extends Error {
  readonly code: string
  readonly params: Record<string, string>
  readonly detail?: string

  constructor(payload: IpcErrorPayload) {
    super(localizeIpcError(payload))
    this.name = 'AppError'
    this.code = payload.code
    this.params = payload.params ?? {}
    this.detail = payload.detail
  }
}

function localizeIpcError(payload: IpcErrorPayload): string {
  const key = `backendErrors.${payload.code}`
  return i18n.exists(key)
    ? i18n.t(key, payload.params ?? {})
    : i18n.t('backendErrors.unknown')
}

export function errorMessage(cause: unknown): string {
  if (cause instanceof AppError)
    return localizeIpcError(cause)
  if (isIpcErrorPayload(cause))
    return localizeIpcError(cause)
  if (cause instanceof Error)
    return cause.message
  return String(cause)
}

export function taskErrorMessage(task: TransferTask): string {
  if (!task.error && !task.errorCode)
    return ''
  const key = task.errorCode ? `backendErrors.${task.errorCode}` : ''
  return key && i18n.exists(key) ? i18n.t(key) : task.error ?? ''
}

export async function invokeCommand<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args)
  }
  catch (cause) {
    if (isIpcErrorPayload(cause))
      throw new AppError(cause)
    // Older binaries may still reject with a plain string.
    throw cause instanceof Error ? cause : new Error(String(cause))
  }
}
