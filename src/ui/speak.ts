/**
 * Danish pronunciation via the device's built-in TTS (Web Speech API).
 * No assets, works offline on phones with a Danish voice installed;
 * silently unavailable elsewhere.
 */

export function canSpeak(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

// Voice lists load asynchronously on iOS/Android — cache on voiceschanged so
// the first tap already finds the Danish voice.
let cachedVoice: SpeechSynthesisVoice | undefined

function refreshVoice(): void {
  const voices = window.speechSynthesis.getVoices()
  cachedVoice =
    voices.find((v) => v.lang.toLowerCase() === 'da-dk') ??
    voices.find((v) => v.lang.toLowerCase().startsWith('da'))
}

if (canSpeak()) {
  refreshVoice()
  window.speechSynthesis.addEventListener?.('voiceschanged', refreshVoice)
}

export function speakDanish(text: string): void {
  if (!canSpeak()) return
  const synth = window.speechSynthesis
  const go = () => {
    if (!cachedVoice) refreshVoice()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'da-DK'
    if (cachedVoice) utterance.voice = cachedVoice
    utterance.rate = 0.88 // a touch slower for learners
    synth.speak(utterance)
  }
  // WebKit quirk: an utterance queued synchronously after cancel() is often
  // silently dropped — give the engine a beat to tear down first.
  if (synth.speaking || synth.pending) {
    synth.cancel()
    setTimeout(go, 90)
  } else {
    go()
  }
}
