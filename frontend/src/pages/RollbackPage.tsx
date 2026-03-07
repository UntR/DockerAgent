import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { RotateCcw, Plus, Trash2, Clock, Box, ShieldCheck, AlertTriangle } from 'lucide-react'
import { rollbackApi } from '../lib/api'
import { useDockerStore } from '../lib/store'
import { cn, formatDate } from '../lib/utils'
import toast from 'react-hot-toast'

interface Snapshot {
  id: number
  name: string
  description: string | null
  created_at: string
  is_auto: boolean
  container_count: number
}

export default function RollbackPage() {
  const { snapshots, setSnapshots } = useDockerStore()
  const [loading, setLoading] = useState(false)
  const [createForm, setCreateForm] = useState({ show: false, name: '', desc: '', submitting: false })
  const [rollbackModal, setRollbackModal] = useState<{
    snap: Snapshot | null; keepVolumes: boolean; running: boolean
  }>({ snap: null, keepVolumes: true, running: false })

  const load = async () => {
    setLoading(true)
    try {
      const data = await rollbackApi.listSnapshots() as Snapshot[]
      setSnapshots(data)
    } catch (e: unknown) {
      toast.error('加载快照失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const createSnapshot = async () => {
    if (!createForm.name.trim()) return
    setCreateForm((f) => ({ ...f, submitting: true }))
    try {
      await rollbackApi.createSnapshot(createForm.name, createForm.desc || undefined)
      toast.success('快照创建成功')
      setCreateForm({ show: false, name: '', desc: '', submitting: false })
      await load()
    } catch (e: unknown) {
      toast.error(`创建失败: ${e instanceof Error ? e.message : String(e)}`)
      setCreateForm((f) => ({ ...f, submitting: false }))
    }
  }

  const deleteSnapshot = async (id: number) => {
    if (!confirm('确认删除此快照？')) return
    try {
      await rollbackApi.deleteSnapshot(id)
      toast.success('快照已删除')
      await load()
    } catch (e: unknown) {
      toast.error(`删除失败: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const executeRollback = async () => {
    if (!rollbackModal.snap) return
    setRollbackModal((s) => ({ ...s, running: true }))
    try {
      const result = await rollbackApi.rollback(rollbackModal.snap.id, rollbackModal.keepVolumes) as { message: string; errors: string[] }
      toast.success(result.message)
      setRollbackModal({ snap: null, keepVolumes: true, running: false })
    } catch (e: unknown) {
      toast.error(`回滚失败: ${e instanceof Error ? e.message : String(e)}`)
      setRollbackModal((s) => ({ ...s, running: false }))
    }
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-white">回滚管理</h1>
          <p className="text-gray-500 text-sm mt-1">
            每次部署前自动快照，出现问题一键恢复
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setCreateForm((f) => ({ ...f, show: true }))}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border border-cyan-500/20 text-cyan-400 text-sm font-medium hover:from-cyan-500/30 transition-all"
          >
            <Plus size={14} />
            手动快照
          </button>
          <button onClick={load}
            className="p-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-gray-300 transition-colors">
            <RotateCcw size={14} className={cn(loading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* Info Banner */}
      <div className="rounded-2xl bg-cyan-500/5 border border-cyan-500/15 p-4 flex items-start gap-3">
        <ShieldCheck size={18} className="text-cyan-400 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-gray-400">
          <span className="text-cyan-400 font-medium">自动保护</span>：每次通过 AI 部署容器前，系统自动创建快照。
          回滚时可选择<span className="text-yellow-400">保留数据卷</span>（推荐），确保重要数据不丢失。
        </div>
      </div>

      {/* Snapshot List */}
      <div className="space-y-3">
        {(snapshots as unknown as Snapshot[]).length === 0 && !loading && (
          <div className="py-16 text-center text-gray-500 text-sm rounded-2xl bg-[#0f1117] border border-white/[0.06]">
            暂无快照，进行部署操作后会自动创建
          </div>
        )}
        {(snapshots as unknown as Snapshot[]).map((snap) => (
          <motion.div
            key={snap.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-4 px-5 py-4 rounded-2xl bg-[#0f1117] border border-white/[0.06] hover:border-white/[0.1] transition-colors"
          >
            <div className={cn(
              'p-2.5 rounded-xl',
              snap.is_auto ? 'bg-blue-500/10 text-blue-400' : 'bg-purple-500/10 text-purple-400'
            )}>
              {snap.is_auto ? <Clock size={16} /> : <ShieldCheck size={16} />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm text-white">{snap.name}</span>
                <span className={cn(
                  'text-[10px] px-2 py-0.5 rounded border font-mono',
                  snap.is_auto
                    ? 'bg-blue-500/10 text-blue-400 border-blue-500/15'
                    : 'bg-purple-500/10 text-purple-400 border-purple-500/15'
                )}>
                  {snap.is_auto ? '自动' : '手动'}
                </span>
              </div>
              <div className="flex items-center gap-4 mt-1">
                {snap.description && (
                  <span className="text-xs text-gray-500 truncate max-w-xs">{snap.description}</span>
                )}
                <span className="text-xs text-gray-600 flex items-center gap-1">
                  <Box size={10} />
                  {snap.container_count} 个容器
                </span>
                <span className="text-xs text-gray-600">{formatDate(snap.created_at)}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setRollbackModal({ snap, keepVolumes: true, running: false })}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-500/10 text-orange-400 border border-orange-500/15 text-xs font-medium hover:bg-orange-500/20 transition-colors"
              >
                <RotateCcw size={11} />
                回滚
              </button>
              <button
                onClick={() => deleteSnapshot(snap.id)}
                className="p-1.5 rounded-lg text-gray-600 hover:text-red-400 hover:bg-white/[0.06] transition-colors"
              >
                <Trash2 size={13} />
              </button>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Create Snapshot Modal */}
      {createForm.show && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-6"
          onClick={() => setCreateForm((f) => ({ ...f, show: false }))}>
          <div className="bg-[#0f1117] border border-white/[0.08] rounded-2xl w-full max-w-md p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-white">手动创建快照</h3>
            <input type="text" placeholder="快照名称"
              value={createForm.name}
              onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full bg-[#161820] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-cyan-500/40" />
            <input type="text" placeholder="备注说明（可选）"
              value={createForm.desc}
              onChange={(e) => setCreateForm((f) => ({ ...f, desc: e.target.value }))}
              className="w-full bg-[#161820] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-cyan-500/40" />
            <div className="flex gap-3">
              <button onClick={() => setCreateForm((f) => ({ ...f, show: false }))}
                className="flex-1 py-2.5 rounded-xl bg-white/[0.06] text-gray-300 text-sm hover:bg-white/[0.1]">取消</button>
              <button onClick={createSnapshot} disabled={createForm.submitting || !createForm.name}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-sm font-medium disabled:opacity-50">
                {createForm.submitting ? '创建中...' : '创建快照'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rollback Confirm Modal */}
      {rollbackModal.snap && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="bg-[#0f1117] border border-orange-500/20 rounded-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center gap-2">
              <AlertTriangle size={18} className="text-orange-400" />
              <h3 className="font-semibold text-white">确认回滚</h3>
            </div>
            <p className="text-sm text-gray-400">
              将回滚到快照 <span className="text-white font-mono">「{rollbackModal.snap.name}」</span>
              的状态，该快照包含 {rollbackModal.snap.container_count} 个容器配置。
            </p>
            <div className="rounded-xl bg-[#161820] border border-white/[0.06] p-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rollbackModal.keepVolumes}
                  onChange={(e) => setRollbackModal((s) => ({ ...s, keepVolumes: e.target.checked }))}
                  className="w-4 h-4 rounded accent-cyan-500"
                />
                <div>
                  <div className="text-sm font-medium text-white">保留数据卷（推荐）</div>
                  <div className="text-xs text-gray-500 mt-0.5">数据库等持久化数据不会被删除</div>
                </div>
              </label>
            </div>
            {!rollbackModal.keepVolumes && (
              <div className="flex items-start gap-2 text-xs text-yellow-400 bg-yellow-500/10 rounded-xl p-3 border border-yellow-500/20">
                <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" />
                警告：不保留卷将永久删除快照后新增的所有数据卷内容，此操作不可恢复！
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => setRollbackModal({ snap: null, keepVolumes: true, running: false })}
                className="flex-1 py-2.5 rounded-xl bg-white/[0.06] text-gray-300 text-sm hover:bg-white/[0.1]"
              >
                取消
              </button>
              <button
                onClick={executeRollback}
                disabled={rollbackModal.running}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-red-600 text-white text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {rollbackModal.running ? (
                  <><RotateCcw size={13} className="animate-spin" /> 回滚中...</>
                ) : (
                  <><RotateCcw size={13} /> 确认回滚</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
