/**
 * Danish pronunciation via the device's built-in TTS (Web Speech API).
 * No assets, works offline on phones with a Danish voice installed;
 * silently unavailable elsewhere.
 */

export function canSpeak(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

function danishVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices()
  return (
    voices.find((v) => v.lang.toLowerCase() === 'da-dk') ??
    voices.find((v) => v.lang.toLowerCase().startsWith('da'))
  )
}

export function speakDanish(text: string): void {
  if (!canSpeak()) return
  const synth = window.speechSynthesis
  synth.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'da-DK'
  const voice = danishVoice()
  if (voice) utterance.voice = voice
  utterance.rate = 0.88 // a touch slower for learners
  synth.speak(utterance)
}

// Some browsers populate the voice list asynchronously; poke it once so the
// first tap already finds the Danish voice.
if (canSpeak()) window.speechSynthesis.getVoices()
