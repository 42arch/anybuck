import type { DownloadPlanSummary, PendingUpload, UploadConflictAction } from '@/types/transfer'
import { CloudArrowUpIcon } from '@phosphor-icons/react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { useFileTransferStore } from '@/store/file-transfer-store'

interface TransferConfirmationDialogsProps {
  pendingUpload?: PendingUpload | null
  pendingDownload?: DownloadPlanSummary | null
  onCancelUpload?: () => void
  onCancelDownload?: () => void
  onConfirmUpload?: (action: UploadConflictAction) => void | Promise<void>
  onConfirmDownload?: (action: 'overwrite' | 'skip') => void
}

export function TransferConfirmationDialogs(props?: TransferConfirmationDialogsProps) {
  const [uploadAction, setUploadAction] = useState<UploadConflictAction>('skip')
  const storePendingUpload = useFileTransferStore(state => state.pendingUpload)
  const storePendingDownload = useFileTransferStore(state => state.pendingDownload)
  const storeCancelUpload = useFileTransferStore(state => state.cancelUpload)
  const storeCancelDownload = useFileTransferStore(state => state.cancelDownload)
  const storeConfirmUpload = useFileTransferStore(state => state.confirmUpload)
  const isEnqueuingUpload = useFileTransferStore(state => state.isEnqueuingUpload)
  const storeConfirmDownload = useFileTransferStore(state => state.confirmDownload)

  const pendingUpload = props?.pendingUpload !== undefined ? props.pendingUpload : storePendingUpload
  const pendingDownload = props?.pendingDownload !== undefined ? props.pendingDownload : storePendingDownload
  const onCancelUpload = props?.onCancelUpload ?? storeCancelUpload
  const onCancelDownload = props?.onCancelDownload ?? storeCancelDownload
  const onConfirmDownload = props?.onConfirmDownload ?? (action => void storeConfirmDownload(action))
  function cancelUpload() {
    if (isEnqueuingUpload)
      return
    setUploadAction('skip')
    onCancelUpload()
  }

  async function confirmUpload() {
    try {
      await (props?.onConfirmUpload ?? storeConfirmUpload)(uploadAction)
    }
    finally {
      setUploadAction('skip')
    }
  }

  return (
    <>
      <Dialog open={Boolean(pendingUpload)} onOpenChange={open => !open && cancelUpload()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认上传</DialogTitle>
            <DialogDescription>
              即将上传
              {' '}
              <strong className="font-semibold text-foreground">
                {pendingUpload?.paths.length ?? 0}
                {' '}
                个本地项目
              </strong>
              {' '}
              到
              {' '}
              <strong className="font-semibold text-foreground">
                {pendingUpload ? `${pendingUpload.bucket}/${pendingUpload.prefix ? `${pendingUpload.prefix}/` : ''}` : ''}
              </strong>
              。文件夹会包含其子目录和文件，并保留原目录结构。请选择目标目录中出现同名对象时的处理方式。
            </DialogDescription>
          </DialogHeader>
          <RadioGroup
            value={uploadAction}
            onValueChange={value => setUploadAction(value as UploadConflictAction)}
            className="gap-2"
            aria-label="上传同名对象处理方式"
          >
            <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm">
              <RadioGroupItem value="skip" disabled={isEnqueuingUpload} />
              <span>
                <strong className="block font-medium">跳过同名文件</strong>
                <span className="text-xs text-muted-foreground">默认选项，保留云端已有对象。</span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm">
              <RadioGroupItem value="keepBoth" disabled={isEnqueuingUpload} />
              <span>
                <strong className="block font-medium">保留两份</strong>
                <span className="text-xs text-muted-foreground">上传为“文件名 (1).扩展名”，序号按需递增。</span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm">
              <RadioGroupItem value="overwrite" disabled={isEnqueuingUpload} />
              <span>
                <strong className="block font-medium">覆盖同名文件</strong>
                <span className="text-xs text-muted-foreground">用本地文件替换云端已有对象。</span>
              </span>
            </label>
          </RadioGroup>
          <DialogFooter>
            <Button variant="outline" disabled={isEnqueuingUpload} onClick={cancelUpload}>取消</Button>
            <Button disabled={isEnqueuingUpload} onClick={() => void confirmUpload()}>
              <CloudArrowUpIcon data-icon="inline-start" />
              {isEnqueuingUpload ? '正在加入任务…' : '开始上传'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(pendingDownload)} onOpenChange={open => !open && onCancelDownload()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>处理同名文件</DialogTitle>
            <DialogDescription>
              目标目录中已有
              {' '}
              <strong className="font-semibold text-foreground">
                {pendingDownload?.conflicts.length ?? 0}
                {' '}
                个文件
              </strong>
              。此选择将应用于全部冲突文件。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => onConfirmDownload('skip')}>跳过冲突文件</Button>
            <Button onClick={() => onConfirmDownload('overwrite')}>覆盖冲突文件</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
