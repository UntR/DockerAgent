export interface ParsedDeployResult {
  projectName: string
  appPath: string
  accessUrls: Array<{ service: string; url: string }>
}

export function parseDeployResult(toolName: string, result?: string): ParsedDeployResult | null {
  if (toolName !== 'deploy_with_compose' || !result || !result.includes('部署成功')) {
    return null
  }

  const projectMatch = result.match(/部署成功！项目 `([^`]+)` 已启动。/)
  const appPathMatch = result.match(/应用详情[:：]\s*(\/apps\/\d+)/)
  if (!appPathMatch) return null

  const accessUrls: Array<{ service: string; url: string }> = []
  const urlPattern = /^-\s*([^:：\n]+)[:：]\s*(https?:\/\/\S+)/gm
  let match: RegExpExecArray | null
  while ((match = urlPattern.exec(result)) !== null) {
    accessUrls.push({ service: match[1].trim(), url: match[2].trim() })
  }

  return {
    projectName: projectMatch?.[1] ?? 'Compose 应用',
    appPath: appPathMatch[1],
    accessUrls,
  }
}
