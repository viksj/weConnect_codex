/**
 * Voice Translator - Converts text to speech with language support
 * Uses Web Speech API SpeechSynthesis
 */

const LANGUAGE_VOICES = {
  hi: "hi-IN",    // Hindi
  en: "en-IN",    // English (India)
  te: "te-IN",    // Telugu
  ta: "ta-IN",    // Tamil
  kn: "kn-IN",    // Kannada
  ml: "ml-IN",    // Malayalam
  mr: "mr-IN",    // Marathi
  gu: "gu-IN",    // Gujarati
  bn: "bn-IN",    // Bengali
  pa: "pa-IN",    // Punjabi
  es: "es-ES",    // Spanish
  fr: "fr-FR",    // French
  de: "de-DE",    // German
};

let currentUtterance = null;

export function playVoiceTranslation(text, language = "en", rate = 1, pitch = 1, volume = 0.8) {
  // Stop any currently playing audio
  if (currentUtterance) {
    window.speechSynthesis.cancel();
  }

  if (!text || !("speechSynthesis" in window)) {
    console.warn("Speech synthesis not supported or empty text");
    return;
  }

  const utterance = new SpeechSynthesisUtterance(text);
  
  // Set language
  const voiceCode = LANGUAGE_VOICES[language] || "en-IN";
  utterance.lang = voiceCode;
  
  // Set voice properties
  utterance.rate = Math.min(Math.max(rate, 0.5), 2); // 0.5 to 2
  utterance.pitch = Math.min(Math.max(pitch, 0.5), 2); // 0.5 to 2
  utterance.volume = Math.min(Math.max(volume, 0), 1); // 0 to 1

  // Optional: Select specific voice if available
  const voices = window.speechSynthesis.getVoices();
  const preference = voices.find(v => v.lang.startsWith(voiceCode.split("-")[0]));
  if (preference) {
    utterance.voice = preference;
  }

  // Event handlers
  utterance.onstart = () => {
    console.log("Voice playback started for:", language);
  };

  utterance.onend = () => {
    console.log("Voice playback ended");
    currentUtterance = null;
  };

  utterance.onerror = (event) => {
    console.error("Speech synthesis error:", event.error);
    currentUtterance = null;
  };

  currentUtterance = utterance;
  window.speechSynthesis.speak(utterance);
}

export function stopVoicePlayback() {
  if (window.speechSynthesis.speaking) {
    window.speechSynthesis.cancel();
    currentUtterance = null;
  }
}

export function isPlayingVoice() {
  return window.speechSynthesis?.speaking || false;
}

export function pauseVoicePlayback() {
  if (window.speechSynthesis.speaking) {
    window.speechSynthesis.pause();
  }
}

export function resumeVoicePlayback() {
  if (window.speechSynthesis.paused) {
    window.speechSynthesis.resume();
  }
}

/**
 * Get available voices for a language
 */
export function getAvailableVoices(language) {
  const voices = window.speechSynthesis?.getVoices() || [];
  const voiceCode = LANGUAGE_VOICES[language] || language;
  return voices.filter(v => v.lang.includes(voiceCode.split("-")[0]));
}

/**
 * Ensure voices are loaded before using them
 */
export async function ensureVoicesLoaded() {
  return new Promise((resolve) => {
    if (!("speechSynthesis" in window)) {
      resolve([]);
      return;
    }

    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      resolve(voices);
      return;
    }

    window.speechSynthesis.onvoiceschanged = () => {
      resolve(window.speechSynthesis.getVoices());
    };
  });
}
