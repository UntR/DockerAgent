export interface HostStats {
  cpu_percent: number
  cpu_count: number
  memory_total: number
  memory_used: number
  memory_available: number
  memory_percent: number
  disks: Array<{
    mountpoint: string
    device: string
    fstype: string
    total: number
    used: number
    free: number
    percent: number
  }>
}

const BASE_URL = '/api'
const ACCESS_TOKEN_KEY = 'docker_agent_access_token'

export interface ConfirmationRequiredPayload {
  requires_confirmation: true
  confirmation: {
    action: string
    target: string
    message: string
    confirm_value: string
    confirmation_token?: string
    user_prompt?: string
    details?: {
      kind?: string
      compose_project?: string
      work_dir?: string
      files?: string[]
      env_keys?: string[]
      access_urls?: Array<{ service: string; url: string }>
      warnings?: Array<{ level?: string; message?: string }>
    }
  }
}

export interface ManagedAppContainer {
  id: string
  full_id: string
  name: string
  service: string
  image: string
  status: string
  ports: Record<string, Array<{ HostIp: string; HostPort: string }> | null>
}

export interface ManagedAppFile {
  kind: 'compose' | 'env'
  path: string
  content: string
  masked: boolean
  truncated: boolean
}

export interface ManagedAppSnapshot {
  id: number
  name: string
  description: string | null
  created_at: string
  is_auto: boolean
  container_count: number
  compose_project: string
}

export interface ManagedApp {
  id: number
  name: string
  compose_project: string
  work_dir: string
  compose_path: string
  env_path: string
  source_url: string
  access_urls: Array<{ service: string; url: string }>
  status: string
  created_at: string
  updated_at: string
  containers?: ManagedAppContainer[]
  snapshots?: ManagedAppSnapshot[]
}

export interface DeploymentEnvEntry {
  key: string
  description?: string
  default?: string
  example?: string
}

export interface DeploymentPlan {
  source: string
  description: string
  app_name: string
  compose_project: string
  work_dir: string
  files: Array<{ kind: string; path: string; action: string }>
  env: {
    required: DeploymentEnvEntry[]
    optional: DeploymentEnvEntry[]
    provided_keys: string[]
    missing_required_keys: string[]
  }
  warnings: Array<{ level?: string; code?: string; message: string }>
  access_urls: Array<{ service: string; url: string }>
  deployable: boolean
}

export interface DeploymentTask {
  id: number
  session_id: string
  source_url: string
  app_name: string
  compose_project: string
  work_dir: string
  compose_path: string
  env_path: string
  status: string
  message: string
  compose_output: string
  error_output: string
  access_urls: Array<{ service: string; url: string }>
  app_id: number | null
  created_at: string
  updated_at: string
}

export class ConfirmationRequiredError extends Error {
  payload: ConfirmationRequiredPayload

  constructor(payload: ConfirmationRequiredPayload) {
    super(payload.confirmation.message)
    this.name = 'ConfirmationRequiredError'
    this.payload = payload
  }
}

function isConfirmationRequiredPayload(value: unknown): value is ConfirmationRequiredPayload {
  return (
    !!value &&
    typeof value === 'object' &&
    (value as { requires_confirmation?: unknown }).requires_confirmation === true &&
    typeof (value as { confirmation?: unknown }).confirmation === 'object'
  )
}

export async function runWithConfirmation<T>(
  operation: () => Promise<T>,
  confirmedOperation: (confirmValue: string) => Promise<T>,
): Promise<T> {
  try {
    return await operation()
  } catch (e) {
    if (!(e instanceof ConfirmationRequiredError)) throw e

    const { message, confirm_value } = e.payload.confirmation
    const ok = window.confirm(`${message}\n\n此操作会修改 Docker 状态，确认执行？`)
    if (!ok) throw new Error('操作已取消')
    return confirmedOperation(confirm_value)
  }
}

function appendConfirmation(path: string, confirmation?: string): string {
  if (!confirmation) return path
  const sep = path.includes('?') ? '&' : '?'
  return `${path}${sep}confirmation=${encodeURIComponent(confirmation)}`
}

function getAccessToken(): string {
  try {
    return localStorage.getItem(ACCESS_TOKEN_KEY) ?? ''
  } catch {
    return ''
  }
}

function saveAccessToken(token: string): void {
  try {
    localStorage.setItem(ACCESS_TOKEN_KEY, token)
  } catch {
    // ignore
  }
}

function authHeaders(): Record<string, string> {
  const token = getAccessToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  retryAuth = true,
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
      ...options.headers,
    },
    ...options,
  })
  if (!res.ok) {
    if (res.status === 401 && retryAuth) {
      const token = window.prompt('请输入 DockerAgent Access Token')
      if (token) {
        saveAccessToken(token.trim())
        return request<T>(path, options, false)
      }
    }
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    if (isConfirmationRequiredPayload(err)) {
      throw new ConfirmationRequiredError(err)
    }
    throw new Error(typeof err.detail === 'string' ? err.detail : res.statusText)
  }
  return res.json()
}

// ── Docker ──────────────────────────────────────────────

export const dockerApi = {
  getInfo: () => request('/docker/info'),
  listContainers: (all = true) => request(`/docker/containers?all=${all}`),
  getContainer: (id: string) => request(`/docker/containers/${id}`),
  startContainer: (id: string, confirmation?: string) =>
    request(appendConfirmation(`/docker/containers/${id}/start`, confirmation), { method: 'POST' }),
  stopContainer: (id: string, confirmation?: string) =>
    request(appendConfirmation(`/docker/containers/${id}/stop`, confirmation), { method: 'POST' }),
  restartContainer: (id: string, confirmation?: string) =>
    request(appendConfirmation(`/docker/containers/${id}/restart`, confirmation), { method: 'POST' }),
  removeContainer: (id: string, force = false, confirmation?: string) =>
    request(appendConfirmation(`/docker/containers/${id}?force=${force}`, confirmation), { method: 'DELETE' }),
  getContainerLogs: (id: string, tail = 100) =>
    request<{ logs: string }>(`/docker/containers/${id}/logs?tail=${tail}`),
  getContainerStats: (id: string) => request(`/docker/containers/${id}/stats`),
  runContainer: (data: object, confirmation?: string) =>
    request('/docker/containers/run', {
      method: 'POST',
      body: JSON.stringify({ ...data, ...(confirmation ? { confirmation } : {}) }),
    }),

  listImages: () => request('/docker/images'),
  pullImage: (image: string, tag = 'latest') =>
    request('/docker/images/pull', { method: 'POST', body: JSON.stringify({ image, tag }) }),
  removeImage: (id: string, force = false, confirmation?: string) =>
    request(appendConfirmation(`/docker/images/${id}?force=${force}`, confirmation), { method: 'DELETE' }),

  listNetworks: () => request('/docker/networks'),
  createNetwork: (name: string, driver = 'bridge') =>
    request('/docker/networks', { method: 'POST', body: JSON.stringify({ name, driver }) }),
  removeNetwork: (id: string, confirmation?: string) =>
    request(appendConfirmation(`/docker/networks/${id}`, confirmation), { method: 'DELETE' }),

  getHostStats: (showAll = false) => request<HostStats>(`/docker/host-stats?show_all_disks=${showAll}`),

  listVolumes: () => request('/docker/volumes'),
  createVolume: (name: string) =>
    request('/docker/volumes', { method: 'POST', body: JSON.stringify({ name }) }),
  removeVolume: (name: string, confirmation?: string) =>
    request(appendConfirmation(`/docker/volumes/${name}`, confirmation), { method: 'DELETE' }),
}

// ── Apps ──────────────────────────────────────────────

export const appsApi = {
  listApps: () => request<ManagedApp[]>('/apps'),
  getApp: (id: number) => request<ManagedApp>(`/apps/${id}`),
  getAppFile: (id: number, kind: 'compose' | 'env') =>
    request<ManagedAppFile>(`/apps/${id}/files/${kind}`),
}

// ── Agent ──────────────────────────────────────────────

export const agentApi = {
  newSession: () => request<{ session_id: string }>('/agent/sessions/new', { method: 'POST' }),
  getHistory: (sessionId: string) => request(`/agent/sessions/${sessionId}/history`),
  clearSession: (sessionId: string) =>
    request(`/agent/sessions/${sessionId}`, { method: 'DELETE' }),
  listMemories: (category?: string) =>
    request(`/agent/memories${category ? `?category=${category}` : ''}`),
  listReflections: () => request('/agent/reflections'),
}

// ── Deploy ──────────────────────────────────────────────

export const deployApi = {
  analyze: (source: string, description?: string, env_vars?: Record<string, string>) =>
    request('/deploy/analyze', { method: 'POST', body: JSON.stringify({ source, description, env_vars }) }),
  smartDeploy: (source: string, description?: string, env_vars?: Record<string, string>) =>
    request('/deploy/smart', { method: 'POST', body: JSON.stringify({ source, description, env_vars }) }),
  listTasks: () => request<DeploymentTask[]>('/deploy/tasks'),
  getTask: (id: number) => request<DeploymentTask>(`/deploy/tasks/${id}`),
}

// ── Rollback ──────────────────────────────────────────────

export const rollbackApi = {
  listSnapshots: (composeProject?: string) =>
    request<ManagedAppSnapshot[]>(`/rollback/snapshots${composeProject ? `?compose_project=${encodeURIComponent(composeProject)}` : ''}`),
  createSnapshot: (name: string, description?: string, composeProject?: string) =>
    request('/rollback/snapshots', {
      method: 'POST',
      body: JSON.stringify({ name, description, ...(composeProject ? { compose_project: composeProject } : {}) }),
    }),
  deleteSnapshot: (id: number) => request(`/rollback/snapshots/${id}`, { method: 'DELETE' }),
  rollback: (snapshotId: number, keepVolumes: boolean, confirmation?: string) =>
    request('/rollback/execute', {
      method: 'POST',
      body: JSON.stringify({
        snapshot_id: snapshotId,
        keep_volumes: keepVolumes,
        ...(confirmation ? { confirmation } : {}),
      }),
    }),
}

// ── WebSocket ──────────────────────────────────────────────

export function createAgentWebSocket(sessionId: string): WebSocket {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const host = window.location.host
  const token = getAccessToken()
  const query = token ? `?token=${encodeURIComponent(token)}` : ''
  return new WebSocket(`${protocol}//${host}/api/agent/chat/ws/${sessionId}${query}`)
}
