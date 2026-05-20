import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, Box, Clock, Copy, ExternalLink, FileText,
  FolderOpen, RefreshCw, RotateCcw, Search, ShieldCheck,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { appsApi, dockerApi, ManagedApp, ManagedAppContainer, ManagedAppFile } from '../lib/api'
import { cn, formatDate, getStatusColor, getStatusDot, getStatusLabel } from '../lib/utils'

export default function AppDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [app, setApp] = useState<ManagedApp | null>(null)
  const [loading, setLoading] = useState(false)
  const [logs, setLogs] = useState<{ name: string; content: string } | null>(null)
  const [appFile, setAppFile] = useState<ManagedAppFile | null>(null)

  const load = async () => {
    const appId = Number(id)
    if (!Number.isFinite(appId)) {
      toast.error('应用 ID 无效')
      navigate('/apps')
      return
    }

    setLoading(true)
    try {
      setApp(await appsApi.getApp(appId))
    } catch (e: unknown) {
      toast.error(`加载应用失败: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setLoading(false)
    }
  }

  const fetchLogs = async (container: ManagedAppContainer) => {
    try {
      const { logs: content } = await dockerApi.getContainerLogs(container.id, 200)
      setLogs({ name: container.name, content })
    } catch (e: unknown) {
      toast.error(`获取日志失败: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const fetchAppFile = async (kind: 'compose' | 'env') => {
    if (!app) return
    try {
      setAppFile(await appsApi.getAppFile(app.id, kind))
    } catch (e: unknown) {
      toast.error(`读取文件失败: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(`${label}已复制`)
    } catch {
      toast.error('复制失败')
    }
  }

  useEffect(() => { load() }, [id])

  if (!app && loading) {
    return (
      <div className="p-8 text-sm text-gray-500">加载中...</div>
    )
  }

  if (!app) {
    return (
      <div className="p-8 space-y-4">
        <button onClick={() => navigate('/apps')} className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white">
          <ArrowLeft size={14} />
          返回应用列表
        </button>
        <div className="py-16 text-center text-gray-500 text-sm rounded-2xl bg-[#0f1117] border border-white/[0.06]">
          未加载到应用
        </div>
      </div>
    )
  }

  const containers = app.containers || []

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-start gap-4 min-w-0">
          <button
            onClick={() => navigate('/apps')}
            className="mt-1 p-2 rounded-lg text-gray-500 hover:text-white hover:bg-white/[0.06] transition-colors"
            title="返回"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="p-3 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/15">
            <FolderOpen size={18} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="font-display text-2xl font-semibold text-white truncate">{app.name}</h1>
              <span className="text-[10px] px-2 py-0.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 text-emerald-400">
                {app.status}
              </span>
            </div>
            <p className="text-xs text-gray-500 font-mono mt-1 truncate">
              {app.compose_project} · 更新于 {formatDate(app.updated_at)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => navigate(`/rollback?compose_project=${encodeURIComponent(app.compose_project)}`)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/15 text-sm transition-colors"
          >
            <RotateCcw size={14} />
            回滚
          </button>
          <button
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-gray-300 text-sm transition-colors disabled:opacity-50"
          >
            <RefreshCw size={14} className={cn(loading && 'animate-spin')} />
            刷新
          </button>
        </div>
      </div>

      <section className="rounded-2xl bg-[#0f1117] border border-white/[0.06] px-5 py-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-white">部署信息</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => copyText(app.work_dir, '工作目录')}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-gray-400 bg-white/[0.04] hover:bg-white/[0.08] transition-colors"
            >
              <Copy size={12} />
              复制目录
            </button>
            <button
              onClick={() => copyText(app.compose_path, 'Compose 路径')}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-gray-400 bg-white/[0.04] hover:bg-white/[0.08] transition-colors"
            >
              <Copy size={12} />
              复制 Compose 路径
            </button>
            <button
              onClick={() => fetchAppFile('compose')}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 hover:bg-cyan-500/20 transition-colors"
            >
              <FileText size={12} />
              查看 Compose
            </button>
            {app.env_path && (
              <button
                onClick={() => fetchAppFile('env')}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20 transition-colors"
              >
                <FileText size={12} />
                查看 Env
              </button>
            )}
          </div>
        </div>
        <div className="grid gap-2 text-xs">
          <InfoRow label="目录" value={app.work_dir} />
          <InfoRow label="Compose" value={app.compose_path} />
          {app.env_path && <InfoRow label="Env" value={app.env_path} />}
          {app.source_url && <InfoRow label="来源" value={app.source_url} />}
          <InfoRow label="创建时间" value={formatDate(app.created_at)} />
        </div>
      </section>

      <section className="rounded-2xl bg-[#0f1117] border border-white/[0.06] px-5 py-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">访问地址</h2>
          <span className="text-xs text-gray-600">{app.access_urls.length} 个</span>
        </div>
        {app.access_urls.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {app.access_urls.map((item, index) => (
              <div key={`${item.service}-${index}`} className="flex items-center gap-1">
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 hover:bg-cyan-500/20 text-xs font-mono transition-colors"
                >
                  <ExternalLink size={11} />
                  {item.service}: {item.url}
                </a>
                <button
                  onClick={() => copyText(item.url, '访问地址')}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.04] text-gray-400 hover:text-white hover:bg-white/[0.08] text-xs transition-colors"
                >
                  <Copy size={11} />
                  复制
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs text-gray-500">暂无可推断访问地址</div>
        )}
      </section>

      <section className="rounded-2xl bg-[#0f1117] border border-white/[0.06] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <h2 className="text-sm font-semibold text-white">相关快照</h2>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-600">{(app.snapshots || []).length} 个</span>
            <Link
              to={`/rollback?compose_project=${encodeURIComponent(app.compose_project)}`}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20 transition-colors"
            >
              <RotateCcw size={12} />
              回滚页
            </Link>
          </div>
        </div>
        {(app.snapshots || []).length > 0 ? (
          <div className="divide-y divide-white/[0.04]">
            {(app.snapshots || []).map((snapshot) => (
              <div key={snapshot.id} className="flex items-center gap-3 px-5 py-3">
                <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
                  {snapshot.is_auto ? <Clock size={14} /> : <ShieldCheck size={14} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white font-mono truncate">{snapshot.name}</div>
                  <div className="mt-1 flex items-center gap-3 text-xs text-gray-600">
                    <span>{snapshot.container_count} 个容器</span>
                    <span>{formatDate(snapshot.created_at)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-10 text-center text-gray-500 text-sm">
            暂无该应用的关联快照。通过 AI 部署时会自动创建部署前快照。
          </div>
        )}
      </section>

      <section className="rounded-2xl bg-[#0f1117] border border-white/[0.06] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <h2 className="text-sm font-semibold text-white">关联容器</h2>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-600">{containers.length} 个</span>
            <button
              onClick={load}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-gray-400 bg-white/[0.04] hover:bg-white/[0.08] transition-colors disabled:opacity-50"
            >
              <RefreshCw size={12} className={cn(loading && 'animate-spin')} />
              刷新容器状态
            </button>
          </div>
        </div>
        {containers.length > 0 ? (
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/[0.06]">
                {['状态', '服务', '容器', '镜像', '端口', '操作'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {containers.map((container) => (
                <tr key={container.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className={`status-dot ${getStatusDot(container.status)}`} />
                      <span className={cn('text-xs font-medium', getStatusColor(container.status))}>
                        {getStatusLabel(container.status)}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm font-mono text-white">{container.service}</td>
                  <td className="px-4 py-3 text-xs font-mono text-gray-400">{container.name}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-mono text-gray-400 truncate max-w-[200px] block">
                      {container.image}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <PortList ports={container.ports} />
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => fetchLogs(container)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-gray-400 hover:text-purple-400 hover:bg-white/[0.06] transition-colors"
                    >
                      <FileText size={12} />
                      日志
                    </button>
                    <Link
                      to={`/containers?q=${encodeURIComponent(container.name)}`}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-gray-400 hover:text-cyan-400 hover:bg-white/[0.06] transition-colors"
                    >
                      <Search size={12} />
                      容器页
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="py-12 text-center text-gray-500 text-sm">
            <Box size={18} className="mx-auto mb-3 text-gray-700" />
            未找到关联容器，或 Docker 当前不可用
          </div>
        )}
      </section>

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
              <span className="font-mono text-sm text-white">{logs.name} - 日志</span>
              <button onClick={() => setLogs(null)} className="text-gray-500 hover:text-white text-xl">×</button>
            </div>
            <pre className="flex-1 overflow-auto p-5 text-xs font-mono text-gray-300 leading-relaxed whitespace-pre-wrap">
              {logs.content || '暂无日志'}
            </pre>
          </div>
        </div>
      )}

      {appFile && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-6"
          onClick={() => setAppFile(null)}
        >
          <div
            className="bg-[#0f1117] border border-white/[0.08] rounded-2xl w-full max-w-4xl max-h-[76vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
              <div className="min-w-0">
                <span className="font-mono text-sm text-white">
                  {appFile.kind === 'compose' ? 'docker-compose.yml' : '.env'}
                </span>
                <div className="text-xs text-gray-600 font-mono truncate mt-1">{appFile.path}</div>
              </div>
              <button onClick={() => setAppFile(null)} className="text-gray-500 hover:text-white text-xl">×</button>
            </div>
            {appFile.masked && (
              <div className="px-5 py-2 border-b border-amber-500/10 bg-amber-500/5 text-xs text-amber-300">
                Env 值已脱敏，仅用于核对键名和配置结构。
              </div>
            )}
            {appFile.truncated && (
              <div className="px-5 py-2 border-b border-yellow-500/10 bg-yellow-500/5 text-xs text-yellow-300">
                文件超过 256KB，当前只显示前 256KB。
              </div>
            )}
            <pre className="flex-1 overflow-auto p-5 text-xs font-mono text-gray-300 leading-relaxed whitespace-pre-wrap">
              {appFile.content || '文件为空'}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 min-w-0">
      <span className="w-20 flex-shrink-0 text-gray-600">{label}</span>
      <span className="text-gray-400 font-mono truncate">{value}</span>
    </div>
  )
}

function PortList({ ports }: { ports: ManagedAppContainer['ports'] }) {
  const entries = Object.entries(ports || {})
    .filter(([, value]) => Array.isArray(value) && value.length > 0)
    .slice(0, 3)

  if (entries.length === 0) {
    return <span className="text-xs text-gray-600">-</span>
  }

  return (
    <div className="flex flex-wrap gap-1">
      {entries.map(([port, value]) => {
        const hostPort = Array.isArray(value) ? value[0]?.HostPort : ''
        return hostPort ? (
          <span key={port} className="text-[10px] font-mono bg-white/[0.06] px-1.5 py-0.5 rounded text-cyan-400">
            {hostPort}:{port.split('/')[0]}
          </span>
        ) : null
      })}
    </div>
  )
}
