import unittest
import sys
import types
from unittest.mock import patch

from app.core.snapshot_utils import snapshot_to_dict

fake_database = types.ModuleType("app.db.database")
fake_database.Snapshot = object
sys.modules.setdefault("app.db.database", fake_database)
fake_docker_manager_module = types.ModuleType("app.core.docker_manager")
fake_docker_manager_module.docker_manager = None
sys.modules.setdefault("app.core.docker_manager", fake_docker_manager_module)

from app.core.rollback_manager import rollback_manager


class SnapshotRow:
    id = 7
    name = "部署前 - demo"
    description = "部署 demo 前自动快照"
    containers = [{"name": "web"}]
    created_at = None
    is_auto = True
    compose_project = "demo"


class RollbackManagerTest(unittest.TestCase):
    def test_snapshot_dict_includes_compose_project(self):
        data = snapshot_to_dict(SnapshotRow())

        self.assertEqual(data["id"], 7)
        self.assertEqual(data["compose_project"], "demo")
        self.assertEqual(data["container_count"], 1)

    def test_app_scoped_rollback_does_not_remove_other_projects(self):
        class Snapshot:
            id = 1
            compose_project = "demo"
            containers = [
                {"name": "demo-web", "full_id": "demo-web-1", "status": "running"},
                {"name": "other-db", "full_id": "other-db-1", "status": "running"},
            ]
            volumes = [{"name": "demo_data"}]

        class FakeDockerManager:
            def __init__(self):
                self.removed_containers = []
                self.removed_volumes = []

            async def list_containers(self, all=True):
                return [
                    {
                        "name": "demo-web",
                        "full_id": "demo-web-1",
                        "status": "running",
                        "labels": {"com.docker.compose.project": "demo"},
                    },
                    {
                        "name": "demo-worker",
                        "full_id": "demo-worker-2",
                        "status": "running",
                        "labels": {"com.docker.compose.project": "demo"},
                    },
                    {
                        "name": "other-worker",
                        "full_id": "other-worker-2",
                        "status": "running",
                        "labels": {"com.docker.compose.project": "other"},
                    },
                ]

            async def stop_container(self, container_id):
                return True

            async def remove_container(self, container_id, force=False):
                self.removed_containers.append(container_id)
                return True

            async def start_container(self, container_id):
                return True

            async def list_volumes(self):
                return [
                    {"name": "demo_new_data", "labels": {"com.docker.compose.project": "demo"}},
                    {"name": "other_new_data", "labels": {"com.docker.compose.project": "other"}},
                ]

            async def remove_volume(self, name):
                self.removed_volumes.append(name)
                return True

        fake_docker = FakeDockerManager()

        async def fake_get_snapshot(db, snapshot_id):
            return Snapshot()

        async def run():
            with patch.object(rollback_manager, "get_snapshot", fake_get_snapshot):
                with patch("app.core.rollback_manager.docker_manager", fake_docker):
                    return await rollback_manager.rollback_to(None, 1, keep_volumes=False)

        import asyncio

        result = asyncio.run(run())

        self.assertEqual(result["removed"], ["demo-worker"])
        self.assertEqual(fake_docker.removed_containers, ["demo-worker-2"])
        self.assertEqual(fake_docker.removed_volumes, ["demo_new_data"])
