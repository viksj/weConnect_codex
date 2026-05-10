const dictionary = {
  hi: {
    en: {
      // Greetings
      "kaise ho?": "How are you?",
      "kaise ho": "How are you?",
      "kaise hain?": "How are you?",
      "kaise hain": "How are you?",
      "aap kaise ho?": "How are you?",
      "aap kaise hain?": "How are you?",
      "tu kaise ho?": "How are you?",
      "namaste": "Hello",
      "Hello": "Hello",
      "hi": "Hi",
      "hello": "Hello",
      
      // Common responses
      "main theek hoon": "I am fine",
      "main theek hun": "I am fine",
      "theek hun": "I am fine",
      "bilkul theek": "All good",
      "sab theek hai": "Everything is fine",
      
      // Activities
      "kya kar rahe ho?": "What are you doing?",
      "kya kar raha hain?": "What are you doing?",
      "kya kar rahi hain?": "What are you doing?",
      "kya kar raha hun?": "What am I doing?",
      "kya kar rahe hain?": "What are you doing?",
      "kya kar rahi ho?": "What are you doing?",
      
      // Calling
      "call kar sakte ho?": "Can you call?",
      "call kar sakte hain?": "Can you call?",
      "call karo": "Call me",
      "phone karo": "Call me",
      "video call": "Video call",
      "voice call": "Voice call",
      
      // Gratitude
      "dhanyavaad": "Thank you",
      "thank you": "Thank you",
      "shukriya": "Thank you",
      "bahut shukriya": "Thank you very much",
      
      // Common phrases
      "haan": "Yes",
      "ha": "Yes",
      "haan bilkul": "Yes definitely",
      "na": "No",
      "nahi": "No",
      "bilkul nahi": "Absolutely not",
      "ok": "OK",
      "theek hai": "OK",
      "thik hai": "OK",
      "bilkul": "Sure",
      "jarur": "Sure",
      "acha": "OK",
      "achha": "OK",
      
      // Questions
      "tu kon ho?": "Who are you?",
      "aap kon hain?": "Who are you?",
      "tera naam kya hai?": "What is your name?",
      "aapka naam kya hai?": "What is your name?",
      "kya naam hai?": "What is the name?",
      "yeh kya hai?": "What is this?",
      "ye kya hai": "What is this?",
      "mujhe pani chahiye": "I need water",
      "pani chahiye": "I need water",
      "kahan ho?": "Where are you?",
      "kahan hain?": "Where are you?",
      "kab call karoge?": "When will you call?",
      "kab milengo?": "When will we meet?",
      
      // Casual responses
      "theek aa gaya": "All done",
      "ho gaya": "Done",
      "haan haan": "Yes yes",
      "achcha theek": "OK fine",
      "badaa": "Later",
      "baad mein": "Later",
      "abhi": "Now",
      "ek dum": "Right away",
      "jaldi": "Soon",
      "bahut jaldi": "Very soon",
      
      // Emotions
      "khush hoon": "I am happy",
      "dukhi hoon": "I am sad",
      "gussa ho gaya": "I am angry",
      "ukhad ho gaya": "I am tired",
      "neend aa gai": "I am sleepy",
      "bhukh lagi": "I am hungry",
      "pyaas lagi": "I am thirsty"
    }
  },
  en: {
    hi: {
      // Greetings
      "how are you?": "आप कैसे हैं?",
      "how are you": "आप कैसे हैं?",
      "hello": "नमस्ते",
      "hi": "नमस्ते",
      "hey": "नमस्ते",
      
      // Common responses
      "i am fine": "मैं ठीक हूँ",
      "i am good": "मैं ठीक हूँ",
      "all good": "सब ठीक है",
      "everything is fine": "सब कुछ ठीक है",
      
      // Activities
      "what are you doing?": "आप क्या कर रहे हैं?",
      "what are you up to?": "आप क्या कर रहे हैं?",
      "what is he doing?": "वह क्या कर रहा है?",
      
      // Calling
      "can you call?": "क्या आप कॉल कर सकते हैं?",
      "call me": "मुझे कॉल करो",
      "give me a call": "मुझे कॉल करो",
      "video call": "विडियो कॉल",
      "voice call": "आवाज़ कॉल",
      
      // Gratitude
      "thank you": "धन्यवाद",
      "thanks": "धन्यवाद",
      "thank you very much": "बहुत-बहुत धन्यवाद",
      "thanks a lot": "बहुत धन्यवाद",
      
      // Common phrases
      "yes": "हाँ",
      "no": "नहीं",
      "of course": "बिल्कुल",
      "sure": "ज़रूर",
      "ok": "ठीक है",
      "okay": "ठीक है",
      
      // Questions
      "who are you?": "आप कौन हैं?",
      "what is your name?": "आपका नाम क्या है?",
      "i need water": "मुझे पानी चाहिए",
      "i want water": "मुझे पानी चाहिए",
      "where are you?": "आप कहां हैं?",
      "when will you call?": "आप कब कॉल करोगे?",
      "when will we meet?": "हम कब मिलेंगे?"
    }
  }
};

const romanHindiHints = [
  "kaise",
  "kya",
  "kar",
  "rahe",
  "raha",
  "rahi",
  "hain",
  "hoon",
  "hun",
  "aap",
  "tum",
  "mujhe",
  "pani",
  "chahiye",
  "namaste",
  "dhanyavaad",
  "shukriya",
  "haan",
  "nahi",
  "theek",
  "thik",
  "kahan",
  "kab",
  "kaun",
  "kon"
];

function normalizeText(text) {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

function stripPunctuation(text) {
  return text.replace(/[?!,.;:]/g, "").trim();
}

function tokenize(text) {
  return stripPunctuation(normalizeText(text)).split(" ").filter(Boolean);
}

function containsTokenSequence(textTokens, phraseTokens) {
  if (phraseTokens.length === 0 || phraseTokens.length > textTokens.length) return false;

  return textTokens.some((_, index) =>
    phraseTokens.every((phraseToken, phraseIndex) => textTokens[index + phraseIndex] === phraseToken)
  );
}

function hasPhrase(text, phrase) {
  const textTokens = tokenize(text);
  const phraseTokens = tokenize(phrase);
  return containsTokenSequence(textTokens, phraseTokens);
}

export function detectLanguage(text, fallback = "en") {
  if (/[\u0900-\u097F]/.test(text)) return "hi";

  const tokens = tokenize(text);
  if (romanHindiHints.some((hint) => tokens.includes(hint))) {
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

async function translateWithMyMemory(text, fromLanguage, toLanguage) {
  const response = await fetch(
    `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${fromLanguage}|${toLanguage}`
  );

  if (!response.ok) {
    throw new Error(`MyMemory translation failed with ${response.status}`);
  }

  const body = await response.json();
  if (body.responseStatus === 200 && body.responseData?.translatedText) {
    return body.responseData.translatedText;
  }

  throw new Error(`MyMemory returned status ${body.responseStatus}`);
}

async function translateWithOpenAI(text, fromLanguage, toLanguage) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: process.env.OPENAI_TRANSLATION_MODEL || "gpt-4.1-mini",
      input: [
        {
          role: "system",
          content:
            "Translate the user's message only. Preserve tone, intent, names, emojis, and formatting. Return only translated text."
        },
        {
          role: "user",
          content: `Source language: ${fromLanguage}\nTarget language: ${toLanguage}\nMessage: ${text}`
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI translation failed with ${response.status}`);
  }

  const body = await response.json();
  return body.output_text?.trim() || null;
}

async function translateWithProvider(provider, text, fromLanguage, toLanguage) {
  if (provider === "openai") {
    return translateWithOpenAI(text, fromLanguage, toLanguage);
  }

  if (provider === "libretranslate") {
    return translateWithLibreTranslate(text, fromLanguage, toLanguage);
  }

  if (provider === "mymemory") {
    return translateWithMyMemory(text, fromLanguage, toLanguage);
  }

  return null;
}

async function translateWithConfiguredProviders(text, fromLanguage, toLanguage) {
  const configuredProvider = process.env.TRANSLATION_PROVIDER || "local";
  const providers = [];

  if (configuredProvider !== "local") {
    providers.push(configuredProvider);
  }

  if (
    process.env.ENABLE_PUBLIC_TRANSLATION_FALLBACK !== "false" &&
    configuredProvider !== "mymemory" &&
    configuredProvider !== "local"
  ) {
    providers.push("mymemory");
  }

  for (const provider of providers) {
    const providerTranslation = await translateWithProvider(provider, text, fromLanguage, toLanguage).catch((error) => {
      console.error(`${provider} translation failed, using next fallback`, error);
      return null;
    });
    if (providerTranslation) return providerTranslation;
  }

  return null;
}

export async function translateText(text, fromLanguage, toLanguage) {
  if (!text || fromLanguage === toLanguage) return text;

  const providerTranslation = await translateWithConfiguredProviders(text, fromLanguage, toLanguage);
  if (providerTranslation) return providerTranslation;

  // Normalize text: lowercase, trim, remove extra spaces, handle punctuation
  const normalized = normalizeText(text);
  
  // Try exact match first
  let translated = dictionary[fromLanguage]?.[toLanguage]?.[normalized];
  if (translated) return translated;

  // Try matching without punctuation
  const noPunctuation = normalized.replace(/[?!,.;:]/g, "").trim();
  translated = dictionary[fromLanguage]?.[toLanguage]?.[noPunctuation];
  if (translated) return translated;

  // Try partial matching - look for phrases that contain the text
  const dictPhrases = dictionary[fromLanguage]?.[toLanguage];
  if (dictPhrases) {
    for (const [key, value] of Object.entries(dictPhrases)) {
      const keyNormalized = stripPunctuation(normalizeText(key));
      const testNormalized = noPunctuation;
      const keyTokens = tokenize(keyNormalized);
      
      if (keyTokens.length > 1 && (hasPhrase(testNormalized, keyNormalized) || hasPhrase(keyNormalized, testNormalized))) {
        return value;
      }
    }
  }

  const label = `${fromLanguage.toUpperCase()} -> ${toLanguage.toUpperCase()}`;
  return `[${label}] ${text}`;
}
