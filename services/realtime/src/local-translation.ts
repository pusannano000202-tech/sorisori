const DEFAULT_TIMEOUT_MS = 5_000;

interface LocalTranslateResponse {
  translatedText?: string;
}

export async function translateWithLocalAi(
  text: string,
  baseUrl: string,
  targetLang = "ko",
  sourceLang = "en",
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<string | null> {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: trimmed, target_lang: targetLang, source_lang: sourceLang }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as LocalTranslateResponse;
    return data.translatedText ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
