import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  AlertTriangle, ArrowRight, Box, CheckCircle2, Clock, Database,
  ExternalLink, FileText, FolderOpen, Image, Network, RefreshCw,
  Rocket, RotateCcw, Search, ShieldAlert, Sparkles, Terminal,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { appsApi, ManagedApp } from '../lib/api'
import { useDockerStore, Container } from '../lib/store'
import { cn, formatDate } from '../lib/utils'

const quickInstalls = [
  { label: 'Open WebUI', source: 'open-webui/open-webui', desc: 'Ollama 对话界面' },
  { label: 'n8n', source: 'https://github.com/n8n-io/n8n', desc: '自动化工作流' },
  { label: 'Gitea', source: 'gitea/gitea', desc: '自托管 Git 服务' },
  { label: 'Uptime Kuma', source: 'louislam/uptime-kuma', desc: '服务状态监控' },
]

const deploySteps = [
  { icon: Search, title: '识别项目', desc: 'README / Compose / Env' },
  { icon: FileText, title: '补齐配置', desc: '端口、密钥、卷路径' },
  { icon: ShieldAlert, title: '预检确认', desc: '风险项和写入文件' },
  { icon: Rocket, title: '部署登记', desc: '访问地址和回滚入口' },
]

const fadeUp = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const { containers, images, networks, volumes, systemInfo } = useDockerStore()
  const [apps, setApps] = useState<ManagedApp[]>([])
  const [loadingApps, setLoadingApps] = useState(false)
  const [command, setCommand] = useState('')

  const loadApps = async () => {
    setLoadingApps(true)
    try {
      setApps(await appsApi.listApps())
    } catch (e: unknown) {
      toast.error(`加载应用失败: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setLoadingApps(false)
    }
  }

  useEffect(() => { loadApps() }, [])

  const composeProjects = useMemo(() => groupComposeProjects(containers), [containers])
  const runningContainers = containers.filter((c) => c.status === 'running')
  const recentApps = [...apps]
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 4)

  const inactiveComposeContainers = containers.filter(
    (c) => c.labels?.['com.docker.compose.project'] && c.status !== 'running',
  )
  const registeredProjects = new Set(apps.map((app) => app.compose_project))
  const unregisteredProjects = composeProjects.filter((project) => !registeredProjects.has(project.name))
  const snapshotCount = apps.reduce((total, app) => total + (app.snapshots?.length ?? 0), 0)

  const riskItems = buildRiskItems({
    hasDockerInfo: !!systemInfo,
    appCount: apps.length,
    inactiveComposeContainers,
    unregisteredProjects,
  })

  const startInstall = (value = command) => {
    const source = value.trim()
    if (source) {
      navigate('/deploy', { state: { source } })
      return
    }
    navigate('/deploy')
  }

  return (
    <div className="min-h-screen bg-[#090a0d] px-8 py-7 text-gray-200">
      <motion.div
        initial="initial"
        animate="animate"
        variants={{ animate: { transition: { staggerChildren: 0.06 } } }}
        className="mx-auto max-w-7xl space-y-6"
      >
        <motion.div variants={fadeUp} className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-semibold text-white">应用工作台</h1>
            <p className="mt-1 text-sm text-gray-500">从安装、预检、部署到回滚，围绕 Compose 应用闭环管理。</p>
          </div>
          <button
            onClick={loadApps}
            disabled={loadingApps}
            className="inline-flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-gray-300 transition-colors hover:bg-white/[0.08] disabled:opacity-50"
          >
            <RefreshCw size={14} className={cn(loadingApps && 'animate-spin')} />
            刷新应用
          </button>
        </motion.div>

        <motion.section
          variants={fadeUp}
          className="overflow-hidden rounded-xl border border-cyan-400/15 bg-[#0f1218]"
        >
          <div className="grid gap-0 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="border-b border-white/[0.06] p-6 lg:border-b-0 lg:border-r">
              <div className="mb-5 flex items-center gap-2 text-sm font-medium text-cyan-300">
                <Sparkles size={16} />
                安装入口
              </div>
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <Terminal size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600" />
                  <input
                    value={command}
                    onChange={(e) => setCommand(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && startInstall()}
                    placeholder="粘贴 GitHub repo、Compose 路径、镜像名，或输入一句需求"
                    className="h-12 w-full rounded-lg border border-white/[0.08] bg-[#090b10] pl-11 pr-4 text-sm text-gray-100 outline-none transition-colors placeholder:text-gray-600 focus:border-cyan-400/40"
                  />
                </div>
                <button
                  onClick={() => startInstall()}
                  className="inline-flex h-12 items-center gap-2 rounded-lg bg-cyan-400 px-5 text-sm font-semibold text-[#071016] transition-transform hover:scale-[1.01] active:scale-[0.99]"
                >
                  开始安装
                  <ArrowRight size={15} />
                </button>
              </div>

              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                {quickInstalls.map((item) => (
                  <button
                    key={item.source}
                    onClick={() => startInstall(item.source)}
                    className="group flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-3 text-left transition-colors hover:border-cyan-400/25 hover:bg-cyan-400/[0.04]"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-400/10 text-cyan-300">
                      <Rocket size={15} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-white">{item.label}</div>
                      <div className="truncate text-xs text-gray-500">{item.desc}</div>
                    </div>
                    <ArrowRight size={13} className="ml-auto text-gray-600 transition-colors group-hover:text-cyan-300" />
                  </button>
                ))}
              </div>
            </div>

            <div className="p-6">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-white">部署路径</div>
                  <div className="mt-1 text-xs text-gray-500">每一步都应该可检查、可确认、可回滚。</div>
                </div>
                <Link
                  to="/chat"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs text-gray-300 transition-colors hover:bg-white/[0.08]"
                >
                  AI 助手
                  <ArrowRight size={12} />
                </Link>
              </div>
              <div className="space-y-3">
                {deploySteps.map((step, index) => (
                  <FlowStep key={step.title} index={index + 1} {...step} />
                ))}
              </div>
            </div>
          </div>
        </motion.section>

        <motion.div variants={fadeUp} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={FolderOpen} label="已登记应用" value={apps.length} sub={`${recentApps.length} 个最近更新`} tone="cyan" />
          <StatCard icon={Box} label="运行容器" value={runningContainers.length} sub={`${containers.length} 个容器总数`} tone="emerald" />
          <StatCard icon={Rocket} label="Compose 项目" value={composeProjects.length} sub={`${unregisteredProjects.length} 个未登记`} tone="blue" />
          <StatCard icon={RotateCcw} label="关联快照" value={snapshotCount} sub="应用级回滚入口" tone="amber" />
        </motion.div>

        <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
          <motion.section variants={fadeUp} className="rounded-xl border border-white/[0.07] bg-[#0f1218]">
            <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold text-white">最近应用</h2>
                <p className="mt-1 text-xs text-gray-500">优先回到可访问地址、日志和快照。</p>
              </div>
              <Link
                to="/apps"
                className="inline-flex items-center gap-1.5 rounded-lg bg-white/[0.04] px-3 py-1.5 text-xs text-gray-300 transition-colors hover:bg-white/[0.08]"
              >
                查看全部
                <ArrowRight size={12} />
              </Link>
            </div>
            {recentApps.length > 0 ? (
              <div className="divide-y divide-white/[0.05]">
                {recentApps.map((app) => (
                  <AppRow key={app.id} app={app} />
                ))}
              </div>
            ) : (
              <div className="px-5 py-12 text-center text-sm text-gray-500">
                暂无应用。先从上方安装入口添加第一个 Compose 应用。
              </div>
            )}
          </motion.section>

          <motion.aside variants={fadeUp} className="space-y-6">
            <section className="rounded-xl border border-white/[0.07] bg-[#0f1218]">
              <div className="border-b border-white/[0.06] px-5 py-4">
                <h2 className="text-sm font-semibold text-white">待处理</h2>
                <p className="mt-1 text-xs text-gray-500">只显示会影响安装和应用管理的状态。</p>
              </div>
              <div className="space-y-2 p-4">
                {riskItems.map((item) => (
                  <RiskItem key={item.title} {...item} />
                ))}
              </div>
            </section>

            <section className="rounded-xl border border-white/[0.07] bg-[#0f1218] p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white">Docker 资源摘要</h2>
                <Link to="/containers" className="text-xs text-cyan-300 hover:text-cyan-200">排障</Link>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <ResourceTile icon={Box} label="容器" value={containers.length} />
                <ResourceTile icon={Image} label="镜像" value={images.length} />
                <ResourceTile icon={Network} label="网络" value={networks.length} />
                <ResourceTile icon={Database} label="数据卷" value={volumes.length} />
              </div>
              {systemInfo && (
                <div className="mt-4 rounded-lg bg-white/[0.03] px-3 py-2 text-xs text-gray-500">
                  Docker {systemInfo.docker_version} · {systemInfo.os}
                </div>
              )}
            </section>
          </motion.aside>
        </div>
      </motion.div>
    </div>
  )
}

function groupComposeProjects(containers: Container[]) {
  const projects = new Map<string, { name: string; running: number; total: number }>()
  for (const container of containers) {
    const name = container.labels?.['com.docker.compose.project']
    if (!name) continue
    const current = projects.get(name) ?? { name, running: 0, total: 0 }
    current.total += 1
    if (container.status === 'running') current.running += 1
    projects.set(name, current)
  }
  return [...projects.values()].sort((a, b) => b.running - a.running || a.name.localeCompare(b.name))
}

function buildRiskItems({
  hasDockerInfo,
  appCount,
  inactiveComposeContainers,
  unregisteredProjects,
}: {
  hasDockerInfo: boolean
  appCount: number
  inactiveComposeContainers: Container[]
  unregisteredProjects: Array<{ name: string }>
}) {
  if (!hasDockerInfo) {
    return [{ title: 'Docker 状态不可用', desc: '后端暂未返回 Docker 环境信息。', level: 'danger' as const }]
  }
  const items: Array<{ title: string; desc: string; level: 'ok' | 'info' | 'warning' | 'danger' }> = []
  if (inactiveComposeContainers.length > 0) {
    items.push({
      title: `${inactiveComposeContainers.length} 个 Compose 容器未运行`,
      desc: '进入应用详情或容器页查看日志后再处理。',
      level: 'warning',
    })
  }
  if (unregisteredProjects.length > 0) {
    items.push({
      title: `${unregisteredProjects.length} 个 Compose 项目未登记`,
      desc: '这些项目来自 Docker 标签，但还没有应用详情页。',
      level: 'info',
    })
  }
  if (appCount === 0) {
    items.push({
      title: '还没有应用记录',
      desc: '完成一次智能部署后会自动进入应用列表。',
      level: 'info',
    })
  }
  return items.length > 0
    ? items
    : [{ title: '应用状态正常', desc: '当前没有需要优先处理的应用风险。', level: 'ok' as const }]
}

function FlowStep({
  icon: Icon,
  index,
  title,
  desc,
}: {
  icon: typeof Search
  index: number
  title: string
  desc: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-3">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-400/10 text-cyan-300">
        <Icon size={15} />
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-gray-600">0{index}</span>
          <span className="text-sm font-medium text-white">{title}</span>
        </div>
        <div className="mt-0.5 truncate text-xs text-gray-500">{desc}</div>
      </div>
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: typeof FolderOpen
  label: string
  value: number
  sub: string
  tone: 'cyan' | 'emerald' | 'blue' | 'amber'
}) {
  const toneClass = {
    cyan: 'text-cyan-300 bg-cyan-400/10 border-cyan-400/15',
    emerald: 'text-emerald-300 bg-emerald-400/10 border-emerald-400/15',
    blue: 'text-blue-300 bg-blue-400/10 border-blue-400/15',
    amber: 'text-amber-300 bg-amber-400/10 border-amber-400/15',
  }[tone]

  return (
    <div className="rounded-xl border border-white/[0.07] bg-[#0f1218] p-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs text-gray-500">{label}</div>
          <div className="mt-1 font-display text-3xl font-semibold text-white">{value}</div>
          <div className="mt-1 text-xs text-gray-500">{sub}</div>
        </div>
        <div className={cn('rounded-lg border p-2', toneClass)}>
          <Icon size={18} />
        </div>
      </div>
    </div>
  )
}

function AppRow({ app }: { app: ManagedApp }) {
  const firstUrl = app.access_urls[0]
  const status = app.status?.toLowerCase() || 'unknown'
  const running = status === 'running' || status === 'active'

  return (
    <div className="grid gap-3 px-5 py-4 transition-colors hover:bg-white/[0.025] md:grid-cols-[1fr_auto]">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className={cn('h-2 w-2 rounded-full', running ? 'bg-emerald-400' : 'bg-gray-600')} />
          <Link to={`/apps/${app.id}`} className="truncate text-sm font-semibold text-white hover:text-cyan-200">
            {app.name}
          </Link>
          <span className={cn(
            'rounded-full border px-2 py-0.5 text-[10px]',
            running
              ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300'
              : 'border-white/[0.08] bg-white/[0.04] text-gray-400',
          )}>
            {app.status}
          </span>
        </div>
        <div className="mt-1 truncate text-xs font-mono text-gray-500">
          {app.compose_project} · {app.work_dir}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-500">
          <span className="inline-flex items-center gap-1">
            <Clock size={11} />
            {formatDate(app.updated_at)}
          </span>
          {app.snapshots && app.snapshots.length > 0 && (
            <span className="inline-flex items-center gap-1">
              <RotateCcw size={11} />
              {app.snapshots.length} 个快照
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 md:justify-end">
        {firstUrl && (
          <a
            href={firstUrl.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/20 bg-cyan-400/10 px-3 py-1.5 text-xs font-mono text-cyan-300 transition-colors hover:bg-cyan-400/15"
          >
            <ExternalLink size={11} />
            {firstUrl.service}
          </a>
        )}
        <Link
          to={`/rollback?compose_project=${encodeURIComponent(app.compose_project)}`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/18 bg-amber-400/10 px-3 py-1.5 text-xs text-amber-300 transition-colors hover:bg-amber-400/15"
        >
          <RotateCcw size={11} />
          回滚
        </Link>
        <Link
          to={`/apps/${app.id}`}
          className="inline-flex items-center gap-1.5 rounded-lg bg-white/[0.05] px-3 py-1.5 text-xs text-gray-300 transition-colors hover:bg-white/[0.09]"
        >
          详情
          <ArrowRight size={11} />
        </Link>
      </div>
    </div>
  )
}

function RiskItem({
  title,
  desc,
  level,
}: {
  title: string
  desc: string
  level: 'ok' | 'info' | 'warning' | 'danger'
}) {
  const config = {
    ok: { icon: CheckCircle2, className: 'text-emerald-300 bg-emerald-400/10 border-emerald-400/15' },
    info: { icon: Sparkles, className: 'text-cyan-300 bg-cyan-400/10 border-cyan-400/15' },
    warning: { icon: AlertTriangle, className: 'text-amber-300 bg-amber-400/10 border-amber-400/15' },
    danger: { icon: ShieldAlert, className: 'text-red-300 bg-red-400/10 border-red-400/15' },
  }[level]
  const Icon = config.icon

  return (
    <div className={cn('rounded-lg border px-3 py-3', config.className)}>
      <div className="flex items-start gap-2">
        <Icon size={15} className="mt-0.5 flex-shrink-0" />
        <div className="min-w-0">
          <div className="text-sm font-medium text-white">{title}</div>
          <div className="mt-1 text-xs leading-relaxed text-current opacity-75">{desc}</div>
        </div>
      </div>
    </div>
  )
}

function ResourceTile({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Box
  label: string
  value: number
}) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
      <div className="mb-3 flex items-center justify-between text-gray-500">
        <span className="text-xs">{label}</span>
        <Icon size={14} />
      </div>
      <div className="font-display text-2xl font-semibold text-white">{value}</div>
    </div>
  )
}
