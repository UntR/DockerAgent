import unittest

from app.core.access_control import is_loopback_host, should_allow_without_access_token


class SecurityDefaultsTest(unittest.TestCase):
    def test_loopback_hosts_are_local(self):
        self.assertTrue(is_loopback_host("localhost:8088"))
        self.assertTrue(is_loopback_host("127.0.0.1:8088"))
        self.assertTrue(is_loopback_host("[::1]:8088"))

    def test_non_loopback_hosts_are_not_local(self):
        self.assertFalse(is_loopback_host("example.com"))
        self.assertFalse(is_loopback_host("192.168.1.10:8088"))
        self.assertFalse(is_loopback_host(""))

    def test_localhost_is_allowed_without_access_token(self):
        self.assertTrue(should_allow_without_access_token("localhost:8088", "127.0.0.1"))
        self.assertTrue(should_allow_without_access_token("[::1]:8088", "::1"))

    def test_non_local_host_is_rejected_without_access_token(self):
        self.assertFalse(should_allow_without_access_token("example.com", "127.0.0.1"))

    def test_spoofed_localhost_host_is_rejected_without_access_token(self):
        self.assertFalse(should_allow_without_access_token("localhost:8088", "203.0.113.10"))

    def test_missing_client_host_is_rejected_without_access_token(self):
        self.assertFalse(should_allow_without_access_token("localhost:8088", ""))
