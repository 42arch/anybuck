import type { DownloadPlanSummary, PendingUpload } from '@/types/transfer'
import { CloudArrowUpIcon } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface TransferConfirmationDialogsProps {
  pendingUpload: PendingUpload | null
  pendingDownload: DownloadPlanSummary | null
  onCancelUpload: () => void
  onCancelDownload: () => void
  onConfirmUpload: () => void
  onConfirmDownload: (action: 'overwrite' | 'skip') => void
}

export function TransferConfirmationDialogs({ pendingUpload, pendingDownload, onCancelUpload, onCancelDownload, onConfirmUpload, onConfirmDownload }: TransferConfirmationDialogsProps) {
  return (
    <>
      <Dialog open={Boolean(pendingUpload)} onOpenChange={open => !open && onCancelUpload()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认上传文件</DialogTitle>
            <DialogDescription>
              即将上传
              {' '}
              <strong className="font-semibold text-foreground">
                {pendingUpload?.paths.length ?? 0}
                {' '}
                个文件
              </strong>
              {' '}
              到
              {' '}
              <strong className="font-semibold text-foreground">
                {pendingUpload ? `${pendingUpload.bucket}/${pendingUpload.prefix ? `${pendingUpload.prefix}/` : ''}` : ''}
              </strong>
              。同名对象会被覆盖，确定继续吗？
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={onCancelUpload}>取消</Button>
            <Button onClick={onConfirmUpload}>
              <CloudArrowUpIcon data-icon="inline-start" />
              开始上传
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
