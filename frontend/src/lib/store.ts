import { create } from 'zustand'

export interface Container {
  id: string
  full_id: string
  name: string
  image: string
  status: string
  ports: Record<string, unknown>
  created: string
  networks: string[]
  labels: Record<string, string>
  description?: string
}

export interface DockerImage {
  id: string
  full_id: string
  tags: string[]
  size: number
  created: string
}

export interface Network {
  id: string
  full_id: string
  name: string
  driver: string
  scope: string
  created: string
  containers: string[]
}

export interface Volume {
  name: string
  driver: string
  mountpoint: string
  created: string
  labels: Record<string, string>
}

export interface SystemInfo {
  containers: number
  containers_running: number
  containers_paused: number
  containers_stopped: number
  images: number
  docker_version: string
  os: string
  architecture: string
  total_memory: number
  cpus: number
}

export interface Snapshot {
  id: number
  name: string
  description: string | null
  created_at: string
  is_auto: boolean
  container_count: number
}

export interface ToolCall {
  id: string
  name: string
  displayName: string
  input: Record<string, unknown>
  result?: string
  isError?: boolean
  status: 'running' | 'done' | 'error'
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
  thinking?: string
  toolCalls?: ToolCall[]
}

export interface SessionMeta {
  id: string
  name: string
  created: number
  preview: string
}

// ── Session localStorage 持久化 ──────────────────────────────────
const SESSIONS_KEY = 'docker_agent_sessions_v1'

export function loadPersistedSessions(): SessionMeta[] {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY)
    return raw ? (JSON.parse(raw) as SessionMeta[]) : []
  } catch { return [] }
}

export function persistSessions(sessions: SessionMeta[]) {
  try { localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions)) } catch { /* ignore */ }
}

interface DockerState {
  containers: Container[]
  images: DockerImage[]
  networks: Network[]
  volumes: Volume[]
  systemInfo: SystemInfo | null
  snapshots: Snapshot[]
  loading: Record<string, boolean>
  setContainers: (c: Container[]) => void
  setImages: (i: DockerImage[]) => void
  setNetworks: (n: Network[]) => void
  setVolumes: (v: Volume[]) => void
  setSystemInfo: (s: SystemInfo) => void
  setSnapshots: (s: Snapshot[]) => void
  setLoading: (key: string, val: boolean) => void
}

export const useDockerStore = create<DockerState>((set) => ({
  containers: [],
  images: [],
  networks: [],
  volumes: [],
  systemInfo: null,
  snapshots: [],
  loading: {},
  setContainers: (containers) => set({ containers }),
  setImages: (images) => set({ images }),
  setNetworks: (networks) => set({ networks }),
  setVolumes: (volumes) => set({ volumes }),
  setSystemInfo: (systemInfo) => set({ systemInfo }),
  setSnapshots: (snapshots) => set({ snapshots }),
  setLoading: (key, val) => set((s) => ({ loading: { ...s.loading, [key]: val } })),
}))

interface AgentState {
  sessionId: string | null
  messages: ChatMessage[]
  isConnected: boolean
  isTyping: boolean
  loadingHistory: boolean
  sessions: SessionMeta[]
  setSessionId: (id: string) => void
  addMessage: (msg: ChatMessage) => void
  setMessages: (messages: ChatMessage[]) => void
  appendToLastAssistant: (chunk: string) => void
  appendThinking: (chunk: string) => void
  addToolCall: (toolCall: ToolCall) => void
  updateToolCall: (id: string, result: string, isError: boolean) => void
  setConnected: (v: boolean) => void
  setTyping: (v: boolean) => void
  setLoadingHistory: (v: boolean) => void
  clearMessages: () => void
  addSession: (s: SessionMeta) => void
  setSessionPreview: (id: string, preview: string, name?: string) => void
  removeSessionFromList: (id: string) => void
}

const updateLastAssistant = (
  msgs: ChatMessage[],
  updater: (msg: ChatMessage) => ChatMessage,
): ChatMessage[] => {
  const copy = [...msgs]
  const lastIdx = copy.length - 1
  if (lastIdx >= 0 && copy[lastIdx].role === 'assistant') {
    copy[lastIdx] = updater({ ...copy[lastIdx] })
  }
  return copy
}

export const useAgentStore = create<AgentState>((set) => ({
  sessionId: null,
  messages: [],
  isConnected: false,
  isTyping: false,
  loadingHistory: false,
  sessions: loadPersistedSessions(),
  setSessionId: (id) => set({ sessionId: id }),
  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  setMessages: (messages) => set({ messages }),
  appendToLastAssistant: (chunk) =>
    set((s) => ({
      messages: updateLastAssistant(s.messages, (m) => ({
        ...m,
        content: m.content + chunk,
      })),
    })),
  appendThinking: (chunk) =>
    set((s) => ({
      messages: updateLastAssistant(s.messages, (m) => ({
        ...m,
        thinking: (m.thinking ?? '') + chunk,
      })),
    })),
  addToolCall: (toolCall) =>
    set((s) => ({
      messages: updateLastAssistant(s.messages, (m) => ({
        ...m,
        toolCalls: [...(m.toolCalls ?? []), toolCall],
      })),
    })),
  updateToolCall: (id, result, isError) =>
    set((s) => ({
      messages: updateLastAssistant(s.messages, (m) => ({
        ...m,
        toolCalls: (m.toolCalls ?? []).map((tc) =>
          tc.id === id
            ? { ...tc, result, isError, status: (isError ? 'error' : 'done') as 'done' | 'error' }
            : tc
        ),
      })),
    })),
  setConnected: (isConnected) => set({ isConnected }),
  setTyping: (isTyping) => set({ isTyping }),
  setLoadingHistory: (loadingHistory) => set({ loadingHistory }),
  clearMessages: () => set({ messages: [] }),
  addSession: (s) =>
    set((state) => {
      const sessions = [s, ...state.sessions.filter((x) => x.id !== s.id)]
      persistSessions(sessions)
      return { sessions }
    }),
  setSessionPreview: (id, preview, name) =>
    set((state) => {
      const sessions = state.sessions.map((s) =>
        s.id === id
          ? { ...s, preview, ...(name ? { name } : {}) }
          : s
      )
      persistSessions(sessions)
      return { sessions }
    }),
  removeSessionFromList: (id) =>
    set((state) => {
      const sessions = state.sessions.filter((s) => s.id !== id)
      persistSessions(sessions)
      return { sessions }
    }),
}))
