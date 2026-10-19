import { UploadSimple } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'

interface PageHeadingProps {
  title: string
  description: string
  section: string
  showUpload?: boolean
  onUpload: () => void
}

export function PageHeading({ title, description, showUpload = false, onUpload }: PageHeadingProps) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {showUpload && (
        <Button size="lg" onClick={onUpload}>
          <UploadSimple data-icon="inline-start" />
          上传文件
        </Button>
      )}
    </div>
  )
}
