import unittest

from app.core.deploy_plan import build_deployment_plan


class DeployPlanTest(unittest.TestCase):
    def test_builds_structured_plan_from_github_analysis(self):
        analysis = {
            "type": "github",
            "repo": "demo-app",
            "repo_url": "https://github.com/example/demo-app",
            "compose_content": """
services:
  web:
    image: nginx
    ports:
      - "127.0.0.1:18080:80"
    environment:
      - APP_SECRET=${APP_SECRET}
""",
            "env_config": {
                "required": [{"key": "APP_SECRET", "description": "应用密钥"}],
                "optional": [{"key": "APP_PORT", "default": "18080"}],
            },
        }

        plan = build_deployment_plan(
            source="https://github.com/example/demo-app",
            description="部署测试应用",
            analysis=analysis,
            env_vars={"APP_SECRET": "secret-value"},
            projects_base_dir="/opt/docker-projects",
            occupied_ports=set(),
        )

        self.assertEqual(plan["app_name"], "demo-app")
        self.assertEqual(plan["compose_project"], "demo-app")
        self.assertEqual(plan["work_dir"], "/opt/docker-projects/demo-app")
        self.assertEqual(plan["files"][0]["path"], "/opt/docker-projects/demo-app/docker-compose.yml")
        self.assertEqual(plan["files"][1]["path"], "/opt/docker-projects/demo-app/.env")
        self.assertEqual(plan["env"]["required"][0]["key"], "APP_SECRET")
        self.assertEqual(plan["env"]["provided_keys"], ["APP_SECRET"])
        self.assertEqual(plan["access_urls"][0]["url"], "http://localhost:18080")

    def test_missing_compose_marks_plan_not_deployable(self):
        plan = build_deployment_plan(
            source="nginx",
            description=None,
            analysis={"type": "docker_image"},
            env_vars={},
            projects_base_dir="/opt/docker-projects",
            occupied_ports=set(),
        )

        self.assertFalse(plan["deployable"])
        self.assertEqual(plan["warnings"][0]["code"], "missing_compose")
