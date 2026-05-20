import unittest

from app.core.deploy_result import build_deploy_success_result


class DeployResultTest(unittest.TestCase):
    def test_success_result_includes_app_detail_path_and_access_urls(self):
        result = build_deploy_success_result(
            project_name="open-webui",
            work_dir="/opt/docker-projects/open-webui",
            access_urls=[
                {"service": "web", "url": "http://localhost:18080"},
            ],
            compose_output="Container open-webui Started",
            app_id=42,
        )

        self.assertIn("部署成功！项目 `open-webui` 已启动。", result)
        self.assertIn("应用详情：/apps/42", result)
        self.assertIn("- web: http://localhost:18080", result)
        self.assertIn("Container open-webui Started", result)

    def test_success_result_omits_app_detail_path_without_app_id(self):
        result = build_deploy_success_result(
            project_name="open-webui",
            work_dir="/opt/docker-projects/open-webui",
            access_urls=[],
            compose_output="ok",
            app_id=None,
        )

        self.assertNotIn("应用详情", result)

