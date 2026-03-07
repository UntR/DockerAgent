import { useCallback, useEffect, useRef } from 'react'
import toast from 'react-hot-toast'
import { agentApi, createAgentWebSocket } from '../lib/api'
import { useAgentStore, ChatMessage, SessionMeta } from '../lib/store'

export function useAgent() {
  const {
    sessionId, setSessionId, addMessage, setMessages, appendToLastAssistant,
    appendThinking, addToolCall, updateToolCall,
    setConnected, setTyping, setLoadingHistory, isConnected,
    addSession, setSessionPreview,
  } = useAgentStore()
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const unmountedRef = useRef(false)

  const initSession = useCallback(async () => {
    if (sessionId) return
    try {
      const { session_id } = await agentApi.newSession()
      setSessionId(session_id)
      const now = Date.now()
      addSession({
        id: session_id,
        name: `新对话 ${new Date(now).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}`,
        created: now,
        preview: '',
      })
    } catch {
      toast.error('创建会话失败')
    }
  }, [sessionId, setSessionId, addSession])

  const connect = useCallback((sid: string) => {
    const state = wsRef.current?.readyState
    if (state === WebSocket.OPEN || state === WebSocket.CONNECTING) return

    const ws = createAgentWebSocket(sid)
    wsRef.current = ws

    ws.onopen = () => {
      if (!unmountedRef.current) setConnected(true)
    }
    ws.onclose = () => {
      if (unmountedRef.current) return
      setConnected(false)
      setTyping(false)
      reconnectTimer.current = setTimeout(() => {
        if (!unmountedRef.current) connect(sid)
      }, 3000)
    }
    ws.onerror = () => {
      if (!unmountedRef.current) {
        setConnected(false)
        setTyping(false)
      }
    }
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data)
      switch (data.type) {
        case 'chunk':
          appendToLastAssistant(data.content)
          break
        case 'think':
          appendThinking(data.content)
          break
        case 'tool_start':
          addToolCall({
            id: data.id,
            name: data.name,
            displayName: data.display_name,
            input: data.input,
            status: 'running',
          })
          break
        case 'tool_result':
          updateToolCall(data.id, data.result, data.is_error)
          break
        case 'done':
          setTyping(false)
          break
        case 'error':
          toast.error(data.content)
          setTyping(false)
          break
      }
    }
  }, [setConnected, setTyping, appendToLastAssistant, appendThinking, addToolCall, updateToolCall])

  useEffect(() => {
    if (sessionId) connect(sessionId)
  }, [sessionId, connect])

  useEffect(() => {
    unmountedRef.current = false
    return () => {
      unmountedRef.current = true
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
    }
  }, [])

  const sendMessage = useCallback(
    (message: string) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        toast.error('未连接到 Agent，请稍候重试')
        return
      }
      addMessage({ role: 'user', content: message, timestamp: new Date() })
      addMessage({ role: 'assistant', content: '', timestamp: new Date() })
      setTyping(true)
      wsRef.current.send(JSON.stringify({ message }))

      // 更新会话预览 + 自动命名（用第一条用户消息前20字）
      if (sessionId) {
        const preview = message.slice(0, 40)
        const { sessions } = useAgentStore.getState()
        const session = sessions.find((s) => s.id === sessionId)
        if (session) {
          const isDefaultName = session.name.startsWith('新对话')
          setSessionPreview(
            sessionId,
            preview,
            isDefaultName ? message.slice(0, 20) : undefined,
          )
        }
      }
    },
    [addMessage, setTyping, sessionId, setSessionPreview]
  )

  /** 切换到另一个已有会话 */
  const switchSession = useCallback(
    async (newSessionId: string) => {
      if (newSessionId === sessionId) return

      // 关闭当前 WS
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
      wsRef.current = null
      setConnected(false)
      setTyping(false)

      // 加载历史
      setLoadingHistory(true)
      setMessages([])
      setSessionId(newSessionId)

      try {
        const data = await agentApi.getHistory(newSessionId) as {
          messages: Array<{ role: string; content: string; created_at?: string }>
        }
        const converted: ChatMessage[] = (data.messages ?? [])
          .filter((m) => m.role === 'user' || m.role === 'assistant')
          .map((m) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content || '',
            timestamp: m.created_at ? new Date(m.created_at) : new Date(),
          }))
        setMessages(converted)
      } catch {
        toast.error('加载会话历史失败')
      } finally {
        setLoadingHistory(false)
      }
    },
    [sessionId, setSessionId, setMessages, setConnected, setTyping, setLoadingHistory]
  )

  /** 创建全新会话 */
  const createNewSession = useCallback(async () => {
    // 关闭当前 WS
    if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
    wsRef.current?.close()
    wsRef.current = null
    setConnected(false)
    setTyping(false)
    setMessages([])

    try {
      const { session_id } = await agentApi.newSession()
      const now = Date.now()
      const meta: SessionMeta = {
        id: session_id,
        name: `新对话 ${new Date(now).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}`,
        created: now,
        preview: '',
      }
      addSession(meta)
      setSessionId(session_id)
    } catch {
      toast.error('创建会话失败')
    }
  }, [setSessionId, setMessages, setConnected, setTyping, addSession])

  return { initSession, sendMessage, connect, switchSession, createNewSession }
}
