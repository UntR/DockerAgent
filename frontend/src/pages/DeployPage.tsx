import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Rocket, Github, Globe, Package, Sparkles, ArrowRight, Loader, AlertTriangle, FileText, KeyRound } from 'lucide-react'
import { deployApi, DeploymentPlan, DeploymentEnvEntry, DeploymentTask } from '../lib/api'
import { useLocation, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'

const EXAMPLES = [
  { icon: Package, label: 'Ollama', desc: '本地大模型运行时', input: 'ollama/ollama' },
  { icon: Globe, label: 'Open WebUI', desc: 'Ollama 对话界面', input: 'open-webui/open-webui' },
  { icon: Github, label: 'n8n', desc: '自动化工作流', input: 'https://github.com/n8n-io/n8n' },
  { icon: Package, label: 'Gitea', desc: '自托管 Git 服务', input: 'gitea/gitea' },
]

export default function DeployPage() {
  const location = useLocation()
  const routeState = location.state as { source?: string; description?: string } | null
  const [source, setSource] = useState(routeState?.source ?? '')
  const [description, setDescription] = useState(routeState?.description ?? '')
  const [envValues, setEnvValues] = useState<Record<string, string>>({})
  const [analyzing, setAnalyzing] = useState(false)
  const [analysis, setAnalysis] = useState<Record<string, unknown> | null>(null)
  const [tasks, setTasks] = useState<DeploymentTask[]>([])
  const navigate = useNavigate()
  const plan = analysis?.deployment_plan as DeploymentPlan | undefined
  const missingRequired = plan?.env.required
    .filter((item) => !envValues[item.key]?.trim())
    .map((item) => item.key) ?? []

  const loadTasks = async () => {
    try {
      setTasks(await deployApi.listTasks())
    } catch {
      setTasks([])
    }
  }

  useEffect(() => { loadTasks() }, [])

  const analyze = async () => {
    if (!source.trim()) return
    setAnalyzing(true)
    setAnalysis(null)
    try {
      const result = await deployApi.analyze(source, description, envValues)
      setAnalysis(result as Record<string, unknown>)
    } catch (e: unknown) {
      toast.error(`分析失败: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setAnalyzing(false)
    }
  }

  const startDeploy = async () => {
    if (!source.trim()) return
    try {
      const result = await deployApi.smartDeploy(source, description, envValues) as {
        session_id: string
        init_message: string
      }
      toast.success('部署任务已创建，跳转到 AI 助手...')
      await loadTasks()
      navigate('/chat', {
        state: {
          sessionId: result.session_id,
          initMessage: result.init_message,
        },
      })
    } catch (e: unknown) {
      toast.error(`部署失败: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return (
    <div className="p-8 space-y-8 max-w-3xl">
      <div>
        <h1 className="font-display text-2xl font-semibold text-white">智能部署</h1>
        <p className="text-gray-500 text-sm mt-1">
          输入 GitHub 链接、项目名称或镜像名，AI 自动解析并完成部署
        </p>
      </div>

      {/* Input */}
      <div className="space-y-3">
        <div className="relative">
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">
            <Globe size={16} />
          </div>
          <input
            type="text"
            placeholder="输入 GitHub URL、owner/repo 或镜像名称..."
            value={source}
            onChange={(e) => setSource(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && analyze()}
            className="w-full bg-[#0f1117] border border-white/[0.08] rounded-2xl pl-11 pr-4 py-4 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-cyan-500/40 transition-colors"
          />
        </div>
        <input
          type="text"
          placeholder="补充说明（可选），例如：需要持久化数据，端口映射到 8080"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full bg-[#0f1117] border border-white/[0.08] rounded-2xl px-4 py-3 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-cyan-500/40 transition-colors"
        />
        <div className="flex gap-3">
          <button
            onClick={analyze}
            disabled={!source.trim() || analyzing}
            className="flex items-center gap-2 px-5 py-3 rounded-xl bg-white/[0.08] hover:bg-white/[0.12] text-gray-300 text-sm font-medium disabled:opacity-50 transition-colors"
          >
            {analyzing ? <Loader size={14} className="animate-spin" /> : <Sparkles size={14} />}
            解析分析
          </button>
          <button
            onClick={startDeploy}
            disabled={!source.trim() || missingRequired.length > 0}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-sm font-medium disabled:opacity-50 hover:opacity-90 transition-opacity"
          >
            <Rocket size={14} />
            AI 智能部署
            <ArrowRight size={14} />
          </button>
        </div>
      </div>

      {/* Analysis Result */}
      {analysis && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl bg-[#0f1117] border border-cyan-500/20 p-5 space-y-3"
        >
          <div className="flex items-center gap-2">
            <Sparkles size={14} className="text-cyan-400" />
            <span className="text-sm font-semibold text-white">解析结果</span>
          </div>
          <AnalysisDisplay data={analysis} />
        </motion.div>
      )}

      {plan && (
        <DeploymentPlanPanel
          plan={plan}
          envValues={envValues}
          onEnvChange={(key, value) => setEnvValues((current) => ({ ...current, [key]: value }))}
          onRefresh={analyze}
          refreshing={analyzing}
        />
      )}

      {/* Quick Deploy Examples */}
      <div>
        <h3 className="text-sm font-semibold text-gray-400 mb-3">常用应用快速部署</h3>
        <div className="grid grid-cols-2 gap-3">
          {EXAMPLES.map(({ icon: Icon, label, desc, input }) => (
            <button
              key={label}
              onClick={() => setSource(input)}
              className="flex items-center gap-3 px-4 py-4 rounded-2xl bg-[#0f1117] border border-white/[0.06] hover:border-cyan-500/20 text-left transition-all group"
            >
              <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 group-hover:bg-cyan-500/20 transition-colors">
                <Icon size={18} />
              </div>
              <div>
                <div className="text-sm font-medium text-white">{label}</div>
                <div className="text-xs text-gray-500 mt-0.5">{desc}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl bg-[#0f1117] border border-white/[0.06] p-5">
        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <Sparkles size={14} className="text-yellow-400" />
          AI 部署能力
        </h3>
        <div className="space-y-2 text-sm text-gray-500">
          {[
            '自动抓取 GitHub 仓库的 docker-compose.yml',
            '从 Docker Hub 获取官方镜像配置和最佳实践',
            '智能识别应用间的联动（如 Ollama + Open WebUI）',
            '自动创建所需网络和数据卷',
            '部署前自动快照，支持一键回滚',
            '部署完成后自动连通关联容器的网络',
          ].map((item) => (
            <div key={item} className="flex items-center gap-2">
              <span className="w-1 h-1 rounded-full bg-cyan-400/60" />
              {item}
            </div>
          ))}
        </div>
      </div>

      <DeploymentTasksPanel tasks={tasks} onRefresh={loadTasks} />
    </div>
  )
}

function DeploymentTasksPanel({
  tasks,
  onRefresh,
}: {
  tasks: DeploymentTask[]
  onRefresh: () => void
}) {
  return (
    <div className="rounded-2xl bg-[#0f1117] border border-white/[0.06] p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white">最近部署任务</h2>
        <button
          onClick={onRefresh}
          className="px-2.5 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-xs text-gray-400"
        >
          刷新
        </button>
      </div>
      {tasks.length === 0 ? (
        <div className="text-xs text-gray-500">暂无部署任务记录</div>
      ) : (
        <div className="space-y-2">
          {tasks.slice(0, 5).map((task) => (
            <div key={task.id} className="rounded-xl bg-white/[0.03] border border-white/[0.05] px-3 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm text-white font-mono truncate">{task.compose_project}</div>
                  <div className="text-xs text-gray-600 truncate">{task.message || task.work_dir}</div>
                </div>
                <span className={task.status === 'failed' ? 'text-xs text-red-300' : 'text-xs text-emerald-400'}>
                  {task.status}
                </span>
              </div>
              {task.error_output && (
                <pre className="mt-2 max-h-20 overflow-auto whitespace-pre-wrap text-[11px] text-red-200/80 bg-red-500/10 rounded-lg p-2">
                  {task.error_output.slice(-800)}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function DeploymentPlanPanel({
  plan,
  envValues,
  onEnvChange,
  onRefresh,
  refreshing,
}: {
  plan: DeploymentPlan
  envValues: Record<string, string>
  onEnvChange: (key: string, value: string) => void
  onRefresh: () => void
  refreshing: boolean
}) {
  const envEntries = [...plan.env.required, ...plan.env.optional]

  return (
    <div className="rounded-2xl bg-[#0f1117] border border-white/[0.06] p-5 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <Rocket size={14} className="text-cyan-400" />
            部署计划
          </h2>
          <p className="text-xs text-gray-500 mt-1 font-mono">
            {plan.compose_project} · {plan.work_dir}
          </p>
        </div>
        <span className={plan.deployable ? 'text-xs text-emerald-400' : 'text-xs text-red-300'}>
          {plan.deployable ? '可部署' : '需要处理'}
        </span>
      </div>

      {envEntries.length > 0 && (
        <div className="space-y-3">
          <div className="text-xs font-semibold text-gray-400 flex items-center gap-2">
            <KeyRound size={13} />
            环境变量
          </div>
          <div className="grid gap-3">
            {envEntries.map((item) => (
              <EnvInput
                key={item.key}
                item={item}
                required={plan.env.required.some((required) => required.key === item.key)}
                value={envValues[item.key] ?? item.default ?? ''}
                onChange={(value) => onEnvChange(item.key, value)}
              />
            ))}
          </div>
          {plan.env.missing_required_keys.length > 0 && (
            <div className="text-xs text-yellow-300 flex items-center gap-2">
              <AlertTriangle size={12} />
              仍缺少必填项：{plan.env.missing_required_keys.join(', ')}
            </div>
          )}
          <button
            onClick={onRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-gray-300 text-xs disabled:opacity-50"
          >
            {refreshing ? <Loader size={13} className="animate-spin" /> : <Sparkles size={13} />}
            用当前配置刷新计划
          </button>
        </div>
      )}

      <div className="space-y-2">
        <div className="text-xs font-semibold text-gray-400 flex items-center gap-2">
          <FileText size={13} />
          将写入文件
        </div>
        {plan.files.map((file) => (
          <div key={file.path} className="text-xs font-mono text-gray-400 bg-white/[0.03] rounded-lg px-3 py-2">
            {file.path}
          </div>
        ))}
      </div>

      {plan.warnings.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-semibold text-gray-400">预检风险</div>
          {plan.warnings.map((warning, index) => (
            <div
              key={`${warning.code}-${index}`}
              className={warning.level === 'danger' ? 'text-xs text-red-300' : 'text-xs text-yellow-300'}
            >
              {warning.message}
            </div>
          ))}
        </div>
      )}

      {plan.access_urls.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-semibold text-gray-400">预计访问地址</div>
          {plan.access_urls.map((item, index) => (
            <div key={`${item.service}-${index}`} className="text-xs font-mono text-cyan-400">
              {item.service}: {item.url}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function EnvInput({
  item,
  required,
  value,
  onChange,
}: {
  item: DeploymentEnvEntry
  required: boolean
  value: string
  onChange: (value: string) => void
}) {
  const secretLike = /TOKEN|KEY|SECRET|PASSWORD/i.test(item.key)

  return (
    <label className="grid gap-1.5">
      <span className="text-xs text-gray-400">
        {item.key}
        {required && <span className="text-red-300 ml-1">*</span>}
        {item.description && <span className="text-gray-600 ml-2">{item.description}</span>}
      </span>
      <input
        type={secretLike ? 'password' : 'text'}
        value={value}
        placeholder={item.example || item.default || '请输入配置值'}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-[#161820] border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-cyan-500/40"
      />
    </label>
  )
}

function AnalysisDisplay({ data }: { data: Record<string, unknown> }) {
  const d = data
  const preflight = d.preflight as
    | {
        warnings?: Array<{ code: string; level: string; message: string }>
        access_urls?: Array<{ service: string; url: string }>
      }
    | undefined

  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-center gap-2">
        <span className="text-gray-500">类型：</span>
        <span className="text-cyan-400 font-mono">{String(d.type || '-')}</span>
      </div>

      {!!d.compose_content && (
        <div>
          <div className="text-gray-500 mb-1">找到 docker-compose.yml：</div>
          <pre className="code-block text-gray-300 text-xs overflow-auto max-h-48 whitespace-pre-wrap">
            {String(d.compose_content).slice(0, 1000)}
            {String(d.compose_content).length > 1000 ? '\n...(已截断)' : ''}
          </pre>
        </div>
      )}

      {preflight && (
        <div className="space-y-2">
          {Array.isArray(preflight.warnings) && preflight.warnings.length > 0 && (
            <div>
              <div className="text-gray-500 mb-1">部署前预检：</div>
              <div className="space-y-1">
                {preflight.warnings.map((warning, i) => (
                  <div
                    key={`${warning.code}-${i}`}
                    className={warning.level === 'danger' ? 'text-red-300' : 'text-yellow-300'}
                  >
                    {warning.message}
                  </div>
                ))}
              </div>
            </div>
          )}
          {Array.isArray(preflight.access_urls) && preflight.access_urls.length > 0 && (
            <div>
              <div className="text-gray-500 mb-1">预计访问地址：</div>
              <div className="space-y-1">
                {preflight.access_urls.map((item, i) => (
                  <div key={`${item.service}-${i}`} className="text-cyan-400 font-mono">
                    {item.service}: {item.url}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {!!d.dockerhub_info && (
        <div className="space-y-1">
          <div className="text-gray-500">Docker Hub 信息：</div>
          <div className="text-gray-300">{String((d.dockerhub_info as Record<string, unknown>)?.description || '-')}</div>
          <div className="text-xs text-gray-500">
            下载量：{String((d.dockerhub_info as Record<string, unknown>)?.pull_count ?? '-')} ·
            Stars：{String((d.dockerhub_info as Record<string, unknown>)?.star_count ?? '-')}
          </div>
        </div>
      )}

      {Array.isArray(d.page_info?.['docker_run_commands' as never]) &&
        (d.page_info as Record<string, unknown[]>)?.docker_run_commands?.length > 0 && (
          <div>
            <div className="text-gray-500 mb-1">发现 docker run 命令：</div>
            {((d.page_info as Record<string, unknown[]>)?.docker_run_commands as string[]).slice(0, 3).map((cmd, i) => (
              <pre key={i} className="code-block text-gray-300 text-xs mb-1">{cmd}</pre>
            ))}
          </div>
        )}
    </div>
  )
}
