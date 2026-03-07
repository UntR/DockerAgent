import { useCallback } from 'react'
import toast from 'react-hot-toast'
import { dockerApi } from '../lib/api'
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
      toast.error(`刷新失败: ${e instanceof Error ? e.message : String(e)}`)
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
        if (action === 'start') await dockerApi.startContainer(id)
        else if (action === 'stop') await dockerApi.stopContainer(id)
        else if (action === 'restart') await dockerApi.restartContainer(id)
        else if (action === 'remove') await dockerApi.removeContainer(id, true)
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
