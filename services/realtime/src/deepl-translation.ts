const DEEPL_FREE_API_URL = "https://api-free.deepl.com/v2/translate";
const DEEPL_PAID_API_URL = "https://api.deepl.com/v2/translate";
const DEFAULT_TIMEOUT_MS = 5_000;

interface DeepLResponse {
  translations?: Array<{ text: string; detected_source_language: string }>;
}

function getDeepLApiUrl(apiKey: string): string {
  // Free keys end with ":fx"
  return apiKey.endsWith(":fx") ? DEEPL_FREE_API_URL : DEEPL_PAID_API_URL;
}

export async function translateWithDeepL(
  text: string,
  apiKey: string,
  targetLang = "KO",
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<string | null> {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(getDeepLApiUrl(apiKey), {
      method: "POST",
      headers: {
        Authorization: `DeepL-Auth-Key ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: [trimmed], target_lang: targetLang }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as DeepLResponse;
    return data.translations?.[0]?.text ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
