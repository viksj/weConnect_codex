import { detectLanguage, translateText } from "../server/src/translationService.js";

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}. Expected "${expected}", got "${actual}"`);
  }
}

process.env.TRANSLATION_PROVIDER = "local";

assertEqual(detectLanguage("Kaise ho?", "en"), "hi", "Roman Hindi greeting should be detected");
assertEqual(detectLanguage("mujhe pani chahiye", "en"), "hi", "Roman Hindi sentence should be detected");
assertEqual(detectLanguage("this is fine", "en"), "en", "English text should keep fallback language");

assertEqual(await translateText("Kaise ho?", "hi", "en"), "How are you?", "Known Hindi phrase should translate");
assertEqual(
  await translateText("mujhe pani chahiye", "hi", "en"),
  "I need water",
  "Roman Hindi should not accidentally match short English greeting keys"
);
assertEqual(await translateText("I need water", "en", "hi"), "मुझे पानी चाहिए", "English phrase should translate");

console.log("Translation service test passed.");
