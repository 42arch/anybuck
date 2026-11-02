import type { StorageProvider } from '@/types/connection'
import alibabaCloudLogo from '@lobehub/icons-static-svg/icons/alibabacloud-color.svg?url'
import awsLogo from '@lobehub/icons-static-svg/icons/aws.svg?url'
import cloudflareLogo from '@lobehub/icons-static-svg/icons/cloudflare-color.svg?url'
import googleCloudLogo from '@lobehub/icons-static-svg/icons/googlecloud-color.svg?url'
import qiniuLogo from '@lobehub/icons-static-svg/icons/qiniu-color.svg?url'
import tencentCloudLogo from '@lobehub/icons-static-svg/icons/tencentcloud-color.svg?url'
import volcengineLogo from '@lobehub/icons-static-svg/icons/volcengine-color.svg?url'
import { cn } from '@/lib/utils'

const providerLogos: Record<StorageProvider, string> = {
  'cloudflare-r2': cloudflareLogo,
  'aws-s3': awsLogo,
  'tencent-cos': tencentCloudLogo,
  'aliyun-oss': alibabaCloudLogo,
  'google-cloud-storage': googleCloudLogo,
  'qiniu-kodo': qiniuLogo,
  'volcengine-tos': volcengineLogo,
}

interface ProviderLogoProps {
  provider: StorageProvider
  className?: string
}

export function ProviderLogo({ provider, className = 'size-4' }: ProviderLogoProps) {
  return (
    <span className={cn('flex shrink-0 items-center justify-center rounded-sm', provider === 'aws-s3' && 'bg-white p-0.5', className)}>
      <img src={providerLogos[provider]} alt="" aria-hidden="true" className="size-full object-contain" />
    </span>
  )
}
