import { SpinnerIcon } from '@phosphor-icons/react'
import { cn } from 'cn'
import i18n from '@/i18n'

function Spinner({ className, ...props }: React.ComponentProps<'svg'>) {
  return (
    <SpinnerIcon data-slot="spinner" role="status" aria-label={i18n.t('common.loading')} className={cn('size-4 animate-spin', className)} {...props} />
  )
}

export { Spinner }
