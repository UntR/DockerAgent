import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

export function formatDate(dateStr: string): string {
  if (!dateStr) return '-'
  try {
    const d = new Date(dateStr)
    return d.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return dateStr
  }
}

export function getStatusColor(status: string): string {
  switch (status?.toLowerCase()) {
    case 'running': return 'text-emerald-400'
    case 'exited': return 'text-red-400'
    case 'paused': return 'text-yellow-400'
    case 'restarting': return 'text-blue-400'
    default: return 'text-gray-400'
  }
}

export function getStatusDot(status: string): string {
  switch (status?.toLowerCase()) {
    case 'running': return 'running'
    case 'exited': return 'exited'
    default: return 'stopped'
  }
}

export function getStatusLabel(status: string): string {
  const map: Record<string, string> = {
    running: '运行中',
    exited: '已停止',
    paused: '已暂停',
    restarting: '重启中',
    created: '已创建',
    removing: '删除中',
    dead: '已崩溃',
  }
  return map[status?.toLowerCase()] || status
}
