from __future__ import annotations

import unittest

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


if __name__ == "__main__":
    unittest.main()
