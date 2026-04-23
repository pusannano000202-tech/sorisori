from __future__ import annotations

import unittest
from unittest import mock

import main as local_ai_main


class TextProcessingTests(unittest.TestCase):
    def test_normalize_text_for_display_collapses_noise(self):
        raw = "Hello   world  !!!\n\nThis   is  a  test  ..."
        normalized = local_ai_main._normalize_text_for_display(raw)
        self.assertEqual(normalized, "Hello world! This is a test.")

    def test_split_translation_chunks_prefers_sentence_boundaries(self):
        text = (
            "This is the first sentence. "
            "This is the second sentence with a little more detail. "
            "This is the third sentence."
        )

        chunks = local_ai_main._split_translation_chunks(text, max_chars=60)

        self.assertGreaterEqual(len(chunks), 2)
        self.assertTrue(all(len(chunk) <= 60 for chunk in chunks))
        self.assertTrue(chunks[0].endswith("."))

    def test_translate_route_passthroughs_hangul_for_korean_source(self):
        request = local_ai_main.TranslateRequest(text="  안녕하세요   여러분!  ", source_lang="ko")
        response = local_ai_main.translate(request)
        self.assertEqual(response.translatedText, "안녕하세요 여러분!")

    def test_translate_route_prefers_argos_when_available(self):
        request = local_ai_main.TranslateRequest(text="Hello everyone.", source_lang="en")

        with mock.patch.object(local_ai_main, "_argos_ready", True), \
             mock.patch.object(local_ai_main, "_mt_ready", True), \
             mock.patch.object(local_ai_main, "_translate_with_argos", return_value="안녕하세요 여러분."), \
             mock.patch.object(
                 local_ai_main,
                 "_translate_in_chunks",
                 side_effect=AssertionError("Marian fallback should not run when Argos succeeds."),
             ):
            response = local_ai_main.translate(request)

        self.assertEqual(response.translatedText, "안녕하세요 여러분.")

    def test_translate_route_falls_back_to_english_path_for_non_english_transcript(self):
        request = local_ai_main.TranslateRequest(
            text="Today we will examine operational stability.",
            source_lang="ja",
        )

        calls: list[tuple[str, str, str]] = []

        def fake_argos(text: str, src_lang: str, target_lang: str):
            calls.append((text, src_lang, target_lang))
            if src_lang == "en":
                return "오늘은 운영 안정성을 살펴봅니다."
            return None

        with mock.patch.object(local_ai_main, "_argos_ready", True), \
             mock.patch.object(local_ai_main, "_mt_ready", False), \
             mock.patch.object(local_ai_main, "_translate_with_argos", side_effect=fake_argos):
            response = local_ai_main.translate(request)

        self.assertEqual(response.translatedText, "오늘은 운영 안정성을 살펴봅니다.")
        self.assertEqual(calls[0][1], "ja")
        self.assertEqual(calls[1][1], "en")


if __name__ == "__main__":
    unittest.main()
