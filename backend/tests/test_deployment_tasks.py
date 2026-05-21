import unittest

from app.core.deployment_tasks import deployment_task_to_dict


class DeploymentTaskRow:
    id = 3
    session_id = "session-1"
    source_url = "https://github.com/example/demo"
    app_name = "demo"
    compose_project = "demo"
    work_dir = "/opt/docker-projects/demo"
    compose_path = "/opt/docker-projects/demo/docker-compose.yml"
    env_path = "/opt/docker-projects/demo/.env"
    status = "failed"
    message = "镜像拉取失败"
    compose_output = ""
    error_output = "not found"
    access_urls = [{"service": "web", "url": "http://localhost:18080"}]
    app_id = None
    created_at = None
    updated_at = None


class DeploymentTasksTest(unittest.TestCase):
    def test_task_dict_includes_failure_context(self):
        data = deployment_task_to_dict(DeploymentTaskRow())

        self.assertEqual(data["id"], 3)
        self.assertEqual(data["status"], "failed")
        self.assertEqual(data["message"], "镜像拉取失败")
        self.assertEqual(data["error_output"], "not found")
        self.assertEqual(data["access_urls"][0]["url"], "http://localhost:18080")
