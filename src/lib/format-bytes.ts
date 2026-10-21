export function formatBytes(bytes: number, fractionDigits?: number) {
  if (bytes < 1024)
    return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let size = bytes
  let unit = -1
  do {
    size /= 1024
    unit += 1
  } while (size >= 1024 && unit < units.length - 1)
  return `${size.toFixed(fractionDigits ?? (size >= 10 ? 1 : 2))} ${units[unit]}`
}
