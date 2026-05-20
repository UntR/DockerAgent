from typing import Any, Dict, List, Optional


def build_deploy_success_result(
    project_name: str,
    work_dir: str,
    access_urls: List[Dict[str, Any]],
    compose_output: str,
    app_id: Optional[int] = None,
) -> str:
    result_lines = [
        f"部署成功！项目 `{project_name}` 已启动。",
        f"工作目录：{work_dir}",
    ]
    if app_id is not None:
        result_lines.append(f"应用详情：/apps/{app_id}")
    if access_urls:
        result_lines.append("访问地址：")
        for item in access_urls:
            service = item.get("service", "web")
            url = item.get("url", "")
            if url:
                result_lines.append(f"- {service}: {url}")
    result_lines.append(
        f"输出：\n{compose_output[-2000:] if len(compose_output) > 2000 else compose_output}"
    )
    return "\n".join(result_lines)
