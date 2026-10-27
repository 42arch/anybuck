export interface DownloadObjectsResult {
  downloadedCount: number
  failedKeys: string[]
}

export interface TransferTask {
  id: string
  parentId: string | null
  operation: 'upload' | 'upload-marker' | 'upload-folder' | 'download' | 'folder' | 'copy' | 'move' | 'copy-folder' | 'move-folder'
  connectionId: string
  bucket: string
  displayName: string
  objectKey: string
  destinationKey: string
  destinationConnectionId: string
  destinationBucket: string
  localPath: string
  relativePath: string
  destinationRoot: string
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'interrupted' | 'skipped'
  phase: 'copying' | 'downloading' | 'uploading' | 'verifying' | 'deleting' | null
  error: string | null
  errorCode?: string | null
  totalBytes: number | null
  transferredBytes: number
  createdAt: number
  updatedAt: number
  uploadConflictAction: UploadConflictAction
}

export type UploadConflictAction = 'skip' | 'overwrite' | 'keepBoth'

export interface DownloadPlanSummary {
  planId: string
  conflicts: string[]
  fileCount: number
}

export interface PendingUpload {
  connectionId: string
  bucket: string
  prefix: string
  paths: string[]
}
