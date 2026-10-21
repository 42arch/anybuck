import type { TransferTask } from '@/types/transfer'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { listTransferTasks, onTransferHistoryCleared, onTransferTaskUpdated } from '@/api/transfers'

const terminalStatuses = new Set(['completed', 'failed', 'cancelled', 'interrupted', 'skipped'])

export function useTransferTasks() {
  const queryClient = useQueryClient()
  const [transferTasks, setTransferTasks] = useState<TransferTask[]>([])

  useEffect(() => {
    let mounted = true
    let unlistenTask: (() => void) | undefined
    let unlistenClear: (() => void) | undefined
    void Promise.all([
      onTransferTaskUpdated((task) => {
        setTransferTasks(current => [...current.filter(item => item.id !== task.id), task])
        const isObjectOperation = ['copy', 'move', 'copy-folder', 'move-folder'].includes(task.operation)
        if ((task.operation === 'upload' && task.status === 'completed')
          || (isObjectOperation && task.parentId === null && ['completed', 'failed', 'cancelled', 'interrupted'].includes(task.status))) {
          void queryClient.invalidateQueries({ queryKey: ['storage', 'r2', 'objects', task.connectionId] })
        }
      }),
      onTransferHistoryCleared(() => setTransferTasks(current => current.filter(task => !terminalStatuses.has(task.status)))),
    ]).then(([taskListener, clearListener]) => {
      if (mounted) {
        unlistenTask = taskListener
        unlistenClear = clearListener
        void listTransferTasks().then((tasks) => {
          if (!mounted)
            return
          setTransferTasks((current) => {
            const newest = new Map(tasks.map(task => [task.id, task]))
            for (const task of current) {
              const snapshotTask = newest.get(task.id)
              if (!snapshotTask || task.updatedAt >= snapshotTask.updatedAt)
                newest.set(task.id, task)
            }
            return [...newest.values()]
          })
        }).catch(() => {})
      }
      else {
        taskListener()
        clearListener()
      }
    })
    return () => {
      mounted = false
      unlistenTask?.()
      unlistenClear?.()
    }
  }, [queryClient])

  return transferTasks
}
