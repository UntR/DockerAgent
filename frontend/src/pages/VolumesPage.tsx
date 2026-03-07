import { useState } from 'react'
import { motion } from 'framer-motion'
import { Plus, Trash2, RefreshCw, HardDrive } from 'lucide-react'
import { useDockerStore } from '../lib/store'
import { useDocker } from '../hooks/useDocker'
import { cn, formatDate } from '../lib/utils'
import { dockerApi } from '../lib/api'
import toast from 'react-hot-toast'

export default function VolumesPage() {
  const { volumes, loading } = useDockerStore()
  const { refresh } = useDocker()
  const [form, setForm] = useState({ show: false, name: '', submitting: false })

  const createVolume = async () => {
    if (!form.name.trim()) return
    setForm((f) => ({ ...f, submitting: true }))
    try {
      await dockerApi.createVolume(form.name)
      toast.success(`数据卷 ${form.name} 已创建`)
      setForm({ show: false, name: '', submitting: false })
      await refresh()
    } catch (e: unknown) {
      toast.error(`创建失败: ${e instanceof Error ? e.message : String(e)}`)
      setForm((f) => ({ ...f, submitting: false }))
    }
  }

  const removeVolume = async (name: string) => {
    if (!confirm(`确认删除数据卷 "${name}"？\n⚠️ 此操作不可恢复，卷内数据将永久丢失`)) return
    try {
      await dockerApi.removeVolume(name)
      toast.success(`数据卷 ${name} 已删除`)
      await refresh()
    } catch (e: unknown) {
      toast.error(`删除失败: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-white">数据卷管理</h1>
          <p className="text-gray-500 text-sm mt-1">共 {volumes.length} 个数据卷</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => setForm((f) => ({ ...f, show: true }))}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border border-cyan-500/20 text-cyan-400 text-sm font-medium hover:from-cyan-500/30 transition-all">
            <Plus size={14} />
            创建数据卷
          </button>
          <button onClick={refresh} className="p-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-gray-300 transition-colors">
            <RefreshCw size={14} className={cn(loading.all && 'animate-spin')} />
          </button>
        </div>
      </div>

      <div className="grid gap-3">
        {volumes.map((v) => (
          <motion.div key={v.name}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-4 px-5 py-4 rounded-2xl bg-[#0f1117] border border-white/[0.06] hover:border-white/[0.1] transition-colors">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
              <HardDrive size={16} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm text-white">{v.name}</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded border bg-gray-500/10 text-gray-400 border-gray-500/15">
                  {v.driver}
                </span>
              </div>
              <div className="flex items-center gap-4 mt-1">
                <span className="text-xs text-gray-500 truncate max-w-sm">{v.mountpoint}</span>
                {v.created && <span className="text-xs text-gray-600">{formatDate(v.created)}</span>}
              </div>
            </div>
            <button
              onClick={() => removeVolume(v.name)}
              className="p-1.5 rounded-lg text-gray-600 hover:text-red-400 hover:bg-white/[0.06] transition-colors"
            >
              <Trash2 size={13} />
            </button>
          </motion.div>
        ))}
        {volumes.length === 0 && (
          <div className="py-16 text-center text-gray-500 text-sm rounded-2xl bg-[#0f1117] border border-white/[0.06]">
            暂无数据卷
          </div>
        )}
      </div>

      {form.show && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-6"
          onClick={() => setForm((f) => ({ ...f, show: false }))}>
          <div className="bg-[#0f1117] border border-white/[0.08] rounded-2xl w-full max-w-md p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-white">创建数据卷</h3>
            <input type="text" placeholder="数据卷名称"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              onKeyDown={(e) => e.key === 'Enter' && createVolume()}
              className="w-full bg-[#161820] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-cyan-500/40" />
            <div className="flex gap-3">
              <button onClick={() => setForm((f) => ({ ...f, show: false }))}
                className="flex-1 py-2.5 rounded-xl bg-white/[0.06] text-gray-300 text-sm hover:bg-white/[0.1]">取消</button>
              <button onClick={createVolume} disabled={form.submitting || !form.name}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-sm font-medium disabled:opacity-50">
                {form.submitting ? '创建中...' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
