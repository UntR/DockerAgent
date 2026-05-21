import { Outlet, NavLink } from 'react-router-dom'
import { useEffect } from 'react'
import {
  LayoutDashboard, Box, Image, Network, Database,
  MessageSquare, Rocket, RotateCcw, Zap, Settings, FolderOpen, Layers,
} from 'lucide-react'
import { cn } from '../lib/utils'
import { useDocker } from '../hooks/useDocker'
import { useDockerStore } from '../lib/store'

const appNavItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: '工作台' },
  { to: '/deploy', icon: Rocket, label: '安装应用', accent: true },
  { to: '/apps', icon: FolderOpen, label: '我的应用' },
  { to: '/rollback', icon: RotateCcw, label: '快照回滚' },
  { to: '/chat', icon: MessageSquare, label: 'AI 助手' },
]

const dockerNavItems = [
  { to: '/containers', icon: Box, label: '容器' },
  { to: '/images', icon: Image, label: '镜像' },
  { to: '/networks', icon: Network, label: '网络' },
  { to: '/volumes', icon: Database, label: '数据卷' },
]

const systemNavItems = [
  { to: '/settings', icon: Settings, label: '设置' },
]

export default function Layout() {
  const { refresh } = useDocker()
  const { containers, systemInfo } = useDockerStore()
  const runningCount = containers.filter((c) => c.status === 'running').length

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 15000)
    return () => clearInterval(id)
  }, [refresh])

  return (
    <div className="flex h-screen overflow-hidden bg-[#090a0d]">
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 flex flex-col bg-[#0d0f14] border-r border-white/[0.07]">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-white/[0.07]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-cyan-500/12 border border-cyan-400/20 flex items-center justify-center flex-shrink-0 text-cyan-300">
              <Zap size={18} className="text-white" />
            </div>
            <div>
              <div className="font-display font-semibold text-white text-sm leading-tight">DockerAgent</div>
              <div className="text-[10px] text-gray-500">AI Compose 应用管理器</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 overflow-y-auto">
          <NavSection label="应用" items={appNavItems} />
          <NavSection label="Docker 资源" items={dockerNavItems} icon={Layers} />
          <NavSection label="系统" items={systemNavItems} />
        </nav>

        {/* Footer stats */}
        <div className="p-4 border-t border-white/[0.07]">
          <div className="bg-[#13161d] rounded-lg border border-white/[0.06] p-3 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500">运行容器</span>
              <div className="flex items-center gap-1.5">
                <span className="status-dot running" />
                <span className="text-emerald-400 font-mono font-medium">{runningCount}</span>
              </div>
            </div>
            {systemInfo && (
              <>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Docker</span>
                  <span className="text-gray-300 font-mono">{systemInfo.docker_version}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">镜像</span>
                  <span className="text-gray-300 font-mono">{systemInfo.images}</span>
                </div>
              </>
            )}
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}

function NavSection({
  label,
  items,
  icon: SectionIcon,
}: {
  label: string
  items: Array<{ to: string; icon: typeof LayoutDashboard; label: string; accent?: boolean }>
  icon?: typeof LayoutDashboard
}) {
  return (
    <div className="mb-5 last:mb-0">
      <div className="mb-2 flex items-center gap-2 px-3 text-[10px] font-medium uppercase tracking-[0.14em] text-gray-600">
        {SectionIcon && <SectionIcon size={11} />}
        <span>{label}</span>
      </div>
      <div className="space-y-1">
        {items.map(({ to, icon: Icon, label: itemLabel, accent }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 border',
                isActive
                  ? accent
                    ? 'bg-cyan-500/12 text-cyan-300 border-cyan-400/20 shadow-[0_0_0_1px_rgba(34,211,238,0.04)]'
                    : 'bg-white/[0.07] text-white border-white/[0.08]'
                  : 'text-gray-400 border-transparent hover:text-gray-200 hover:bg-white/[0.04]'
              )
            }
          >
            <Icon size={16} />
            <span>{itemLabel}</span>
            {accent && (
              <span className="ml-auto w-1.5 h-1.5 rounded-full bg-cyan-300 animate-pulse" />
            )}
          </NavLink>
        ))}
      </div>
    </div>
  )
}
