import ipaddress


LOCAL_ONLY_DETAIL = "未设置 Access Token 时仅允许本机访问"


def _extract_host(host_header: str) -> str:
    host = host_header.strip().lower()
    if not host:
        return ""
    if host.startswith("["):
        end = host.find("]")
        return host[1:end] if end != -1 else host
    if host.count(":") == 1:
        return host.split(":", 1)[0]
    return host


def is_loopback_host(host_header: str) -> bool:
    host = _extract_host(host_header)
    if host in {"localhost", "localhost."}:
        return True
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False


def should_allow_without_access_token(host_header: str) -> bool:
    return is_loopback_host(host_header)
