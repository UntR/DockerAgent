import unittest

from app.api.settings import _get_domain_builtin_models


class SettingsProviderModelsTest(unittest.TestCase):
    def test_known_openai_compatible_domains_have_model_fallbacks(self):
        cases = {
            "https://api.deepseek.com": "deepseek-v4-flash",
            "https://api.minimax.io/v1": "MiniMax-M2.7",
            "https://api.siliconflow.com/v1": "deepseek-ai/DeepSeek-V3.2",
            "https://ark.cn-beijing.volces.com/api/v3": "doubao-seed-1-8-251228",
            "https://dashscope.aliyuncs.com/compatible-mode/v1": "qwen3.6-plus",
            "https://open.bigmodel.cn/api/paas/v4": "glm-4.7",
            "https://api.moonshot.cn/v1": "kimi-k2.6",
            "https://openrouter.ai/api/v1": "openrouter/auto",
            "https://api.groq.com/openai/v1": "openai/gpt-oss-120b",
            "https://integrate.api.nvidia.com/v1": "openai/gpt-oss-120b",
        }

        for base_url, expected_model in cases.items():
            with self.subTest(base_url=base_url):
                self.assertIn(expected_model, _get_domain_builtin_models(base_url) or [])

    def test_unknown_domain_has_no_model_fallback(self):
        self.assertIsNone(_get_domain_builtin_models("https://example.com/v1"))

    def test_domain_matching_does_not_use_substring_matches(self):
        self.assertIsNone(_get_domain_builtin_models("https://deepseek.com.example/v1"))
