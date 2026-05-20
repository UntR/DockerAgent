import unittest

from app.core.confirmation import build_confirmation_required, is_confirmed


class ConfirmationTest(unittest.TestCase):
    def test_confirm_value_allows_execution(self):
        self.assertTrue(is_confirmed("confirm"))

    def test_missing_or_other_value_does_not_confirm(self):
        self.assertFalse(is_confirmed(""))
        self.assertFalse(is_confirmed("yes"))

    def test_confirmation_payload_has_required_shape(self):
        payload = build_confirmation_required(
            action="remove_container",
            target="web",
            message="删除容器 web",
        )

        self.assertEqual(payload["requires_confirmation"], True)
        self.assertEqual(payload["confirmation"]["action"], "remove_container")
        self.assertEqual(payload["confirmation"]["target"], "web")
        self.assertEqual(payload["confirmation"]["confirm_value"], "confirm")

    def test_confirmation_payload_can_include_details(self):
        payload = build_confirmation_required(
            action="deploy_with_compose",
            target="demo",
            message="写入 compose/env 并执行 Docker Compose 部署 demo",
            details={
                "kind": "compose_deploy",
                "files": ["/opt/docker-projects/demo/docker-compose.yml"],
                "access_urls": [{"service": "web", "url": "http://localhost:18080"}],
                "warnings": [{"level": "danger", "message": "端口绑定到公网"}],
            },
        )

        details = payload["confirmation"]["details"]
        self.assertEqual(details["kind"], "compose_deploy")
        self.assertEqual(details["files"][0], "/opt/docker-projects/demo/docker-compose.yml")
        self.assertEqual(details["access_urls"][0]["url"], "http://localhost:18080")
