import { useState } from 'react'
import { motion } from 'framer-motion'
import { Play, Square, RotateCcw, Trash2, FileText, RefreshCw, Search } from 'lucide-react'
import { useDockerStore } from '../lib/store'
import { useDocker } from '../hooks/useDocker'
import { cn, formatDate, getStatusDot, getStatusLabel, getStatusColor } from '../lib/utils'
import { dockerApi } from '../lib/api'
import toast from 'react-hot-toast'

export default function ContainersPage() {
  const { containers, loading } = useDockerStore()
  const { refresh, containerAction } = useDocker()
  const [search, setSearch] = useState('')
  const [logs, setLogs] = useState<{ name: string; content: string } | null>(null)
  const [showAll, setShowAll] = useState(true)

  const filtered = containers.filter(
    (c) =>
      (showAll || c.status === 'running') &&
      (c.name.includes(search) || c.image.includes(search))
  )

  const fetchLogs = async (id: string, name: string) => {
    try {
      const { logs: content } = await dockerApi.getContainerLogs(id, 200)
      setLogs({ name, content })
    } catch (e: unknown) {
      toast.error(`获取日志失败: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-white">容器管理</h1>
          <p className="text-gray-500 text-sm mt-1">共 {containers.length} 个容器</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowAll(!showAll)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
              showAll
                ? 'bg-white/[0.08] text-white'
                : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/20'
            )}
          >
            {showAll ? '全部' : '运行中'}
          </button>
          <button
            onClick={refresh}
            disabled={loading.all}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-gray-300 text-xs transition-colors"
          >
            <RefreshCw size={12} className={cn(loading.all && 'animate-spin')} />
            刷新
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input
          type="text"
          placeholder="搜索容器名称或镜像..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-[#0f1117] border border-white/[0.06] rounded-xl pl-9 pr-4 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-cyan-500/40"
        />
      </div>

      {/* Table */}
      <div className="rounded-2xl bg-[#0f1117] border border-white/[0.06] overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/[0.06]">
              {['状态', '名称', '镜像', '端口', '创建时间', '操作'].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {filtered.map((c) => (
              <motion.tr
                key={c.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="hover:bg-white/[0.02] transition-colors"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className={`status-dot ${getStatusDot(c.status)}`} />
                    <span className={cn('text-xs font-medium', getStatusColor(c.status))}>
                      {getStatusLabel(c.status)}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div>
                    <span className="text-sm font-mono text-white">{c.name}</span>
                    {c.description && (
                      <p className="text-xs text-gray-500 mt-0.5 truncate max-w-xs">{c.description}</p>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs font-mono text-gray-400 truncate max-w-[180px] block">
                    {c.image}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(c.ports || {})
                      .filter(([, v]) => v)
                      .slice(0, 2)
                      .map(([k, v]: [string, unknown]) => {
                        const hostPort = Array.isArray(v) ? (v[0] as Record<string, string>)?.HostPort : ''
                        return hostPort ? (
                          <span key={k} className="text-[10px] font-mono bg-white/[0.06] px-1.5 py-0.5 rounded text-cyan-400">
                            {hostPort}:{k.split('/')[0]}
                          </span>
                        ) : null
                      })}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs text-gray-500">{formatDate(c.created)}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    {c.status !== 'running' && (
                      <ActionBtn
                        icon={Play}
                        onClick={() => containerAction('start', c.id, c.name)}
                        title="启动"
                        color="hover:text-emerald-400"
                      />
                    )}
                    {c.status === 'running' && (
                      <ActionBtn
                        icon={Square}
                        onClick={() => containerAction('stop', c.id, c.name)}
                        title="停止"
                        color="hover:text-yellow-400"
                      />
                    )}
                    <ActionBtn
                      icon={RotateCcw}
                      onClick={() => containerAction('restart', c.id, c.name)}
                      title="重启"
                      color="hover:text-blue-400"
                    />
                    <ActionBtn
                      icon={FileText}
                      onClick={() => fetchLogs(c.id, c.name)}
                      title="日志"
                      color="hover:text-purple-400"
                    />
                    <ActionBtn
                      icon={Trash2}
                      onClick={() => {
                        if (confirm(`确认删除容器 "${c.name}"？`)) {
                          containerAction('remove', c.id, c.name)
                        }
                      }}
                      title="删除"
                      color="hover:text-red-400"
                    />
                  </div>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="py-16 text-center text-gray-500 text-sm">
            {search ? '无匹配结果' : '暂无容器'}
          </div>
        )}
      </div>

      {/* Log Modal */}
      {logs && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-6"
          onClick={() => setLogs(null)}
        >
          <div
            className="bg-[#0f1117] border border-white/[0.08] rounded-2xl w-full max-w-4xl max-h-[70vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
              <span className="font-mono text-sm text-white">{logs.name} — 日志</span>
              <button onClick={() => setLogs(null)} className="text-gray-500 hover:text-white text-xl">×</button>
            </div>
            <pre className="flex-1 overflow-auto p-5 text-xs font-mono text-gray-300 leading-relaxed whitespace-pre-wrap">
              {logs.content || '暂无日志'}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}

function ActionBtn({
  icon: Icon,
  onClick,
  title,
  color,
}: {
  icon: React.ElementType
  onClick: () => void
  title: string
  color: string
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        'p-1.5 rounded-lg text-gray-600 transition-colors hover:bg-white/[0.06]',
        color
      )}
    >
      <Icon size={13} />
    </button>
  )
}
