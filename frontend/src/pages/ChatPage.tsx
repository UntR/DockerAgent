import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Send, Bot, User, Sparkles, RotateCcw, Brain, Zap,
  ChevronDown, Wrench, CheckCircle2, XCircle, Loader2,
  Terminal, Plus, MessageSquare, Trash2, CornerDownLeft,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useAgentStore, ToolCall, SessionMeta } from '../lib/store'
import { useAgent } from '../hooks/useAgent'
import { cn } from '../lib/utils'
import { agentApi } from '../lib/api'
import toast from 'react-hot-toast'

const QUICK_PROMPTS = [
  '现在有哪些容器在运行？',
  '帮我看看最近的错误日志',
  '系统资源使用情况如何？',
  '帮我创建一个 bridge 网络',
]

const TOOL_COLORS: Record<string, string> = {
  list_containers: 'text-blue-400',
  get_container: 'text-blue-400',
  start_container: 'text-emerald-400',
  stop_container: 'text-orange-400',
  restart_container: 'text-yellow-400',
  remove_container: 'text-red-400',
  get_container_logs: 'text-purple-400',
  run_container: 'text-cyan-400',
  pull_image: 'text-indigo-400',
  list_images: 'text-blue-400',
  remove_image: 'text-red-400',
  list_networks: 'text-blue-400',
  create_network: 'text-emerald-400',
  remove_network: 'text-red-400',
  connect_to_network: 'text-cyan-400',
  list_volumes: 'text-blue-400',
  create_volume: 'text-emerald-400',
  get_system_info: 'text-gray-400',
  fetch_deployment_info: 'text-violet-400',
  analyze_project_requirements: 'text-violet-400',
  deploy_with_compose: 'text-emerald-400',
  save_memory: 'text-pink-400',
}

export default function ChatPage() {
  const {
    messages, sessionId, isConnected, isTyping, clearMessages,
    loadingHistory, sessions, removeSessionFromList,
  } = useAgentStore()
  const { initSession, sendMessage, switchSession, createNewSession } = useAgent()
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [memories, setMemories] = useState<unknown[]>([])
  const [showMemories, setShowMemories] = useState(false)

  useEffect(() => { initSession() }, [initSession])
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  const handleSend = (text?: string) => {
    const msg = (text ?? input).trim()
    if (!msg || isTyping) return
    sendMessage(msg)
    if (!text) setInput('')
    inputRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  const loadMemories = async () => {
    try {
      const data = await agentApi.listMemories() as unknown[]
      setMemories(data)
      setShowMemories(true)
    } catch { toast.error('获取记忆失败') }
  }

  const clearConversation = async () => {
    if (!sessionId) return
    await agentApi.clearSession(sessionId)
    clearMessages()
    toast.success('对话已清除')
  }

  const handleDeleteSession = async (id: string) => {
    try {
      await agentApi.clearSession(id)
    } catch { /* ignore */ }
    removeSessionFromList(id)
    if (id === sessionId) {
      createNewSession()
    }
    toast.success('会话已删除')
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* ── 左侧会话列表 ── */}
      <div className="w-52 flex-shrink-0 border-r border-white/[0.06] bg-[#07080c] flex flex-col">
        {/* 新建对话按钮 */}
        <div className="p-3 border-b border-white/[0.06]">
          <button
            onClick={createNewSession}
            className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 hover:bg-cyan-500/15 hover:border-cyan-500/30 transition-all text-xs font-medium"
          >
            <Plus size={13} />
            新建对话
          </button>
        </div>

        {/* 会话列表 */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {sessions.length === 0 && (
            <p className="text-[11px] text-gray-600 text-center py-6">暂无历史对话</p>
          )}
          {sessions.map((s) => (
            <SessionItem
              key={s.id}
              session={s}
              isActive={s.id === sessionId}
              onSelect={() => switchSession(s.id)}
              onDelete={() => handleDeleteSession(s.id)}
            />
          ))}
        </div>
      </div>

      {/* ── 右侧主对话区 ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex-shrink-0 px-5 py-3.5 border-b border-white/[0.06] bg-[#0a0b0f] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center">
              <Bot size={16} className="text-white" />
            </div>
            <div>
              <h1 className="font-display font-semibold text-white text-sm">DockerAgent AI 助手</h1>
              <div className="flex items-center gap-2">
                <span className={cn('w-1.5 h-1.5 rounded-full', isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-gray-600')} />
                <span className="text-xs text-gray-500">
                  {loadingHistory ? '加载历史中...' : isConnected ? '已连接' : '连接中...'}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={loadMemories} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-gray-400 hover:text-white text-xs transition-colors">
              <Brain size={12} />记忆库
            </button>
            <button onClick={clearConversation} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-gray-400 hover:text-white text-xs transition-colors">
              <RotateCcw size={12} />清除
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
          {loadingHistory && (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={20} className="text-cyan-400 animate-spin mr-2" />
              <span className="text-gray-500 text-sm">加载历史消息中...</span>
            </div>
          )}

          {!loadingHistory && messages.length === 0 && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center h-full space-y-6 text-center">
              <div className="relative">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-cyan-400/20 to-blue-600/20 border border-cyan-500/20 flex items-center justify-center">
                  <Sparkles size={36} className="text-cyan-400" />
                </div>
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-400 rounded-full border-2 border-[#0a0b0f]" />
              </div>
              <div>
                <h2 className="font-display text-xl font-semibold text-white">你好！我是 DockerAgent</h2>
                <p className="text-gray-500 text-sm mt-2 max-w-md">
                  我可以帮你管理 Docker 容器、部署应用、查看日志、处理网络配置。<br />
                  用自然语言告诉我你想做什么吧！
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 w-full max-w-lg">
                {QUICK_PROMPTS.map((prompt) => (
                  <button key={prompt} onClick={() => handleSend(prompt)}
                    className="text-left px-4 py-3 rounded-xl bg-[#0f1117] border border-white/[0.06] hover:border-cyan-500/20 text-sm text-gray-400 hover:text-gray-200 transition-all">
                    {prompt}
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          <AnimatePresence initial={false}>
            {messages.map((msg, i) => {
              const isLast = i === messages.length - 1
              return (
                <motion.div key={i} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  className={cn('flex gap-3', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                  {msg.role === 'assistant' && (
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-400/20 to-blue-600/20 border border-cyan-500/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Bot size={14} className="text-cyan-400" />
                    </div>
                  )}

                  <div className={cn('max-w-[78%] space-y-2', msg.role === 'user' && 'items-end flex flex-col')}>
                    {msg.role === 'user' && (
                      <div className="rounded-2xl px-4 py-3 text-sm leading-relaxed bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/20 text-gray-100">
                        <span className="whitespace-pre-wrap break-words">{msg.content}</span>
                      </div>
                    )}

                    {msg.role === 'assistant' && msg.thinking && (
                      <ThinkingBlock thinking={msg.thinking} isStreaming={isTyping && isLast} />
                    )}

                    {msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0 && (
                      <div className="space-y-1.5">
                        {msg.toolCalls.map((tc) => (
                          <ToolCallCard key={tc.id} tc={tc} />
                        ))}
                      </div>
                    )}

                    {msg.role === 'assistant' && (
                      <div className="rounded-2xl px-4 py-3 text-sm leading-relaxed bg-[#0f1117] border border-white/[0.06] text-gray-200">
                        {msg.content
                          ? (
                            <MarkdownContent
                              content={msg.content}
                              onSend={!isTyping ? handleSend : undefined}
                            />
                          )
                          : <TypingDots />
                        }
                      </div>
                    )}
                  </div>

                  {msg.role === 'user' && (
                    <div className="w-8 h-8 rounded-xl bg-white/[0.08] flex items-center justify-center flex-shrink-0 mt-0.5">
                      <User size={14} className="text-gray-400" />
                    </div>
                  )}
                </motion.div>
              )
            })}
          </AnimatePresence>

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="flex-shrink-0 px-6 py-4 border-t border-white/[0.06] bg-[#0a0b0f]">
          <div className="flex items-end gap-3 max-w-4xl mx-auto">
            <div className="flex-1 relative">
              <textarea ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="输入消息... (Enter 发送，Shift+Enter 换行)"
                rows={1} disabled={!isConnected || loadingHistory}
                className="w-full bg-[#0f1117] border border-white/[0.08] rounded-2xl px-4 py-3 pr-12 text-sm text-gray-200 placeholder-gray-600 resize-none focus:outline-none focus:border-cyan-500/40 transition-colors disabled:opacity-50"
                style={{ minHeight: '48px', maxHeight: '140px' }}
                onInput={(e) => {
                  const el = e.currentTarget
                  el.style.height = 'auto'
                  el.style.height = `${Math.min(el.scrollHeight, 140)}px`
                }}
              />
            </div>
            <button onClick={() => handleSend()} disabled={!input.trim() || isTyping || !isConnected || loadingHistory}
              className="flex-shrink-0 w-11 h-11 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white disabled:opacity-40 hover:opacity-90 active:scale-95 transition-all">
              {isTyping ? <Zap size={16} className="animate-pulse" /> : <Send size={16} />}
            </button>
          </div>
        </div>
      </div>

      {/* Memories Modal */}
      {showMemories && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-6"
          onClick={() => setShowMemories(false)}>
          <div className="bg-[#0f1117] border border-white/[0.08] rounded-2xl w-full max-w-lg max-h-[60vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
              <div className="flex items-center gap-2">
                <Brain size={16} className="text-purple-400" />
                <span className="font-semibold text-white text-sm">Agent 记忆库</span>
              </div>
              <button onClick={() => setShowMemories(false)} className="text-gray-500 hover:text-white text-xl">×</button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-2">
              {(memories as Array<{ key: string; value: string; category: string }>).length === 0
                ? <p className="text-gray-500 text-sm text-center py-8">暂无记忆</p>
                : (memories as Array<{ key: string; value: string; category: string }>).map((m) => (
                  <div key={m.key} className="px-4 py-3 rounded-xl bg-[#161820] border border-white/[0.04]">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-purple-400">{m.key}</span>
                      <span className="text-[10px] text-gray-600">{m.category}</span>
                    </div>
                    <p className="text-sm text-gray-300">{m.value}</p>
                  </div>
                ))
              }
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── 会话列表项 ──────────────────────────────────────────────────
function SessionItem({
  session, isActive, onSelect, onDelete,
}: {
  session: SessionMeta
  isActive: boolean
  onSelect: () => void
  onDelete: () => void
}) {
  const [hovering, setHovering] = useState(false)

  return (
    <div
      className={cn(
        'group relative flex items-center gap-2 px-3 py-2.5 rounded-xl cursor-pointer transition-all',
        isActive
          ? 'bg-cyan-500/10 border border-cyan-500/20'
          : 'hover:bg-white/[0.04] border border-transparent',
      )}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onClick={onSelect}
    >
      <MessageSquare
        size={13}
        className={cn('flex-shrink-0', isActive ? 'text-cyan-400' : 'text-gray-600')}
      />
      <div className="flex-1 min-w-0">
        <p className={cn('text-xs font-medium truncate', isActive ? 'text-cyan-300' : 'text-gray-300')}>
          {session.name}
        </p>
        {session.preview && (
          <p className="text-[10px] text-gray-600 truncate mt-0.5">{session.preview}</p>
        )}
      </div>
      {hovering && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          className="flex-shrink-0 p-1 rounded-md hover:bg-red-500/15 text-gray-600 hover:text-red-400 transition-colors"
        >
          <Trash2 size={11} />
        </button>
      )}
    </div>
  )
}

// ── Thinking 折叠块 ──────────────────────────────────────────────
function ThinkingBlock({ thinking, isStreaming }: { thinking: string; isStreaming: boolean }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (isStreaming) setOpen(true)
  }, [isStreaming])

  return (
    <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-violet-400 hover:bg-violet-500/10 transition-colors"
      >
        <Brain size={12} className={cn(isStreaming && 'animate-pulse')} />
        <span className="flex-1 text-left font-medium">
          {isStreaming ? '思考中...' : '查看思考过程'}
        </span>
        <ChevronDown size={12} className={cn('transition-transform', open && 'rotate-180')} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 max-h-64 overflow-y-auto">
              <p className="text-xs text-violet-300/70 whitespace-pre-wrap leading-relaxed font-mono">
                {thinking}
                {isStreaming && <span className="inline-block w-1.5 h-3 bg-violet-400/60 animate-pulse ml-0.5 align-middle" />}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Tool Call 卡片 ──────────────────────────────────────────────
function ToolCallCard({ tc }: { tc: ToolCall }) {
  const [showDetails, setShowDetails] = useState(false)
  const color = TOOL_COLORS[tc.name] || 'text-gray-400'

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      className={cn(
        'rounded-xl border overflow-hidden',
        tc.status === 'running' ? 'border-cyan-500/20 bg-cyan-500/5'
        : tc.status === 'error'  ? 'border-red-500/20 bg-red-500/5'
        : 'border-white/[0.06] bg-[#0f1117]'
      )}
    >
      <button
        onClick={() => setShowDetails((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-white/[0.03] transition-colors"
      >
        <Wrench size={11} className={color} />
        <span className={cn('font-medium', color)}>{tc.displayName}</span>
        <span className="text-gray-600 font-mono ml-auto">{tc.name}</span>
        {tc.status === 'running' && <Loader2 size={11} className="text-cyan-400 animate-spin ml-1 flex-shrink-0" />}
        {tc.status === 'done' && <CheckCircle2 size={11} className="text-emerald-400 ml-1 flex-shrink-0" />}
        {tc.status === 'error' && <XCircle size={11} className="text-red-400 ml-1 flex-shrink-0" />}
        <ChevronDown size={10} className={cn('text-gray-600 ml-1 transition-transform flex-shrink-0', showDetails && 'rotate-180')} />
      </button>
      <AnimatePresence>
        {showDetails && (
          <motion.div
            initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
            className="overflow-hidden border-t border-white/[0.04]"
          >
            <div className="px-3 py-2 space-y-2">
              {Object.keys(tc.input).length > 0 && (
                <div>
                  <div className="flex items-center gap-1 mb-1 text-[10px] text-gray-600 uppercase tracking-wider">
                    <Terminal size={9} />入参
                  </div>
                  <pre className="text-[11px] font-mono text-gray-400 bg-black/30 rounded-lg px-2 py-1.5 overflow-x-auto whitespace-pre-wrap break-all">
                    {JSON.stringify(tc.input, null, 2)}
                  </pre>
                </div>
              )}
              {tc.result !== undefined && (
                <div>
                  <div className={cn(
                    'flex items-center gap-1 mb-1 text-[10px] uppercase tracking-wider',
                    tc.isError ? 'text-red-500/70' : 'text-gray-600'
                  )}>
                    {tc.isError ? <XCircle size={9} /> : <CheckCircle2 size={9} />}
                    结果
                  </div>
                  <pre className={cn(
                    'text-[11px] font-mono rounded-lg px-2 py-1.5 overflow-x-auto whitespace-pre-wrap break-all max-h-40',
                    tc.isError ? 'bg-red-500/10 text-red-300' : 'bg-black/30 text-emerald-300'
                  )}>
                    {tc.result.length > 800 ? tc.result.slice(0, 800) + '\n...(内容已截断)' : tc.result}
                  </pre>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ── 判断消息是否属于"请用户选择方案"的上下文 ────────────────────
const CHOICE_PATTERNS = [
  /请(告诉我|选择|问一下|说明|回复|让我知道).*(选择|方式|方案|操作|选项|如何)/,
  /你(希望|想要|想|需要|打算).*(怎么|如何|哪种|哪个)/,
  /(哪种|哪个|哪些).*(方式|方案|选项|操作)/,
  /请.*(选[择选]|告知|告诉)/,
  /你的选择/,
  /我来执行/,
  /请问你/,
  /如何处理/,
  /你想.*(删除|清理|保留|部署|启动|停止)/,
]

function isChoiceMessage(content: string): boolean {
  // 末尾含问号（中英文）
  const trimmed = content.trimEnd()
  if (trimmed.endsWith('？') || trimmed.endsWith('?')) return true
  // 匹配选择相关短语
  return CHOICE_PATTERNS.some((p) => p.test(content))
}

// ── 可点击列表项 ─────────────────────────────────────────────────
function ClickableLi({
  children,
  onSend,
}: {
  children: React.ReactNode
  onSend?: (text: string) => void
}) {
  const spanRef = useRef<HTMLSpanElement>(null)

  const handleClick = () => {
    const text = spanRef.current?.textContent?.trim() ?? ''
    if (text && onSend) onSend(text)
  }

  if (!onSend) {
    return <li className="text-gray-200 leading-relaxed list-disc list-inside">{children}</li>
  }

  return (
    <li className="group flex items-start gap-1.5 py-0.5">
      <span className="text-cyan-500/60 flex-shrink-0 mt-[3px] text-xs">›</span>
      <span ref={spanRef} className="flex-1 leading-relaxed text-gray-200">{children}</span>
      <button
        onClick={handleClick}
        title="点击发送此选项"
        className="flex-shrink-0 mt-0.5 flex items-center gap-1 px-1.5 py-0.5 rounded-md opacity-0 group-hover:opacity-100 bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 hover:bg-cyan-500/20 transition-all text-[10px] font-medium"
      >
        <CornerDownLeft size={9} />
        <span>选择</span>
      </button>
    </li>
  )
}

// ── Markdown 渲染 ──────────────────────────────────────────────
function MarkdownContent({ content, onSend }: { content: string; onSend?: (text: string) => void }) {
  // 只有消息语义上是"请选择"时，才给列表项加可点击能力
  const listOnSend = onSend && isChoiceMessage(content) ? onSend : undefined

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
        h1: ({ children }) => <h1 className="text-base font-bold text-white mb-2 mt-3 first:mt-0">{children}</h1>,
        h2: ({ children }) => <h2 className="text-sm font-bold text-white mb-2 mt-3 first:mt-0">{children}</h2>,
        h3: ({ children }) => <h3 className="text-sm font-semibold text-gray-200 mb-1 mt-2 first:mt-0">{children}</h3>,
        ul: ({ children }) => <ul className="list-none space-y-0.5 mb-2 pl-1">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal list-inside space-y-0.5 mb-2 pl-1">{children}</ol>,
        li: ({ children }) => <ClickableLi onSend={listOnSend}>{children}</ClickableLi>,
        code: ({ inline, children, ...props }: { inline?: boolean; children?: React.ReactNode }) =>
          inline ? (
            <code className="bg-white/[0.08] text-cyan-300 rounded px-1 py-0.5 text-[12px] font-mono" {...props}>
              {children}
            </code>
          ) : (
            <code className="block bg-[#0a0b0f] border border-white/[0.06] rounded-xl px-3 py-2.5 text-[12px] font-mono text-emerald-300 overflow-x-auto whitespace-pre mb-2" {...props}>
              {children}
            </code>
          ),
        pre: ({ children }) => <>{children}</>,
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-cyan-500/40 pl-3 text-gray-400 italic mb-2">{children}</blockquote>
        ),
        strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
        em: ({ children }) => <em className="italic text-gray-300">{children}</em>,
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noopener noreferrer"
            className="text-cyan-400 underline underline-offset-2 hover:text-cyan-300 transition-colors">
            {children}
          </a>
        ),
        table: ({ children }) => (
          <div className="overflow-x-auto mb-2">
            <table className="min-w-full text-xs border border-white/[0.06] rounded-lg overflow-hidden">{children}</table>
          </div>
        ),
        thead: ({ children }) => <thead className="bg-white/[0.04]">{children}</thead>,
        th: ({ children }) => <th className="px-3 py-2 text-left font-medium text-gray-300 border-b border-white/[0.06]">{children}</th>,
        td: ({ children }) => <td className="px-3 py-2 text-gray-300 border-b border-white/[0.04]">{children}</td>,
        hr: () => <hr className="border-white/[0.06] my-3" />,
      }}
    >
      {content}
    </ReactMarkdown>
  )
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1 py-1">
      {[0, 1, 2].map((i) => (
        <motion.div key={i} className="w-1.5 h-1.5 rounded-full bg-cyan-400/60"
          animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1, 0.8] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
        />
      ))}
    </div>
  )
}
