import { useCallback } from 'react'
import toast from 'react-hot-toast'
import { dockerApi, runWithConfirmation } from '../lib/api'
import { useDockerStore } from '../lib/store'

export function useDocker() {
  const {
    setContainers, setImages, setNetworks, setVolumes,
    setSystemInfo, setLoading,
  } = useDockerStore()

  const refresh = useCallback(async () => {
    setLoading('all', true)
    try {
      const [containers, images, networks, volumes, info] = await Promise.all([
        dockerApi.listContainers(),
        dockerApi.listImages(),
        dockerApi.listNetworks(),
        dockerApi.listVolumes(),
        dockerApi.getInfo(),
      ])
      setContainers(containers as never[])
      setImages(images as never[])
      setNetworks(networks as never[])
      setVolumes(volumes as never[])
      setSystemInfo(info as never)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      const isSocketErr = msg.includes('No such file') || msg.includes('Connection aborted') || msg.includes('Docker socket')
      toast.error(
        isSocketErr
          ? 'Docker 未连接 — 请确认启动时已挂载 socket：\n-v /var/run/docker.sock:/var/run/docker.sock'
          : `刷新失败: ${msg}`,
        { duration: isSocketErr ? 8000 : 4000 }
      )
    } finally {
      setLoading('all', false)
    }
  }, [setContainers, setImages, setNetworks, setVolumes, setSystemInfo, setLoading])

  const containerAction = useCallback(
    async (action: 'start' | 'stop' | 'restart' | 'remove', id: string, name: string) => {
      const labels: Record<string, string> = {
        start: '启动', stop: '停止', restart: '重启', remove: '删除',
      }
      try {
        if (action === 'start') {
          await runWithConfirmation(
            () => dockerApi.startContainer(id),
            (confirmation) => dockerApi.startContainer(id, confirmation),
          )
        } else if (action === 'stop') {
          await runWithConfirmation(
            () => dockerApi.stopContainer(id),
            (confirmation) => dockerApi.stopContainer(id, confirmation),
          )
        } else if (action === 'restart') {
          await runWithConfirmation(
            () => dockerApi.restartContainer(id),
            (confirmation) => dockerApi.restartContainer(id, confirmation),
          )
        } else if (action === 'remove') {
          await runWithConfirmation(
            () => dockerApi.removeContainer(id, true),
            (confirmation) => dockerApi.removeContainer(id, true, confirmation),
          )
        }
        toast.success(`${name} 已${labels[action]}`)
        await refresh()
      } catch (e: unknown) {
        toast.error(`操作失败: ${e instanceof Error ? e.message : String(e)}`)
      }
    },
    [refresh]
  )

  return { refresh, containerAction }
}
