import { useState } from 'react'
import { motion } from 'framer-motion'
import { Trash2, Download, RefreshCw, Search } from 'lucide-react'
import { useDockerStore } from '../lib/store'
import { useDocker } from '../hooks/useDocker'
import { cn, formatBytes, formatDate } from '../lib/utils'
import { dockerApi } from '../lib/api'
import toast from 'react-hot-toast'

export default function ImagesPage() {
  const { images, loading } = useDockerStore()
  const { refresh } = useDocker()
  const [search, setSearch] = useState('')
  const [pullForm, setPullForm] = useState({ show: false, image: '', tag: 'latest', loading: false })

  const filtered = images.filter(
    (i) =>
      i.tags.some((t) => t.includes(search)) ||
      i.id.includes(search)
  )

  const pullImage = async () => {
    if (!pullForm.image.trim()) return
    setPullForm((f) => ({ ...f, loading: true }))
    try {
      await dockerApi.pullImage(pullForm.image, pullForm.tag)
      toast.success(`${pullForm.image}:${pullForm.tag} 拉取成功`)
      setPullForm({ show: false, image: '', tag: 'latest', loading: false })
      await refresh()
    } catch (e: unknown) {
      toast.error(`拉取失败: ${e instanceof Error ? e.message : String(e)}`)
      setPullForm((f) => ({ ...f, loading: false }))
    }
  }

  const removeImage = async (id: string, tag: string) => {
    if (!confirm(`确认删除镜像 "${tag}"？`)) return
    try {
      await dockerApi.removeImage(id, true)
      toast.success('镜像已删除')
      await refresh()
    } catch (e: unknown) {
      toast.error(`删除失败: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-white">镜像管理</h1>
          <p className="text-gray-500 text-sm mt-1">共 {images.length} 个镜像</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setPullForm((f) => ({ ...f, show: true }))}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border border-cyan-500/20 text-cyan-400 text-sm font-medium hover:from-cyan-500/30 hover:to-blue-500/30 transition-all"
          >
            <Download size={14} />
            拉取镜像
          </button>
          <button
            onClick={refresh}
            disabled={loading.all}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-gray-300 text-sm transition-colors"
          >
            <RefreshCw size={13} className={cn(loading.all && 'animate-spin')} />
          </button>
        </div>
      </div>

      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input
          type="text"
          placeholder="搜索镜像名称或 ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-[#0f1117] border border-white/[0.06] rounded-xl pl-9 pr-4 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-cyan-500/40"
        />
      </div>

      <div className="rounded-2xl bg-[#0f1117] border border-white/[0.06] overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/[0.06]">
              {['标签', 'ID', '大小', '创建时间', '操作'].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {filtered.map((img) => (
              <motion.tr
                key={img.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="hover:bg-white/[0.02]"
              >
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {img.tags.length > 0
                      ? img.tags.map((t) => (
                          <span key={t} className="text-xs font-mono bg-blue-500/10 text-blue-400 border border-blue-500/15 px-2 py-0.5 rounded">
                            {t}
                          </span>
                        ))
                      : <span className="text-xs text-gray-500 font-mono">&lt;none&gt;</span>
                    }
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs font-mono text-gray-500">{img.id}</span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs font-mono text-gray-300">{formatBytes(img.size)}</span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs text-gray-500">{formatDate(img.created)}</span>
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => removeImage(img.id, img.tags[0] || img.id)}
                    className="p-1.5 rounded-lg text-gray-600 hover:text-red-400 hover:bg-white/[0.06] transition-colors"
                  >
                    <Trash2 size={13} />
                  </button>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="py-16 text-center text-gray-500 text-sm">暂无镜像</div>
        )}
      </div>

      {/* Pull Modal */}
      {pullForm.show && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-6"
          onClick={() => setPullForm((f) => ({ ...f, show: false }))}
        >
          <div
            className="bg-[#0f1117] border border-white/[0.08] rounded-2xl w-full max-w-md p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-semibold text-white">拉取镜像</h3>
            <div className="space-y-3">
              <input
                type="text"
                placeholder="镜像名称，如 nginx / ollama/ollama"
                value={pullForm.image}
                onChange={(e) => setPullForm((f) => ({ ...f, image: e.target.value }))}
                className="w-full bg-[#161820] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-cyan-500/40"
              />
              <input
                type="text"
                placeholder="标签，默认 latest"
                value={pullForm.tag}
                onChange={(e) => setPullForm((f) => ({ ...f, tag: e.target.value }))}
                className="w-full bg-[#161820] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-cyan-500/40"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setPullForm((f) => ({ ...f, show: false }))}
                className="flex-1 py-2.5 rounded-xl bg-white/[0.06] text-gray-300 text-sm hover:bg-white/[0.1] transition-colors"
              >
                取消
              </button>
              <button
                onClick={pullImage}
                disabled={pullForm.loading || !pullForm.image}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-sm font-medium disabled:opacity-50 hover:opacity-90 transition-opacity"
              >
                {pullForm.loading ? '拉取中...' : '拉取'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
