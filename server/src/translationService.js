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

export function translateText(text, fromLanguage, toLanguage) {
  if (!text || fromLanguage === toLanguage) return text;

  const normalized = text.trim().toLowerCase();
  const translated = dictionary[fromLanguage]?.[toLanguage]?.[normalized];

  if (translated) return translated;

  const label = `${fromLanguage.toUpperCase()} -> ${toLanguage.toUpperCase()}`;
  return `[${label}] ${text}`;
}
