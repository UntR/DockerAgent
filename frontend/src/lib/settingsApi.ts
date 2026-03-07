const BASE = '/api/settings'

async function req<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    ...opts,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || res.statusText)
  }
  return res.json()
}

export interface Provider {
  id: number
  name: string
  provider_type: 'anthropic' | 'openai' | 'custom'
  base_url: string
  api_key_masked: string
  api_key: string
  model: string
  is_active: boolean
  is_builtin: boolean
  extra: Record<string, unknown>
  created_at: string
}

export interface ProviderCreate {
  name: string
  provider_type: string
  base_url?: string
  api_key: string
  model: string
  extra?: Record<string, unknown>
}

export interface TestRequest {
  provider_type: string
  base_url?: string
  api_key: string
  model: string
}

export interface TestResult {
  success: boolean
  message: string
}

export interface ModelsResult {
  success: boolean
  models: string[]
  message?: string
}

export const settingsApi = {
  listProviders: () => req<Provider[]>('/providers'),

  createProvider: (data: ProviderCreate) =>
    req<Provider>('/providers', { method: 'POST', body: JSON.stringify(data) }),

  updateProvider: (id: number, data: Partial<ProviderCreate>) =>
    req<Provider>(`/providers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  activateProvider: (id: number) =>
    req<{ success: boolean; message: string }>(`/providers/${id}/activate`, { method: 'POST' }),

  deleteProvider: (id: number) =>
    req<{ success: boolean }>(`/providers/${id}`, { method: 'DELETE' }),

  testConnection: (data: TestRequest) =>
    req<TestResult>('/test', { method: 'POST', body: JSON.stringify(data) }),

  fetchModels: (data: { provider_type: string; base_url?: string; api_key: string }) =>
    req<ModelsResult>('/models', { method: 'POST', body: JSON.stringify(data) }),
}
