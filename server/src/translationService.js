const dictionary = {
  hi: {
    en: {
      "kaise ho?": "How are you?",
      "aap kaise ho?": "How are you?",
      "namaste": "Hello",
      "main theek hoon": "I am fine",
      "kya kar rahe ho?": "What are you doing?",
      "call kar sakte ho?": "Can you call?",
      "dhanyavaad": "Thank you"
    }
  },
  en: {
    hi: {
      "how are you?": "आप कैसे हैं?",
      "hello": "नमस्ते",
      "i am fine": "मैं ठीक हूँ",
      "what are you doing?": "आप क्या कर रहे हैं?",
      "can you call?": "क्या आप कॉल कर सकते हैं?",
      "thank you": "धन्यवाद"
    }
  }
};

export function detectLanguage(text, fallback = "en") {
  if (/[\u0900-\u097F]/.test(text)) return "hi";

  const normalized = text.trim().toLowerCase();
  const hindiRomanPhrases = dictionary.hi.en;
  if (Object.keys(hindiRomanPhrases).some((phrase) => normalized.includes(phrase.replace("?", "")))) {
    return "hi";
  }

  return fallback;
}

async function translateWithLibreTranslate(text, fromLanguage, toLanguage) {
  const url = process.env.LIBRE_TRANSLATE_URL;
  if (!url) return null;

  const response = await fetch(`${url.replace(/\/$/, "")}/translate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      q: text,
      source: fromLanguage,
      target: toLanguage,
      format: "text",
      api_key: process.env.LIBRE_TRANSLATE_API_KEY || undefined
    })
  });

  if (!response.ok) {
    throw new Error(`Translation provider failed with ${response.status}`);
  }

  const body = await response.json();
  return body.translatedText || null;
}

export async function translateText(text, fromLanguage, toLanguage) {
  if (!text || fromLanguage === toLanguage) return text;

  if (process.env.TRANSLATION_PROVIDER === "libretranslate") {
    const providerTranslation = await translateWithLibreTranslate(text, fromLanguage, toLanguage).catch((error) => {
      console.error("Translation provider failed, using local fallback", error);
      return null;
    });
    if (providerTranslation) return providerTranslation;
  }

  const normalized = text.trim().toLowerCase();
  const translated = dictionary[fromLanguage]?.[toLanguage]?.[normalized];

  if (translated) return translated;

  const label = `${fromLanguage.toUpperCase()} -> ${toLanguage.toUpperCase()}`;
  return `[${label}] ${text}`;
}
