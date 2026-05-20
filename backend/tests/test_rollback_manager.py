import unittest
from app.core.snapshot_utils import snapshot_to_dict


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
