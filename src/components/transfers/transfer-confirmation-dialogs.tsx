import type { DownloadPlanSummary, PendingUpload, UploadConflictAction } from '@/types/transfer'
import { CloudArrowUpIcon } from '@phosphor-icons/react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import i18n from '@/i18n'
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
            <DialogTitle>{i18n.t('transferConfirmation.confirmUpload')}</DialogTitle>
            <DialogDescription>
              {i18n.t('transferConfirmation.aboutUpload')}
              {' '}
              <strong className="font-semibold text-foreground">
                {pendingUpload?.paths.length ?? 0}
                {' '}
                {i18n.t('transferConfirmation.localItems')}
              </strong>
              {' '}
              {i18n.t('transferConfirmation.destinationPreposition')}
              {' '}
              <strong className="font-semibold text-foreground">
                {pendingUpload ? `${pendingUpload.bucket}/${pendingUpload.prefix ? `${pendingUpload.prefix}/` : ''}` : ''}
              </strong>
              {i18n.t('transferConfirmation.folderStructureAndConflictHint')}
            </DialogDescription>
          </DialogHeader>
          <RadioGroup
            value={uploadAction}
            onValueChange={value => setUploadAction(value as UploadConflictAction)}
            className="gap-2"
            aria-label={i18n.t('transferConfirmation.howHandleDuplicateNamesUpload')}
          >
            <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm">
              <RadioGroupItem value="skip" disabled={isEnqueuingUpload} />
              <span>
                <strong className="block font-medium">{i18n.t('transferConfirmation.skipFilesSameName')}</strong>
                <span className="text-xs text-muted-foreground">{i18n.t('transferConfirmation.defaultKeepExistingCloudObjects')}</span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm">
              <RadioGroupItem value="keepBoth" disabled={isEnqueuingUpload} />
              <span>
                <strong className="block font-medium">{i18n.t('transferConfirmation.keepBoth')}</strong>
                <span className="text-xs text-muted-foreground">{i18n.t('transferConfirmation.uploadFilename1ExtensionIncreasing')}</span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm">
              <RadioGroupItem value="overwrite" disabled={isEnqueuingUpload} />
              <span>
                <strong className="block font-medium">{i18n.t('transferConfirmation.overwriteFilesSameName')}</strong>
                <span className="text-xs text-muted-foreground">{i18n.t('transferConfirmation.replaceExistingCloudObjectsLocal')}</span>
              </span>
            </label>
          </RadioGroup>
          <DialogFooter>
            <Button variant="outline" disabled={isEnqueuingUpload} onClick={cancelUpload}>{i18n.t('common.cancel')}</Button>
            <Button disabled={isEnqueuingUpload} onClick={() => void confirmUpload()}>
              <CloudArrowUpIcon data-icon="inline-start" />
              {isEnqueuingUpload ? i18n.t('transferConfirmation.addingTasks') : i18n.t('transferConfirmation.startUpload')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(pendingDownload)} onOpenChange={open => !open && onCancelDownload()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{i18n.t('transferConfirmation.handleDuplicateFiles')}</DialogTitle>
            <DialogDescription>
              {i18n.t('transferConfirmation.conflictCountIntro')}
              {' '}
              <strong className="font-semibold text-foreground">
                {pendingDownload?.conflicts.length ?? 0}
                {' '}
                {i18n.t('transferConfirmation.conflictCountUnit')}
              </strong>
              {i18n.t('transferConfirmation.conflictChoiceHint')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => onConfirmDownload('skip')}>{i18n.t('transferConfirmation.skipConflictingFiles')}</Button>
            <Button onClick={() => onConfirmDownload('overwrite')}>{i18n.t('transferConfirmation.overwriteConflictingFiles')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
