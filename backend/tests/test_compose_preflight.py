import unittest

from app.core.compose_preflight import analyze_compose


class ComposePreflightTest(unittest.TestCase):
    def test_warns_for_public_port_and_docker_socket_mount(self):
        result = analyze_compose(
            """
services:
  app:
    image: nginx
    ports:
      - "8080:80"
    volumes:
      - "/var/run/docker.sock:/var/run/docker.sock"
"""
        )

        codes = {w["code"] for w in result["warnings"]}
        self.assertIn("public_port_binding", codes)
        self.assertIn("docker_socket_mount", codes)

    def test_warns_for_missing_env_reference(self):
        result = analyze_compose(
            """
services:
  app:
    image: example/app
    environment:
      - APP_SECRET=${APP_SECRET}
""",
            env_vars={},
        )

        self.assertEqual(result["warnings"][0]["code"], "missing_env_value")
        self.assertIn("APP_SECRET", result["warnings"][0]["message"])

    def test_extracts_localhost_access_urls(self):
        result = analyze_compose(
            """
services:
  web:
    image: nginx
    ports:
      - "127.0.0.1:18080:80"
"""
        )

        self.assertEqual(result["access_urls"][0]["url"], "http://localhost:18080")
        self.assertEqual(result["access_urls"][0]["service"], "web")

    def test_warns_for_occupied_host_port(self):
        result = analyze_compose(
            """
services:
  web:
    image: nginx
    ports:
      - "18080:80"
""",
            occupied_ports={18080},
        )

        self.assertEqual(result["warnings"][0]["code"], "port_conflict")
        self.assertIn("18080", result["warnings"][0]["message"])
