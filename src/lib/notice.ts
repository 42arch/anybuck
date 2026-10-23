import { toast } from '@/components/ui/toast-manager'

export function showNotice(message: string, type: 'info' | 'error' = 'info') {
  toast.add({ title: message, type, timeout: 4500 })
}
