"""
WebFetch 模块：从 URL、GitHub 仓库、Docker Hub、论坛等抓取部署信息，
提取 docker-compose.yml 或 docker run 命令供 Agent 使用。
"""
import re
import os
from typing import Any, Dict, Optional
from urllib.parse import urlparse

import aiohttp
from bs4 import BeautifulSoup


GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "")


class WebFetcher:

    async def fetch_url(self, url: str) -> str:
        """通用 HTTP 抓取，返回原始文本内容。"""
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (compatible; DockerAgent/1.0; "
                "+https://github.com/docker-agent)"
            )
        }
        if GITHUB_TOKEN and "github.com" in url:
            headers["Authorization"] = f"token {GITHUB_TOKEN}"

        async with aiohttp.ClientSession() as session:
            async with session.get(url, headers=headers, timeout=aiohttp.ClientTimeout(total=20)) as resp:
                resp.raise_for_status()
                return await resp.text()

    async def fetch_github_compose(self, owner: str, repo: str, branch: str = "main") -> Optional[str]:
        """尝试从 GitHub 仓库获取 docker-compose.yml。"""
        for fname in ["docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"]:
            for br in [branch, "master", "main"]:
                url = f"https://raw.githubusercontent.com/{owner}/{repo}/{br}/{fname}"
                try:
                    return await self.fetch_url(url)
                except Exception:
                    continue
        return None

    async def fetch_github_file(self, owner: str, repo: str, path: str) -> Optional[str]:
        """从 GitHub 仓库获取指定文件内容（尝试 main/master 分支）。"""
        for br in ["main", "master"]:
            url = f"https://raw.githubusercontent.com/{owner}/{repo}/{br}/{path}"
            try:
                return await self.fetch_url(url)
            except Exception:
                continue
        return None

    def parse_env_example(self, content: str) -> Dict[str, Any]:
        """
        解析 .env.example 文件，提取变量信息，区分必填和可选。
        返回：{ required: [...], optional: [...], sections: [...] }
        """
        required = []
        optional = []
        sections: list = []
        current_section: Dict[str, Any] = {"title": "基础配置", "vars": []}
        current_comments: list = []

        # 占位符值认为是必填
        PLACEHOLDER_PATTERNS = [
            r"^$", r"^your[_\-]", r"^<.+>$", r"^xxx+",
            r"^change[_\-]?me", r"^请填写", r"^填写",
            r"^replace", r"^example\.com",
        ]

        def is_placeholder(val: str) -> bool:
            val = val.strip()
            if not val:
                return True
            for p in PLACEHOLDER_PATTERNS:
                if re.match(p, val, re.IGNORECASE):
                    return True
            return False

        for line in content.splitlines():
            stripped = line.strip()
            if not stripped:
                current_comments = []
                continue

            if stripped.startswith("#"):
                comment = stripped.lstrip("#").strip()
                if not comment or re.match(r"^[-=─━*\s]{3,}$", comment):
                    current_comments = []
                    continue
                # 短的全大写或带分隔符行视为 section 标题
                if re.match(r"^[A-Z0-9 _/-]{3,25}$", comment) and comment == comment.upper():
                    if current_section["vars"]:
                        sections.append(current_section)
                    current_section = {"title": comment, "vars": []}
                    current_comments = []
                else:
                    current_comments.append(comment)
                continue

            if "=" in stripped:
                key, _, val = stripped.partition("=")
                key = key.strip()
                val = val.strip().strip('"').strip("'")
                if not re.match(r"^[A-Z][A-Z0-9_]{1,}$", key):
                    current_comments = []
                    continue

                description = " ".join(current_comments) if current_comments else ""
                current_comments = []
                entry = {
                    "key": key,
                    "description": description,
                    "example": val,
                    "default": "" if is_placeholder(val) else val,
                }

                if is_placeholder(val):
                    required.append(entry)
                    current_section["vars"].append({**entry, "required": True})
                else:
                    optional.append(entry)
                    current_section["vars"].append({**entry, "required": False})

        if current_section["vars"]:
            sections.append(current_section)

        return {
            "required": required,
            "optional": optional,
            "sections": sections,
            "required_count": len(required),
            "optional_count": len(optional),
        }

    async def analyze_github_project(self, owner: str, repo: str) -> Dict[str, Any]:
        """
        全面分析一个 GitHub 项目的部署需求：
        获取 README 摘要、docker-compose.yml、.env.example，
        返回结构化的部署配置需求。
        """
        import asyncio

        # 并发获取多个文件
        compose_task = self.fetch_github_compose(owner, repo)
        env_task = self.fetch_github_file(owner, repo, ".env.example")
        readme_task = self.fetch_github_file(owner, repo, "README.md")

        compose_content, env_example, readme = await asyncio.gather(
            compose_task, env_task, readme_task,
            return_exceptions=True,
        )

        result: Dict[str, Any] = {
            "owner": owner,
            "repo": repo,
            "repo_url": f"https://github.com/{owner}/{repo}",
        }

        # compose
        if isinstance(compose_content, str):
            result["compose_content"] = compose_content
            result["has_compose"] = True
        else:
            result["has_compose"] = False

        # env.example 解析
        if isinstance(env_example, str):
            result["env_example_raw"] = env_example
            result["env_config"] = self.parse_env_example(env_example)
            result["has_env_example"] = True
        else:
            result["has_env_example"] = False
            result["env_config"] = {"required": [], "optional": [], "sections": []}

        # README 摘要（前 3000 字）
        if isinstance(readme, str):
            result["readme_summary"] = readme[:3000]
        else:
            result["readme_summary"] = ""

        return result

    async def fetch_dockerhub_info(self, image: str) -> Optional[Dict[str, Any]]:
        """从 Docker Hub 获取镜像信息和示例 compose。"""
        parts = image.split("/")
        if len(parts) == 1:
            namespace, name = "library", parts[0]
        else:
            namespace, name = parts[0], parts[1]

        url = f"https://hub.docker.com/v2/repositories/{namespace}/{name}/"
        try:
            content = await self.fetch_url(url)
            import json
            data = json.loads(content)
            return {
                "name": data.get("name", ""),
                "description": data.get("description", ""),
                "full_description": data.get("full_description", ""),
                "pull_count": data.get("pull_count", 0),
                "star_count": data.get("star_count", 0),
            }
        except Exception:
            return None

    async def extract_compose_from_page(self, url: str) -> Dict[str, Any]:
        """
        从任意网页（GitHub README、论坛帖子等）提取 docker-compose 内容
        或 docker run 命令。
        """
        raw = await self.fetch_url(url)
        result: Dict[str, Any] = {
            "url": url,
            "compose_blocks": [],
            "docker_run_commands": [],
            "page_text": "",
        }

        # 解析 HTML
        if raw.strip().startswith("<"):
            soup = BeautifulSoup(raw, "lxml")
            # 提取 code blocks
            code_blocks = soup.find_all(["code", "pre"])
            texts = []
            for block in code_blocks:
                text = block.get_text()
                texts.append(text)
                if "version:" in text and ("services:" in text or "image:" in text):
                    result["compose_blocks"].append(text.strip())
                cmds = re.findall(r"docker\s+run\s+[^\n]+", text)
                result["docker_run_commands"].extend(cmds)
            result["page_text"] = soup.get_text(separator="\n", strip=True)[:8000]
        else:
            # 纯文本（如 raw GitHub）
            raw_text = raw
            if "version:" in raw_text and ("services:" in raw_text or "image:" in raw_text):
                result["compose_blocks"].append(raw_text.strip())
            cmds = re.findall(r"docker\s+run\s+[^\n]+", raw_text)
            result["docker_run_commands"].extend(cmds)
            result["page_text"] = raw_text[:8000]

        return result

    async def resolve_source(self, source: str) -> Dict[str, Any]:
        """
        解析用户输入的 source（可以是 URL、GitHub owner/repo、镜像名称），
        返回尽可能多的部署相关信息。
        """
        source = source.strip()

        # 判断是否是 URL
        parsed = urlparse(source)
        if parsed.scheme in ("http", "https"):
            # GitHub 仓库 URL
            github_match = re.match(
                r"https://github\.com/([^/]+)/([^/]+)/?", source
            )
            if github_match:
                owner, repo = github_match.group(1), github_match.group(2)
                compose = await self.fetch_github_compose(owner, repo)
                page_info = await self.extract_compose_from_page(source)
                return {
                    "type": "github",
                    "owner": owner,
                    "repo": repo,
                    "compose_content": compose,
                    "page_info": page_info,
                }
            # 其他 URL（论坛、博客等）
            page_info = await self.extract_compose_from_page(source)
            return {
                "type": "webpage",
                "page_info": page_info,
            }

        # 判断是否是 owner/repo 格式
        if re.match(r"^[a-zA-Z0-9_-]+/[a-zA-Z0-9_.-]+$", source):
            owner, repo = source.split("/", 1)
            compose = await self.fetch_github_compose(owner, repo)
            hub_info = await self.fetch_dockerhub_info(source)
            return {
                "type": "github_or_image",
                "owner": owner,
                "repo": repo,
                "compose_content": compose,
                "dockerhub_info": hub_info,
            }

        # 当作 Docker 镜像名称处理
        hub_info = await self.fetch_dockerhub_info(source)
        return {
            "type": "image",
            "image": source,
            "dockerhub_info": hub_info,
        }


web_fetcher = WebFetcher()
