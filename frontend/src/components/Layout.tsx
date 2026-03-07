import { Outlet, NavLink, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import {
  LayoutDashboard, Box, Image, Network, Database,
  MessageSquare, Rocket, RotateCcw, Zap, Settings,
} from 'lucide-react'
import { cn } from '../lib/utils'
import { useDocker } from '../hooks/useDocker'
import { useDockerStore } from '../lib/store'

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: '仪表盘' },
  { to: '/containers', icon: Box, label: '容器' },
  { to: '/images', icon: Image, label: '镜像' },
  { to: '/networks', icon: Network, label: '网络' },
  { to: '/volumes', icon: Database, label: '数据卷' },
  { to: '/chat', icon: MessageSquare, label: 'AI 助手', accent: true },
  { to: '/deploy', icon: Rocket, label: '智能部署' },
  { to: '/rollback', icon: RotateCcw, label: '回滚' },
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
    <div className="flex h-screen overflow-hidden bg-[#0a0b0f]">
      {/* Sidebar */}
      <aside className="w-60 flex-shrink-0 flex flex-col bg-[#0f1117] border-r border-white/[0.06]">
        {/* Logo */}
        <div className="px-5 py-6 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center flex-shrink-0">
              <Zap size={18} className="text-white" />
            </div>
            <div>
              <div className="font-display font-semibold text-white text-sm leading-tight">DockerAgent</div>
              <div className="text-[10px] text-gray-500 font-mono">AI Docker 管理平台</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {navItems.map(({ to, icon: Icon, label, accent }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
                  isActive
                    ? accent
                      ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/10 text-cyan-400 border border-cyan-500/20'
                      : 'bg-white/[0.08] text-white'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.04]'
                )
              }
            >
              <Icon size={16} />
              <span>{label}</span>
              {accent && (
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              )}
            </NavLink>
          ))}
        </nav>

        {/* Footer stats */}
        <div className="p-4 border-t border-white/[0.06]">
          <div className="bg-[#161820] rounded-xl p-3 space-y-2">
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
