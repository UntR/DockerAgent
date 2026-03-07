import { useEffect, useState, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Settings, Plus, Trash2, CheckCircle, XCircle, Loader,
  Eye, EyeOff, Zap, ChevronDown, RefreshCw, Edit2, Save, X,
  Cpu, Globe, Key, Layers,
} from 'lucide-react'
import { settingsApi, Provider, ProviderCreate } from '../lib/settingsApi'
import { cn } from '../lib/utils'
import toast from 'react-hot-toast'

// ── 常量 ──────────────────────────────────────────────────────

const PROVIDER_TYPES = [
  { value: 'anthropic', label: 'Anthropic (Claude)', color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20' },
  { value: 'openai',    label: 'OpenAI',              color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
  { value: 'custom',    label: '自定义 (OpenAI 兼容)', color: 'text-purple-400',  bg: 'bg-purple-500/10 border-purple-500/20' },
]

const PRESET_BASE_URLS = [
  { label: 'OpenAI 官方', url: 'https://api.openai.com/v1' },
  { label: 'DeepSeek',    url: 'https://api.deepseek.com/v1' },
  { label: 'Moonshot (Kimi)', url: 'https://api.moonshot.cn/v1' },
  { label: 'Zhipu AI',   url: 'https://open.bigmodel.cn/api/paas/v4' },
  { label: '阿里云 DashScope', url: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  { label: 'MiniMax',     url: 'https://api.minimax.chat/v1' },
  { label: 'SiliconFlow', url: 'https://api.siliconflow.cn/v1' },
  { label: 'Groq',       url: 'https://api.groq.com/openai/v1' },
  { label: 'Together AI', url: 'https://api.together.xyz/v1' },
  { label: 'Ollama 本地', url: 'http://localhost:11434/v1' },
  { label: 'LM Studio',  url: 'http://localhost:1234/v1' },
]

const DEFAULT_FORM: ProviderCreate & { id?: number } = {
  name: '',
  provider_type: 'custom',
  base_url: '',
  api_key: '',
  model: '',
  extra: {},
}

type TestStatus = 'idle' | 'loading' | 'ok' | 'fail'

// ── 主页面 ────────────────────────────────────────────────────

export default function SettingsPage() {
  const [providers, setProviders] = useState<Provider[]>([])
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await settingsApi.listProviders()
      setProviders(data)
    } catch (e: unknown) {
      toast.error(`加载失败: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const activate = async (id: number) => {
    try {
      const res = await settingsApi.activateProvider(id)
      toast.success(res.message)
      await load()
    } catch (e: unknown) {
      toast.error(`切换失败: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const remove = async (p: Provider) => {
    if (!confirm(`确认删除提供商「${p.name}」？`)) return
    try {
      await settingsApi.deleteProvider(p.id)
      toast.success('已删除')
      await load()
    } catch (e: unknown) {
      toast.error(`删除失败: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const handleFormClose = () => {
    setShowForm(false)
    setEditingId(null)
  }

  const handleFormSave = async () => {
    await load()
    handleFormClose()
  }

  return (
    <div className="p-8 space-y-8 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-white flex items-center gap-2">
            <Settings size={22} className="text-gray-400" />
            设置
          </h1>
          <p className="text-gray-500 text-sm mt-1">管理 LLM 提供商、API Key 和模型配置</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => { setEditingId(null); setShowForm(true) }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border border-cyan-500/20 text-cyan-400 text-sm font-medium hover:from-cyan-500/30 transition-all"
          >
            <Plus size={14} />
            添加提供商
          </button>
          <button onClick={load} className="p-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-gray-300 transition-colors">
            <RefreshCw size={14} className={cn(loading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* Provider 列表 */}
      <div className="space-y-3">
        {providers.length === 0 && !loading && (
          <div className="py-16 text-center text-gray-500 rounded-2xl bg-[#0f1117] border border-white/[0.06]">
            暂无配置，点击「添加提供商」开始
          </div>
        )}

        {providers.map((p) => (
          <ProviderCard
            key={p.id}
            provider={p}
            onActivate={() => activate(p.id)}
            onEdit={() => { setEditingId(p.id); setShowForm(true) }}
            onDelete={() => remove(p)}
          />
        ))}
      </div>

      {/* 说明卡片 */}
      <InfoCards />

      {/* 添加/编辑表单 */}
      <AnimatePresence>
        {showForm && (
          <ProviderFormModal
            editingId={editingId}
            providers={providers}
            onClose={handleFormClose}
            onSave={handleFormSave}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Provider 卡片 ─────────────────────────────────────────────

function ProviderCard({
  provider: p,
  onActivate, onEdit, onDelete,
}: {
  provider: Provider
  onActivate: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const [testing, setTesting] = useState<TestStatus>('idle')
  const [testMsg, setTestMsg] = useState('')
  const [showKey, setShowKey] = useState(false)

  const typeInfo = PROVIDER_TYPES.find((t) => t.value === p.provider_type)

  const testConn = async () => {
    setTesting('loading')
    setTestMsg('')
    try {
      // 需要先获取完整 API key（这里用后端测试接口直接走已保存的配置）
      const res = await settingsApi.testConnection({
        provider_type: p.provider_type,
        base_url: p.base_url || undefined,
        api_key: '__use_saved__' + p.id,  // 特殊标记，后端识别用已保存的key
        model: p.model,
      })
      setTesting(res.success ? 'ok' : 'fail')
      setTestMsg(res.message)
    } catch (e: unknown) {
      setTesting('fail')
      setTestMsg(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'rounded-2xl border p-5 transition-all',
        p.is_active
          ? 'bg-gradient-to-br from-cyan-500/5 to-blue-500/5 border-cyan-500/25'
          : 'bg-[#0f1117] border-white/[0.06] hover:border-white/[0.1]'
      )}
    >
      <div className="flex items-start gap-4">
        {/* 图标 */}
        <div className={cn('p-2.5 rounded-xl border flex-shrink-0', typeInfo?.bg || 'bg-gray-500/10 border-gray-500/20')}>
          <Cpu size={18} className={typeInfo?.color || 'text-gray-400'} />
        </div>

        {/* 主体 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-white">{p.name}</span>
            {p.is_active && (
              <span className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-400 border border-cyan-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                当前使用
              </span>
            )}
            {p.is_builtin && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.06] text-gray-500 border border-white/[0.06]">
                内置
              </span>
            )}
            <span className={cn('text-[10px] font-mono px-2 py-0.5 rounded border', typeInfo?.bg || '')}>
              {typeInfo?.label || p.provider_type}
            </span>
          </div>

          <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-1 text-xs">
            <InfoRow icon={Key} label="API Key" value={p.api_key_masked} mono />
            <InfoRow icon={Layers} label="模型" value={p.model} mono />
            {p.base_url && (
              <InfoRow icon={Globe} label="Base URL" value={p.base_url} mono truncate />
            )}
          </div>

          {/* 测试结果 */}
          {testMsg && (
            <div className={cn(
              'mt-2 flex items-start gap-2 text-xs px-3 py-2 rounded-xl border',
              testing === 'ok'
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                : 'bg-red-500/10 border-red-500/20 text-red-300'
            )}>
              {testing === 'ok'
                ? <CheckCircle size={13} className="flex-shrink-0 mt-0.5" />
                : <XCircle size={13} className="flex-shrink-0 mt-0.5" />
              }
              {testMsg}
            </div>
          )}
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* 测试连接 */}
          <button
            onClick={testConn}
            disabled={testing === 'loading'}
            title="测试连接"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-gray-400 hover:text-white text-xs transition-colors disabled:opacity-50"
          >
            {testing === 'loading'
              ? <Loader size={12} className="animate-spin" />
              : <Zap size={12} />
            }
            测试
          </button>

          {/* 激活 */}
          {!p.is_active && (
            <button
              onClick={onActivate}
              title="设为当前使用"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/20 text-xs transition-colors"
            >
              <CheckCircle size={12} />
              使用
            </button>
          )}

          {/* 编辑 */}
          <button
            onClick={onEdit}
            title="编辑"
            className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/[0.08] transition-colors"
          >
            <Edit2 size={13} />
          </button>

          {/* 删除（非内置才显示） */}
          {!p.is_builtin && (
            <button
              onClick={onDelete}
              title="删除"
              className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>
    </motion.div>
  )
}

function InfoRow({
  icon: Icon, label, value, mono, truncate,
}: {
  icon: React.ElementType
  label: string
  value: string
  mono?: boolean
  truncate?: boolean
}) {
  return (
    <div className="flex items-center gap-1.5 text-gray-500">
      <Icon size={11} className="flex-shrink-0" />
      <span className="flex-shrink-0">{label}:</span>
      <span className={cn('text-gray-300', mono && 'font-mono', truncate && 'truncate max-w-[180px]')}>
        {value || '-'}
      </span>
    </div>
  )
}

// ── 添加/编辑 Modal ───────────────────────────────────────────

function ProviderFormModal({
  editingId, providers, onClose, onSave,
}: {
  editingId: number | null
  providers: Provider[]
  onClose: () => void
  onSave: () => void
}) {
  const isEdit = editingId !== null
  const existing = providers.find((p) => p.id === editingId)

  const [form, setForm] = useState<ProviderCreate & { id?: number }>(() => {
    if (existing) {
      return {
        id: existing.id,
        name: existing.name,
        provider_type: existing.provider_type,
        base_url: existing.base_url,
        api_key: '',  // 编辑时不预填，留空=不修改
        model: existing.model,
        extra: existing.extra,
      }
    }
    return { ...DEFAULT_FORM }
  })

  const [showKey, setShowKey] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [testing, setTesting] = useState<TestStatus>('idle')
  const [testMsg, setTestMsg] = useState('')
  const [fetchingModels, setFetchingModels] = useState(false)
  const [modelList, setModelList] = useState<string[]>([])
  const [showModelList, setShowModelList] = useState(false)
  const [showUrlPreset, setShowUrlPreset] = useState(false)
  const urlPresetRef = useRef<HTMLDivElement>(null)

  // 点击外部关闭预设下拉
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (urlPresetRef.current && !urlPresetRef.current.contains(e.target as Node)) {
        setShowUrlPreset(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const set = (key: keyof typeof form, val: unknown) =>
    setForm((f) => ({ ...f, [key]: val }))

  const effectiveKey = form.api_key || (isEdit ? '__use_saved__' + editingId : '')

  const testConnection = async () => {
    if (!effectiveKey && !isEdit) { toast.error('请先填写 API Key'); return }
    if (!form.model) { toast.error('请先填写模型名称'); return }
    setTesting('loading')
    setTestMsg('')
    try {
      const res = await settingsApi.testConnection({
        provider_type: form.provider_type,
        base_url: form.base_url || undefined,
        api_key: effectiveKey,
        model: form.model,
      })
      setTesting(res.success ? 'ok' : 'fail')
      setTestMsg(res.message)
    } catch (e: unknown) {
      setTesting('fail')
      setTestMsg(e instanceof Error ? e.message : String(e))
    }
  }

  const fetchModels = async () => {
    if (!effectiveKey && !isEdit) { toast.error('请先填写 API Key'); return }
    setFetchingModels(true)
    setModelList([])
    try {
      const res = await settingsApi.fetchModels({
        provider_type: form.provider_type,
        base_url: form.base_url || undefined,
        api_key: effectiveKey,
      })
      setModelList(res.models)
      setShowModelList(true)
      if (!res.success && res.message) toast(res.message, { icon: 'ℹ️' })
    } catch (e: unknown) {
      toast.error(`拉取失败: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setFetchingModels(false)
    }
  }

  const submit = async () => {
    if (!form.name.trim()) { toast.error('请填写提供商名称'); return }
    if (!form.model.trim()) { toast.error('请填写模型名称'); return }
    if (!isEdit && !form.api_key.trim()) { toast.error('请填写 API Key'); return }
    if (form.provider_type === 'custom' && !form.base_url?.trim()) {
      toast.error('自定义提供商必须填写 Base URL')
      return
    }

    setSubmitting(true)
    try {
      if (isEdit && editingId) {
        await settingsApi.updateProvider(editingId, {
          name: form.name,
          base_url: form.base_url,
          api_key: form.api_key || undefined,
          model: form.model,
          extra: form.extra,
        })
        toast.success('提供商已更新')
      } else {
        await settingsApi.createProvider(form)
        toast.success('提供商已添加')
      }
      onSave()
    } catch (e: unknown) {
      toast.error(`保存失败: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setSubmitting(false)
    }
  }

  const typeInfo = PROVIDER_TYPES.find((t) => t.value === form.provider_type)

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-6"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.97 }}
        transition={{ duration: 0.2 }}
        className="bg-[#0f1117] border border-white/[0.08] rounded-2xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题 */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.06]">
          <h3 className="font-semibold text-white">
            {isEdit ? '编辑提供商' : '添加 LLM 提供商'}
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/[0.08] transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* 表单 */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* 提供商类型 */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-400">提供商类型</label>
            <div className="grid grid-cols-3 gap-2">
              {PROVIDER_TYPES.map((t) => (
                <button
                  key={t.value}
                  onClick={() => {
                    set('provider_type', t.value)
                    // 自动填充 base_url
                    if (t.value !== 'custom') {
                      const builtinUrl = t.value === 'anthropic'
                        ? 'https://api.anthropic.com'
                        : 'https://api.openai.com/v1'
                      set('base_url', builtinUrl)
                    }
                    setModelList([])
                  }}
                  className={cn(
                    'py-2.5 px-3 rounded-xl border text-xs font-medium transition-all text-center',
                    form.provider_type === t.value
                      ? t.bg + ' ' + t.color
                      : 'bg-white/[0.04] border-white/[0.06] text-gray-400 hover:border-white/[0.1]'
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* 名称 */}
          <Field label="提供商名称" required>
            <input
              type="text"
              placeholder={`例如：我的 ${typeInfo?.label || 'LLM'}`}
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              className={inputCls}
            />
          </Field>

          {/* Base URL */}
          <Field
            label="Base URL"
            required={form.provider_type === 'custom'}
            hint={form.provider_type !== 'custom' ? '（可选，留空使用官方地址）' : undefined}
          >
            <div className="space-y-2" ref={urlPresetRef}>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="https://api.example.com/v1"
                  value={form.base_url || ''}
                  onChange={(e) => set('base_url', e.target.value)}
                  className={cn(inputCls, 'flex-1')}
                />
                <button
                  type="button"
                  onClick={() => setShowUrlPreset(!showUrlPreset)}
                  className={cn(
                    'flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium transition-all',
                    showUrlPreset
                      ? 'bg-cyan-500/15 border-cyan-500/25 text-cyan-400'
                      : 'bg-white/[0.06] border-white/[0.06] text-gray-400 hover:bg-white/[0.1] hover:text-white'
                  )}
                >
                  预设 <ChevronDown size={10} className={cn('transition-transform', showUrlPreset && 'rotate-180')} />
                </button>
              </div>
              {/* 预设列表（内联展开，不浮动） */}
              {showUrlPreset && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="rounded-xl border border-white/[0.08] bg-[#161820] overflow-hidden"
                >
                  <div className="max-h-44 overflow-y-auto">
                    {PRESET_BASE_URLS.map((preset) => (
                      <button
                        key={preset.url}
                        type="button"
                        onClick={() => {
                          set('base_url', preset.url)
                          setShowUrlPreset(false)
                        }}
                        className={cn(
                          'w-full text-left px-4 py-2.5 hover:bg-white/[0.06] transition-colors border-b border-white/[0.04] last:border-0',
                          form.base_url === preset.url && 'bg-cyan-500/10'
                        )}
                      >
                        <div className="text-xs font-medium text-white">{preset.label}</div>
                        <div className="text-[10px] font-mono text-gray-500 truncate">{preset.url}</div>
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </div>
          </Field>

          {/* API Key */}
          <Field
            label="API Key"
            required={!isEdit}
            hint={isEdit ? '（留空则不修改）' : undefined}
          >
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                placeholder={isEdit ? '留空不修改，重新输入即覆盖' : '粘贴你的 API Key'}
                value={form.api_key}
                onChange={(e) => set('api_key', e.target.value)}
                className={cn(inputCls, 'pr-10 font-mono')}
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
              >
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </Field>

          {/* 模型名称 */}
          <Field label="模型名称" required>
            <div className="space-y-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="例如：gpt-4o / claude-3-5-sonnet-20241022"
                  value={form.model}
                  onChange={(e) => set('model', e.target.value)}
                  className={cn(inputCls, 'flex-1 font-mono')}
                />
                <button
                  type="button"
                  onClick={fetchModels}
                  disabled={fetchingModels}
                  title="拉取模型列表"
                  className={cn(
                    'flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs transition-colors disabled:opacity-50',
                    showModelList && modelList.length > 0
                      ? 'bg-cyan-500/15 border-cyan-500/25 text-cyan-400'
                      : 'bg-white/[0.06] border-white/[0.06] text-gray-300 hover:bg-white/[0.1]'
                  )}
                >
                  {fetchingModels
                    ? <Loader size={12} className="animate-spin" />
                    : <RefreshCw size={12} />
                  }
                  {fetchingModels ? '拉取中' : '拉取列表'}
                </button>
              </div>
              {/* 模型列表（内联展开，不浮动） */}
              {showModelList && modelList.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="rounded-xl border border-white/[0.08] bg-[#161820] overflow-hidden"
                >
                  <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.04]">
                    <span className="text-[10px] text-gray-500">{modelList.length} 个可用模型</span>
                    <button
                      type="button"
                      onClick={() => setShowModelList(false)}
                      className="text-gray-600 hover:text-gray-300 transition-colors"
                    >
                      <X size={12} />
                    </button>
                  </div>
                  <div className="max-h-44 overflow-y-auto">
                    {modelList.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => {
                          set('model', m)
                          setShowModelList(false)
                        }}
                        className={cn(
                          'w-full text-left px-4 py-2 text-xs font-mono hover:bg-white/[0.06] transition-colors border-b border-white/[0.03] last:border-0',
                          form.model === m ? 'text-cyan-400 bg-cyan-500/10' : 'text-gray-300'
                        )}
                      >
                        {m}
                        {form.model === m && <span className="ml-2 text-cyan-500">✓</span>}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </div>
          </Field>

          {/* 连通性测试 */}
          <div className="rounded-xl bg-[#161820] border border-white/[0.06] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-400">连通性测试</span>
              <button
                type="button"
                onClick={testConnection}
                disabled={testing === 'loading'}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border border-cyan-500/20 text-cyan-400 text-xs font-medium hover:from-cyan-500/30 transition-all disabled:opacity-50"
              >
                {testing === 'loading'
                  ? <><Loader size={11} className="animate-spin" /> 测试中...</>
                  : <><Zap size={11} /> 测试连接</>
                }
              </button>
            </div>

            <AnimatePresence>
              {testMsg && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className={cn(
                    'flex items-start gap-2 text-xs px-3 py-2.5 rounded-lg border',
                    testing === 'ok'
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                      : 'bg-red-500/10 border-red-500/20 text-red-300'
                  )}
                >
                  {testing === 'ok'
                    ? <CheckCircle size={13} className="flex-shrink-0 mt-0.5" />
                    : <XCircle size={13} className="flex-shrink-0 mt-0.5" />
                  }
                  <span>{testMsg}</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="px-6 py-4 border-t border-white/[0.06] flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-white/[0.06] text-gray-300 text-sm hover:bg-white/[0.1] transition-colors">
            取消
          </button>
          <button
            onClick={submit}
            disabled={submitting}
            className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
          >
            {submitting
              ? <><Loader size={14} className="animate-spin" /> 保存中...</>
              : <><Save size={14} /> {isEdit ? '保存修改' : '添加提供商'}</>
            }
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ── 帮助说明卡片 ──────────────────────────────────────────────

function InfoCards() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {[
        {
          title: 'Anthropic Claude',
          desc: '获取 API Key：console.anthropic.com\n推荐模型：claude-3-5-sonnet-20241022',
          color: 'border-orange-500/15 bg-orange-500/5',
          accent: 'text-orange-400',
        },
        {
          title: 'OpenAI / 兼容接口',
          desc: '支持 OpenAI、DeepSeek、Kimi、阿里云等任何兼容 OpenAI API 格式的服务',
          color: 'border-emerald-500/15 bg-emerald-500/5',
          accent: 'text-emerald-400',
        },
        {
          title: '本地模型 (Ollama)',
          desc: '选择"自定义"类型\nBase URL: http://host.docker.internal:11434/v1\nAPI Key 填任意值',
          color: 'border-purple-500/15 bg-purple-500/5',
          accent: 'text-purple-400',
        },
      ].map((card) => (
        <div key={card.title} className={cn('rounded-2xl border p-4', card.color)}>
          <div className={cn('text-sm font-semibold mb-2', card.accent)}>{card.title}</div>
          <div className="text-xs text-gray-500 whitespace-pre-line leading-relaxed">{card.desc}</div>
        </div>
      ))}
    </div>
  )
}

// ── 工具 ──────────────────────────────────────────────────────

function Field({
  label, required, hint, children,
}: {
  label: string
  required?: boolean
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1.5 text-xs font-medium text-gray-400">
        {label}
        {required && <span className="text-red-400">*</span>}
        {hint && <span className="text-gray-600 font-normal">{hint}</span>}
      </label>
      {children}
    </div>
  )
}

const inputCls =
  'w-full bg-[#161820] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-cyan-500/40 transition-colors'
