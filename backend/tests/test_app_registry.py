import unittest

from app.core.app_registry import build_app_record


class AppRegistryTest(unittest.TestCase):
    def test_builds_app_record_from_deploy_result(self):
        record = build_app_record(
            name="Open WebUI",
            compose_project="open-webui",
            work_dir="/opt/docker-projects/open-webui",
            compose_path="/opt/docker-projects/open-webui/docker-compose.yml",
            env_path="/opt/docker-projects/open-webui/.env",
            source_url="https://github.com/open-webui/open-webui",
            access_urls=[
                {"service": "web", "url": "http://localhost:18080"},
            ],
        )

        self.assertEqual(record["name"], "Open WebUI")
        self.assertEqual(record["compose_project"], "open-webui")
        self.assertEqual(record["work_dir"], "/opt/docker-projects/open-webui")
        self.assertEqual(record["access_urls"][0]["url"], "http://localhost:18080")
        self.assertEqual(record["status"], "running")
