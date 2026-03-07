import { useEffect, useState, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Box, Image, Network, Database, Cpu, Activity,
  HardDrive, MemoryStick, RefreshCw, ChevronDown,
  Layers, Package, FolderOpen, ExternalLink,
} from 'lucide-react'
import {
  RadialBarChart, RadialBar, ResponsiveContainer,
  AreaChart, Area, Tooltip, XAxis,
} from 'recharts'
import { useDockerStore } from '../lib/store'
import { dockerApi, HostStats } from '../lib/api'
import { formatBytes } from '../lib/utils'
import { cn } from '../lib/utils'
import { Container } from '../lib/store'

// ── Web 端口智能识别 ──────────────────────────────────────────

// 常见 web 端口优先级（越小越优先）
const WEB_PORT_PRIORITY: Record<number, number> = {
  80: 1, 443: 2, 8080: 3, 8443: 4,
  3000: 5, 8000: 6, 8888: 7, 5000: 8,
  4000: 9, 9000: 10, 1080: 11, 8008: 12,
  8090: 13, 7860: 14, 3001: 15, 8501: 16,
}

// 明确不是 web 的端口（数据库、消息队列等）
const NON_WEB_PORTS = new Set([
  5432, 3306, 1433, 27017, 6379, 5672, 15672,
  9092, 2181, 9200, 9300, 2379, 8300, 8301,
])

// "前端服务"类型的 compose service 名关键词（高优先级）
const FRONTEND_SERVICE_KEYWORDS = [
  'nginx', 'web', 'frontend', 'app', 'ui', 'portal',
  'proxy', 'gateway', 'dashboard', 'panel',
]

type PortBinding = { HostIp: string; HostPort: string }

function parseMappedPorts(ports: Record<string, unknown>): Array<{ container: number; host: number; proto: string }> {
  const result: Array<{ container: number; host: number; proto: string }> = []
  for (const [key, bindings] of Object.entries(ports)) {
    if (!bindings || !Array.isArray(bindings)) continue
    const match = key.match(/^(\d+)\/(tcp|udp)$/)
    if (!match) continue
    const containerPort = parseInt(match[1])
    const proto = match[2]
    for (const b of bindings as PortBinding[]) {
      const hostPort = parseInt(b.HostPort)
      if (hostPort > 0) result.push({ container: containerPort, host: hostPort, proto })
    }
  }
  return result
}

/** 从单个容器的 ports 中选出最佳 web 端口（host port），没有则返回 null */
function detectWebPort(ports: Record<string, unknown>): number | null {
  const mapped = parseMappedPorts(ports)
  if (mapped.length === 0) return null

  // 过滤掉明确不是 web 的端口
  const webCandidates = mapped.filter(
    (p) => p.proto === 'tcp' && !NON_WEB_PORTS.has(p.container) && !NON_WEB_PORTS.has(p.host)
  )
  if (webCandidates.length === 0) return null

  // 按优先级 + 端口号排序
  webCandidates.sort((a, b) => {
    const pa = WEB_PORT_PRIORITY[a.container] ?? WEB_PORT_PRIORITY[a.host] ?? 99
    const pb = WEB_PORT_PRIORITY[b.container] ?? WEB_PORT_PRIORITY[b.host] ?? 99
    if (pa !== pb) return pa - pb
    return a.host - b.host
  })
  return webCandidates[0].host
}

/** 从 compose 项目的所有容器中，选出最佳的 web 端口和来源容器名 */
function detectProjectWebPort(containers: Container[]): { port: number; service: string } | null {
  type Candidate = { port: number; priority: number; service: string }
  const candidates: Candidate[] = []

  for (const c of containers) {
    if (!c.ports) continue
    const service = c.labels?.['com.docker.compose.service'] || c.name
    const mapped = parseMappedPorts(c.ports as Record<string, unknown>)

    for (const p of mapped) {
      if (p.proto !== 'tcp') continue
      if (NON_WEB_PORTS.has(p.container) || NON_WEB_PORTS.has(p.host)) continue

      // 基础优先级
      let priority = WEB_PORT_PRIORITY[p.container] ?? WEB_PORT_PRIORITY[p.host] ?? 50

      // 服务名是前端类型 → 大幅提升优先级
      const isFrontend = FRONTEND_SERVICE_KEYWORDS.some((kw) =>
        service.toLowerCase().includes(kw)
      )
      if (isFrontend) priority = Math.max(1, priority - 20)

      candidates.push({ port: p.host, priority, service })
    }
  }

  if (candidates.length === 0) return null
  candidates.sort((a, b) => a.priority - b.priority || a.port - b.port)
  return { port: candidates[0].port, service: candidates[0].service }
}

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
}

// ── 圆形进度图 ──────────────────────────────────────────────
function GaugeChart({ value, color, size = 120 }: { value: number; color: string; size?: number }) {
  const data = [{ value, fill: color }, { value: 100 - value, fill: 'transparent' }]
  return (
    <ResponsiveContainer width={size} height={size}>
      <RadialBarChart
        cx="50%" cy="50%"
        innerRadius="68%" outerRadius="88%"
        startAngle={225} endAngle={-45}
        data={data}
        barSize={8}
      >
        <RadialBar dataKey="value" cornerRadius={4} background={{ fill: 'rgba(255,255,255,0.04)' }} />
      </RadialBarChart>
    </ResponsiveContainer>
  )
}

// ── 迷你折线区域图 ──────────────────────────────────────────
function SparkArea({ data, color }: { data: number[]; color: string }) {
  const chartData = data.map((v, i) => ({ i, v }))
  return (
    <ResponsiveContainer width="100%" height={40}>
      <AreaChart data={chartData} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={`sg-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.3} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="i" hide />
        <Tooltip
          content={({ active, payload }) =>
            active && payload?.[0] ? (
              <div className="bg-[#1c1f2a] border border-white/10 rounded-lg px-2 py-1 text-[10px] text-white">
                {Number(payload[0].value).toFixed(1)}%
              </div>
            ) : null
          }
        />
        <Area
          type="monotone" dataKey="v" stroke={color} strokeWidth={1.5}
          fill={`url(#sg-${color.replace('#', '')})`}
          dot={false} isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

// ── 进度条 ──────────────────────────────────────────────
function ProgressBar({ percent, color }: { percent: number; color: string }) {
  return (
    <div className="h-1.5 w-full bg-white/[0.06] rounded-full overflow-hidden">
      <motion.div
        className="h-full rounded-full"
        style={{ background: color }}
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(percent, 100)}%` }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
      />
    </div>
  )
}

const MAX_HISTORY = 30

export default function DashboardPage() {
  const { containers, images, networks, volumes, systemInfo } = useDockerStore()
  const running = containers.filter((c) => c.status === 'running')

  // ── 按 Compose 项目分组 ──────────────────────────────
  const { projects, standalone } = useMemo(() => {
    const projectMap: Record<string, Container[]> = {}
    const alone: Container[] = []
    for (const c of containers) {
      const proj = c.labels?.['com.docker.compose.project']
      if (proj) {
        projectMap[proj] = [...(projectMap[proj] ?? []), c]
      } else {
        alone.push(c)
      }
    }
    // 按运行中数量倒序排列项目
    const sorted = Object.entries(projectMap).sort(
      ([, a], [, b]) =>
        b.filter((x) => x.status === 'running').length -
        a.filter((x) => x.status === 'running').length
    )
    return { projects: sorted, standalone: alone }
  }, [containers])

  const [hostStats, setHostStats] = useState<HostStats | null>(null)
  const [cpuHistory, setCpuHistory] = useState<number[]>(Array(MAX_HISTORY).fill(0))
  const [memHistory, setMemHistory] = useState<number[]>(Array(MAX_HISTORY).fill(0))
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [showAllDisks, setShowAllDisks] = useState(false)

  const fetchStats = useCallback(async (all = showAllDisks) => {
    try {
      const stats = await dockerApi.getHostStats(all)
      setHostStats(stats)
      setLastUpdated(new Date())
      setCpuHistory((h) => [...h.slice(-(MAX_HISTORY - 1)), stats.cpu_percent])
      setMemHistory((h) => [...h.slice(-(MAX_HISTORY - 1)), stats.memory_percent])
    } catch {
      // silent fail - backend might not have psutil yet
    }
  }, [])

  const manualRefresh = async () => {
    setRefreshing(true)
    await fetchStats(showAllDisks)
    setRefreshing(false)
  }

  const toggleAllDisks = async () => {
    const next = !showAllDisks
    setShowAllDisks(next)
    await fetchStats(next)
  }

  useEffect(() => {
    fetchStats(showAllDisks)
    const t = setInterval(() => fetchStats(showAllDisks), 5000)
    return () => clearInterval(t)
  }, [fetchStats, showAllDisks])

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <motion.div {...fadeUp} transition={{ duration: 0.4 }} className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-white">仪表盘</h1>
          <p className="text-gray-500 text-sm mt-1">系统总览 · 实时状态</p>
        </div>
        <button
          onClick={manualRefresh}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-gray-400 hover:text-white text-xs transition-colors"
        >
          <RefreshCw size={12} className={cn(refreshing && 'animate-spin')} />
          {lastUpdated ? `${lastUpdated.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : '刷新'}
        </button>
      </motion.div>

      {/* Docker Stats Cards */}
      <motion.div
        className="grid grid-cols-2 lg:grid-cols-4 gap-4"
        initial="initial" animate="animate"
        variants={{ animate: { transition: { staggerChildren: 0.07 } } }}
      >
        {[
          {
            icon: Box, label: '容器总数', value: containers.length,
            sub: `${running.length} 运行中`, color: 'from-cyan-500/20 to-cyan-500/5',
            iconColor: 'text-cyan-400', border: 'border-cyan-500/15',
          },
          {
            icon: Image, label: '镜像', value: images.length,
            sub: systemInfo ? formatBytes(images.reduce((s, i) => s + i.size, 0)) : '-',
            color: 'from-blue-500/20 to-blue-500/5',
            iconColor: 'text-blue-400', border: 'border-blue-500/15',
          },
          {
            icon: Network, label: '网络', value: networks.length,
            sub: `${networks.filter((n) => n.driver === 'bridge').length} bridge`,
            color: 'from-purple-500/20 to-purple-500/5',
            iconColor: 'text-purple-400', border: 'border-purple-500/15',
          },
          {
            icon: Database, label: '数据卷', value: volumes.length,
            sub: 'local driver',
            color: 'from-emerald-500/20 to-emerald-500/5',
            iconColor: 'text-emerald-400', border: 'border-emerald-500/15',
          },
        ].map(({ icon: Icon, label, value, sub, color, iconColor, border }) => (
          <motion.div key={label} variants={fadeUp}
            className={`relative rounded-2xl bg-gradient-to-br ${color} border ${border} p-5 overflow-hidden`}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-gray-500 font-medium">{label}</p>
                <p className="text-3xl font-display font-bold text-white mt-1">{value}</p>
                <p className={`text-xs mt-1 ${iconColor}`}>{sub}</p>
              </div>
              <div className={`p-2.5 rounded-xl bg-white/[0.05] ${iconColor}`}>
                <Icon size={20} />
              </div>
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* ── 主机实时状态 ── */}
      {hostStats && (
        <motion.div {...fadeUp} transition={{ duration: 0.4, delay: 0.1 }}>
          <div className="flex items-center gap-2 mb-4">
            <Activity size={15} className="text-orange-400" />
            <h3 className="text-sm font-semibold text-white">主机实时资源</h3>
            <span className="text-[10px] text-gray-600 ml-auto">每 5 秒自动刷新</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

            {/* CPU */}
            <div className="rounded-2xl bg-[#0f1117] border border-white/[0.06] p-5">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Cpu size={14} className="text-cyan-400" />
                  <span className="text-xs font-medium text-gray-300">CPU</span>
                </div>
                <span className="text-xs text-gray-600">{hostStats.cpu_count} 核</span>
              </div>
              <div className="flex items-center gap-4">
                <div className="relative flex-shrink-0">
                  <GaugeChart value={hostStats.cpu_percent} color="#22d3ee" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-lg font-bold text-white">{hostStats.cpu_percent.toFixed(0)}<span className="text-xs text-gray-500">%</span></span>
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <SparkArea data={cpuHistory} color="#22d3ee" />
                  <p className="text-[10px] text-gray-600 mt-1 text-center">30 秒趋势</p>
                </div>
              </div>
              <ProgressBar percent={hostStats.cpu_percent} color="#22d3ee" />
            </div>

            {/* Memory */}
            <div className="rounded-2xl bg-[#0f1117] border border-white/[0.06] p-5">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <MemoryStick size={14} className="text-violet-400" />
                  <span className="text-xs font-medium text-gray-300">内存</span>
                </div>
                <span className="text-xs text-gray-600">{formatBytes(hostStats.memory_total)}</span>
              </div>
              <div className="flex items-center gap-4">
                <div className="relative flex-shrink-0">
                  <GaugeChart value={hostStats.memory_percent} color="#a78bfa" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-lg font-bold text-white">{hostStats.memory_percent.toFixed(0)}<span className="text-xs text-gray-500">%</span></span>
                  </div>
                </div>
                <div className="flex-1 min-w-0 space-y-2">
                  <SparkArea data={memHistory} color="#a78bfa" />
                  <div className="space-y-1 text-[11px]">
                    <div className="flex justify-between text-gray-500">
                      <span>已用</span><span className="text-violet-300">{formatBytes(hostStats.memory_used)}</span>
                    </div>
                    <div className="flex justify-between text-gray-500">
                      <span>可用</span><span className="text-gray-300">{formatBytes(hostStats.memory_available)}</span>
                    </div>
                  </div>
                </div>
              </div>
              <ProgressBar percent={hostStats.memory_percent} color="#a78bfa" />
            </div>

            {/* Disk */}
            <div className="rounded-2xl bg-[#0f1117] border border-white/[0.06] p-5">
              <div className="flex items-center gap-2 mb-3">
                <HardDrive size={14} className="text-emerald-400" />
                <span className="text-xs font-medium text-gray-300">磁盘</span>
                <button
                  onClick={toggleAllDisks}
                  title={showAllDisks ? '隐藏 snap/虚拟设备' : '显示全部挂载点'}
                  className={cn(
                    'ml-auto flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium border transition-all',
                    showAllDisks
                      ? 'bg-orange-500/15 border-orange-500/25 text-orange-400'
                      : 'bg-white/[0.04] border-white/[0.06] text-gray-500 hover:text-gray-300'
                  )}
                >
                  {showAllDisks ? '显示全部' : '仅实体盘'}
                </button>
              </div>
              <div className="space-y-3 max-h-[130px] overflow-y-auto pr-1">
                {hostStats.disks.map((disk) => {
                  const pct = disk.percent
                  const diskColor = pct > 90 ? '#f87171' : pct > 70 ? '#fb923c' : '#34d399'
                  return (
                    <div key={disk.mountpoint}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px] font-mono text-gray-400 truncate max-w-[120px]">{disk.mountpoint}</span>
                        <span className="text-[11px] font-bold" style={{ color: diskColor }}>{pct.toFixed(0)}%</span>
                      </div>
                      <ProgressBar percent={pct} color={diskColor} />
                      <div className="flex justify-between mt-0.5 text-[10px] text-gray-600">
                        <span>{formatBytes(disk.used)} / {formatBytes(disk.total)}</span>
                        <span>{formatBytes(disk.free)} 空闲</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* System Info + Container Distribution */}
      {systemInfo && (
        <motion.div {...fadeUp} transition={{ duration: 0.4, delay: 0.2 }} className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-2xl bg-[#0f1117] border border-white/[0.06] p-5">
            <div className="flex items-center gap-2 mb-4">
              <Cpu size={16} className="text-cyan-400" />
              <h3 className="text-sm font-semibold text-white">Docker 环境</h3>
            </div>
            <div className="space-y-3">
              {[
                { label: 'Docker 版本', value: systemInfo.docker_version },
                { label: '操作系统', value: systemInfo.os },
                { label: '架构', value: systemInfo.architecture },
                { label: 'CPU 核心', value: `${systemInfo.cpus} 核` },
                { label: '总内存', value: formatBytes(systemInfo.total_memory) },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">{label}</span>
                  <span className="text-xs font-mono text-gray-200">{value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl bg-[#0f1117] border border-white/[0.06] p-5">
            <div className="flex items-center gap-2 mb-4">
              <Activity size={16} className="text-emerald-400" />
              <h3 className="text-sm font-semibold text-white">容器状态分布</h3>
            </div>
            <div className="space-y-3">
              {[
                { label: '运行中', count: systemInfo.containers_running, color: '#34d399', bg: 'bg-emerald-500', text: 'text-emerald-400' },
                { label: '已停止', count: systemInfo.containers_stopped, color: '#6b7280', bg: 'bg-gray-600', text: 'text-gray-400' },
                { label: '已暂停', count: systemInfo.containers_paused, color: '#fbbf24', bg: 'bg-yellow-500', text: 'text-yellow-400' },
              ].map(({ label, count, color, text }) => (
                <div key={label}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-500">{label}</span>
                    <span className={`text-xs font-mono font-medium ${text}`}>{count}</span>
                  </div>
                  <ProgressBar
                    percent={systemInfo.containers > 0 ? (count / systemInfo.containers) * 100 : 0}
                    color={color}
                  />
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      )}

      {/* ── 容器项目视图 ── */}
      {containers.length > 0 && (
        <motion.div {...fadeUp} transition={{ duration: 0.4, delay: 0.3 }}>
          <div className="flex items-center gap-2 mb-4">
            <Layers size={15} className="text-cyan-400" />
            <h3 className="text-sm font-semibold text-white">容器 / 项目</h3>
            <span className="text-[10px] text-gray-600 ml-1">
              {projects.length} 个 Compose 项目 · {standalone.length} 个独立容器
            </span>
          </div>
          <div className="space-y-2">
            {/* Compose 项目组 */}
            {projects.map(([name, members]) => (
              <ComposeProjectCard key={name} name={name} containers={members} />
            ))}
            {/* 独立容器 */}
            {standalone.length > 0 && (
              <div className="rounded-2xl border border-white/[0.06] overflow-hidden">
                <div className="px-4 py-2.5 bg-white/[0.02] border-b border-white/[0.04] flex items-center gap-2">
                  <Package size={13} className="text-gray-500" />
                  <span className="text-xs font-medium text-gray-400">独立容器</span>
                  <span className="ml-auto text-[10px] text-gray-600">
                    {standalone.filter(c => c.status === 'running').length} / {standalone.length} 运行中
                  </span>
                </div>
                <div className="divide-y divide-white/[0.03]">
                  {standalone.map((c) => (
                    <ContainerRow key={c.id} container={c} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </div>
  )
}

// ── Compose 项目卡片 ──────────────────────────────────────────
function ComposeProjectCard({ name, containers }: { name: string; containers: Container[] }) {
  const [open, setOpen] = useState(true)
  const runCount = containers.filter((c) => c.status === 'running').length
  const total = containers.length
  const allRunning = runCount === total
  const allStopped = runCount === 0
  const workingDir = containers[0]?.labels?.['com.docker.compose.project.working_dir'] ?? ''

  const statusColor = allRunning
    ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
    : allStopped
    ? 'text-gray-500 bg-white/[0.03] border-white/[0.06]'
    : 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20'

  const dotColor = allRunning ? 'bg-emerald-400' : allStopped ? 'bg-gray-600' : 'bg-yellow-400'

  // 检测项目的主 web 端口（只在有容器运行时显示）
  const runningContainers = containers.filter((c) => c.status === 'running')
  const webInfo = runningContainers.length > 0
    ? detectProjectWebPort(runningContainers)
    : null

  return (
    <div className={cn(
      'rounded-2xl border overflow-hidden transition-colors',
      allRunning ? 'border-emerald-500/15 bg-emerald-500/[0.02]'
      : allStopped ? 'border-white/[0.06] bg-[#0f1117]'
      : 'border-yellow-500/15 bg-yellow-500/[0.02]'
    )}>
      {/* 项目头部 */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* 展开按钮 */}
        <button
          className="flex-shrink-0 hover:bg-white/[0.04] rounded-md p-0.5 transition-colors"
          onClick={() => setOpen((v) => !v)}
        >
          <ChevronDown
            size={14}
            className={cn('text-gray-500 transition-transform duration-200', open && 'rotate-180')}
          />
        </button>

        {/* 项目图标 */}
        <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 border', statusColor)}>
          <FolderOpen size={13} />
        </div>

        {/* 项目名称（可点击展开/折叠） */}
        <button
          className="flex-1 min-w-0 text-left hover:opacity-80 transition-opacity"
          onClick={() => setOpen((v) => !v)}
        >
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-white truncate">{name}</span>
            <span className="text-[10px] text-gray-600 font-mono hidden sm:block truncate max-w-[200px]">{workingDir}</span>
          </div>
          {!open && (
            <p className="text-[10px] text-gray-500 mt-0.5 truncate">
              {containers.map(c => c.labels?.['com.docker.compose.service'] || c.name).join(' · ')}
            </p>
          )}
        </button>

        {/* 右侧操作区 */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* 一键打开 Web */}
          {webInfo && (
            <a
              href={`http://localhost:${webInfo.port}`}
              target="_blank"
              rel="noopener noreferrer"
              title={`打开 ${webInfo.service} (localhost:${webInfo.port})`}
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 hover:bg-cyan-500/20 hover:border-cyan-500/30 transition-all text-[11px] font-medium"
            >
              <ExternalLink size={11} />
              <span>:{webInfo.port}</span>
            </a>
          )}

          {/* 状态徽章 */}
          <div className="flex items-center gap-1.5">
            <span className={cn('w-1.5 h-1.5 rounded-full', dotColor, allRunning && 'animate-pulse')} />
            <span className="text-xs font-mono text-gray-400">{runCount}<span className="text-gray-600">/{total}</span></span>
          </div>
          <span className={cn(
            'text-[10px] px-2 py-0.5 rounded-full border font-medium',
            statusColor
          )}>
            {allRunning ? '全部运行' : allStopped ? '全部停止' : '部分运行'}
          </span>
        </div>
      </div>

      {/* 展开的服务列表 */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="border-t border-white/[0.04] divide-y divide-white/[0.03]">
              {containers.map((c, idx) => (
                <ContainerRow
                  key={c.id}
                  container={c}
                  isLast={idx === containers.length - 1}
                  indent
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── 单个容器行 ──────────────────────────────────────────────
function ContainerRow({
  container: c, indent = false, isLast = false,
}: {
  container: Container
  indent?: boolean
  isLast?: boolean
}) {
  const isRunning = c.status === 'running'
  const service = c.labels?.['com.docker.compose.service']
  const displayName = service || c.name

  // 端口摘要（原始展示）
  const mapped = parseMappedPorts((c.ports ?? {}) as Record<string, unknown>)
  const portSummary = mapped.slice(0, 3).map((p) => `${p.host}→${p.container}`).join(' ')

  // 检测 web 端口（只在运行时显示）
  const webPort = isRunning && c.ports
    ? detectWebPort(c.ports as Record<string, unknown>)
    : null

  return (
    <div className={cn(
      'flex items-center gap-3 py-2.5 pr-4 transition-colors hover:bg-white/[0.02] group',
      indent ? 'pl-[52px]' : 'px-4',
    )}>
      {/* 树状连线 + 状态点 */}
      {indent && (
        <div className="flex items-center gap-2 flex-shrink-0 -ml-4">
          <div className="flex flex-col items-center">
            <div className={cn('w-px h-3 bg-white/[0.08]', isLast && 'invisible')} />
            <div className="w-3 h-px bg-white/[0.08]" />
          </div>
          <span className={cn(
            'w-1.5 h-1.5 rounded-full flex-shrink-0',
            isRunning ? 'bg-emerald-400 animate-pulse' : 'bg-gray-600'
          )} />
        </div>
      )}
      {!indent && (
        <span className={cn(
          'w-1.5 h-1.5 rounded-full flex-shrink-0',
          isRunning ? 'bg-emerald-400 animate-pulse' : 'bg-gray-600'
        )} />
      )}

      {/* 服务/容器名 */}
      <span className="text-sm font-mono text-white flex-shrink-0 min-w-[100px] truncate">
        {displayName}
      </span>

      {/* 镜像 */}
      <span className="text-xs text-gray-500 flex-1 truncate hidden sm:block">{c.image}</span>

      {/* 端口摘要（非 web 端口原始展示） */}
      {portSummary && !webPort && (
        <span className="text-[10px] font-mono text-gray-600 hidden lg:block flex-shrink-0 truncate max-w-[140px]">
          {portSummary}
        </span>
      )}

      {/* 一键打开 web 端口 */}
      {webPort && (
        <a
          href={`http://localhost:${webPort}`}
          target="_blank"
          rel="noopener noreferrer"
          title={`打开 localhost:${webPort}`}
          className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-cyan-500/8 border border-cyan-500/15 text-cyan-400/80 hover:bg-cyan-500/15 hover:text-cyan-300 hover:border-cyan-500/25 transition-all text-[10px] font-mono flex-shrink-0"
        >
          <ExternalLink size={9} />
          {webPort}
        </a>
      )}

      {/* 描述 */}
      {c.description && (
        <span className="text-[10px] text-gray-600 hidden xl:block flex-shrink-0 truncate max-w-[160px]">
          {c.description}
        </span>
      )}

      {/* 状态 */}
      <span className={cn(
        'text-[10px] font-medium flex-shrink-0 px-2 py-0.5 rounded-full border',
        isRunning
          ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
          : 'text-gray-500 bg-white/[0.03] border-white/[0.06]'
      )}>
        {isRunning ? '运行中' : c.status}
      </span>
    </div>
  )
}
