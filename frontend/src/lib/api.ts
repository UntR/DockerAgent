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

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || res.statusText)
  }
  return res.json()
}

// ── Docker ──────────────────────────────────────────────

export const dockerApi = {
  getInfo: () => request('/docker/info'),
  listContainers: (all = true) => request(`/docker/containers?all=${all}`),
  getContainer: (id: string) => request(`/docker/containers/${id}`),
  startContainer: (id: string) => request(`/docker/containers/${id}/start`, { method: 'POST' }),
  stopContainer: (id: string) => request(`/docker/containers/${id}/stop`, { method: 'POST' }),
  restartContainer: (id: string) => request(`/docker/containers/${id}/restart`, { method: 'POST' }),
  removeContainer: (id: string, force = false) =>
    request(`/docker/containers/${id}?force=${force}`, { method: 'DELETE' }),
  getContainerLogs: (id: string, tail = 100) =>
    request<{ logs: string }>(`/docker/containers/${id}/logs?tail=${tail}`),
  getContainerStats: (id: string) => request(`/docker/containers/${id}/stats`),
  runContainer: (data: object) =>
    request('/docker/containers/run', { method: 'POST', body: JSON.stringify(data) }),

  listImages: () => request('/docker/images'),
  pullImage: (image: string, tag = 'latest') =>
    request('/docker/images/pull', { method: 'POST', body: JSON.stringify({ image, tag }) }),
  removeImage: (id: string, force = false) =>
    request(`/docker/images/${id}?force=${force}`, { method: 'DELETE' }),

  listNetworks: () => request('/docker/networks'),
  createNetwork: (name: string, driver = 'bridge') =>
    request('/docker/networks', { method: 'POST', body: JSON.stringify({ name, driver }) }),
  removeNetwork: (id: string) => request(`/docker/networks/${id}`, { method: 'DELETE' }),

  getHostStats: (showAll = false) => request<HostStats>(`/docker/host-stats?show_all_disks=${showAll}`),

  listVolumes: () => request('/docker/volumes'),
  createVolume: (name: string) =>
    request('/docker/volumes', { method: 'POST', body: JSON.stringify({ name }) }),
  removeVolume: (name: string) => request(`/docker/volumes/${name}`, { method: 'DELETE' }),
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
  analyze: (source: string, description?: string) =>
    request('/deploy/analyze', { method: 'POST', body: JSON.stringify({ source, description }) }),
  smartDeploy: (source: string, description?: string) =>
    request('/deploy/smart', { method: 'POST', body: JSON.stringify({ source, description }) }),
}

// ── Rollback ──────────────────────────────────────────────

export const rollbackApi = {
  listSnapshots: () => request('/rollback/snapshots'),
  createSnapshot: (name: string, description?: string) =>
    request('/rollback/snapshots', {
      method: 'POST',
      body: JSON.stringify({ name, description }),
    }),
  deleteSnapshot: (id: number) => request(`/rollback/snapshots/${id}`, { method: 'DELETE' }),
  rollback: (snapshotId: number, keepVolumes: boolean) =>
    request('/rollback/execute', {
      method: 'POST',
      body: JSON.stringify({ snapshot_id: snapshotId, keep_volumes: keepVolumes }),
    }),
}

// ── WebSocket ──────────────────────────────────────────────

export function createAgentWebSocket(sessionId: string): WebSocket {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const host = window.location.host
  return new WebSocket(`${protocol}//${host}/api/agent/chat/ws/${sessionId}`)
}
