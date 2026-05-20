import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, ExternalLink, FolderOpen, RefreshCw, RotateCcw } from 'lucide-react'
import toast from 'react-hot-toast'
import { appsApi, ManagedApp } from '../lib/api'
import { cn, formatDate } from '../lib/utils'

export default function AppsPage() {
  const [apps, setApps] = useState<ManagedApp[]>([])
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      setApps(await appsApi.listApps())
    } catch (e: unknown) {
      toast.error(`加载应用失败: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-white">应用管理</h1>
          <p className="text-gray-500 text-sm mt-1">由 DockerAgent 部署或登记的 Compose 应用</p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-gray-300 text-sm transition-colors"
        >
          <RefreshCw size={13} className={cn(loading && 'animate-spin')} />
          刷新
        </button>
      </div>

      {apps.length === 0 && !loading && (
        <div className="py-16 text-center text-gray-500 text-sm rounded-2xl bg-[#0f1117] border border-white/[0.06]">
          暂无应用。通过“智能部署”成功部署后会自动登记在这里。
        </div>
      )}

      <div className="grid gap-3">
        {apps.map((app) => (
          <div
            key={app.id}
            className="rounded-2xl bg-[#0f1117] border border-white/[0.06] px-5 py-4 space-y-3"
          >
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/15">
                <FolderOpen size={16} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-white truncate">{app.name}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 text-emerald-400">
                    {app.status}
                  </span>
                </div>
                <div className="mt-1 text-xs text-gray-500 font-mono truncate">
                  {app.compose_project} · {app.work_dir}
                </div>
              </div>
              <div className="flex flex-col items-end gap-2 flex-shrink-0">
                <span className="text-xs text-gray-600">{formatDate(app.updated_at)}</span>
                <div className="flex items-center gap-1.5">
                  <Link
                    to={`/rollback?compose_project=${encodeURIComponent(app.compose_project)}`}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/15 transition-colors"
                  >
                    <RotateCcw size={11} />
                    回滚
                  </Link>
                  <Link
                    to={`/apps/${app.id}`}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-gray-300 bg-white/[0.06] hover:bg-white/[0.1] transition-colors"
                  >
                    详情
                    <ChevronRight size={11} />
                  </Link>
                </div>
              </div>
            </div>

            <div className="grid gap-2 text-xs">
              <InfoRow label="Compose" value={app.compose_path} />
              {app.env_path && <InfoRow label="Env" value={app.env_path} />}
              {app.source_url && <InfoRow label="来源" value={app.source_url} />}
            </div>

            {app.access_urls.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {app.access_urls.map((item, index) => (
                  <a
                    key={`${item.service}-${index}`}
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 hover:bg-cyan-500/20 text-xs font-mono transition-colors"
                  >
                    <ExternalLink size={11} />
                    {item.service}: {item.url}
                  </a>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 min-w-0">
      <span className="w-16 flex-shrink-0 text-gray-600">{label}</span>
      <span className="text-gray-400 font-mono truncate">{value}</span>
    </div>
  )
}
