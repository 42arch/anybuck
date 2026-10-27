import type { FormEvent } from 'react'
import type { StorageConnectionEntry } from '@/types/connection'
import { useState } from 'react'
import { errorMessage } from '@/api/invoke'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { useStorageConnection } from '@/hooks/use-storage-connection'
import i18n from '@/i18n'
import { showNotice } from '@/lib/notice'

interface RenameConnectionDialogProps {
  connection: StorageConnectionEntry
  onClose: () => void
}

export function RenameConnectionDialog({ connection, onClose }: RenameConnectionDialogProps) {
  const { renameConnection } = useStorageConnection()
  const [name, setName] = useState(connection.name)
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName) {
      setError(i18n.t('connectionDialog.enterConnectionName'))
      return
    }
    if (trimmedName === connection.name) {
      onClose()
      return
    }
    setIsSaving(true)
    setError('')
    try {
      await renameConnection(connection.connectionId, trimmedName)
      showNotice(i18n.t('dynamic.connectionRenamed', { name: trimmedName }))
      onClose()
    }
    catch (cause) {
      setError(errorMessage(cause))
    }
    finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !isSaving)
          onClose()
      }}
    >
      <DialogContent>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{i18n.t('connectionDialog.renameConnection')}</DialogTitle>
            <DialogDescription>{i18n.t('connectionDialog.changeConnectionNameShownSidebar')}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="rename-connection-name">{i18n.t('connections.name')}</Label>
            <Input
              id="rename-connection-name"
              autoFocus
              required
              maxLength={100}
              value={name}
              onChange={event => setName(event.target.value)}
              disabled={isSaving}
              aria-invalid={Boolean(error)}
            />
          </div>
          {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={isSaving} onClick={onClose}>{i18n.t('common.cancel')}</Button>
            <Button type="submit" disabled={isSaving || !name.trim()}>
              {isSaving && <Spinner data-icon="inline-start" />}
              {i18n.t('common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
