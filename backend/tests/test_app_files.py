import os
import tempfile
import unittest

from app.core.app_files import mask_env_content, read_app_file


class AppFilesTest(unittest.TestCase):
    def test_reads_compose_file_without_masking(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "docker-compose.yml")
            with open(path, "w", encoding="utf-8") as f:
                f.write("services:\n  web:\n    image: nginx\n")

            result = read_app_file(path, "compose")

        self.assertEqual(result["kind"], "compose")
        self.assertFalse(result["masked"])
        self.assertIn("image: nginx", result["content"])

    def test_masks_env_values(self):
        content = "OPENAI_API_KEY=sk-test\n# comment\nEMPTY=\nexport TOKEN=abc\n"

        masked = mask_env_content(content)

        self.assertIn("OPENAI_API_KEY=********", masked)
        self.assertIn("# comment", masked)
        self.assertIn("EMPTY=", masked)
        self.assertIn("export TOKEN=********", masked)
        self.assertNotIn("sk-test", masked)
        self.assertNotIn("abc", masked)

    def test_reads_env_file_masked(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, ".env")
            with open(path, "w", encoding="utf-8") as f:
                f.write("PASSWORD=secret\n")

            result = read_app_file(path, "env", work_dir=tmp)

        self.assertEqual(result["kind"], "env")
        self.assertTrue(result["masked"])
        self.assertEqual(result["content"], "PASSWORD=********")

    def test_rejects_file_outside_work_dir(self):
        with tempfile.TemporaryDirectory() as app_dir, tempfile.TemporaryDirectory() as other_dir:
            path = os.path.join(other_dir, ".env")
            with open(path, "w", encoding="utf-8") as f:
                f.write("TOKEN=secret\n")

            with self.assertRaises(ValueError):
                read_app_file(path, "env", work_dir=app_dir)
