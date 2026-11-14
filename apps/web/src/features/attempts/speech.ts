// «Послушать вопрос»: the browser's speech synthesis with a Russian voice (decision 14.11.2026).
// Without a Russian voice the button is not shown at all.
import { useCallback, useEffect, useState } from 'react';

export function pickRussianVoice(
  voices: readonly SpeechSynthesisVoice[],
): SpeechSynthesisVoice | null {
  const russian = voices.filter((voice) =>
    voice.lang.toLowerCase().replace('_', '-').startsWith('ru'),
  );
  return russian.find((voice) => voice.localService) ?? russian[0] ?? null;
}

function synthesis(): SpeechSynthesis | null {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
    ? window.speechSynthesis
    : null;
}

export interface Speech {
  /** A Russian voice exists on this device. */
  readonly available: boolean;
  readonly speaking: boolean;
  readonly speak: (text: string) => void;
  readonly stop: () => void;
}

export function useSpeech(): Speech {
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(() => {
    const synth = synthesis();
    return synth ? pickRussianVoice(synth.getVoices()) : null;
  });
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    const synth = synthesis();
    if (!synth) return;
    // Voices often arrive a moment after the page loads.
    const update = () => setVoice(pickRussianVoice(synth.getVoices()));
    update();
    synth.addEventListener('voiceschanged', update);
    return () => {
      synth.removeEventListener('voiceschanged', update);
      synth.cancel();
    };
  }, []);

  const stop = useCallback(() => {
    synthesis()?.cancel();
    setSpeaking(false);
  }, []);

  const speak = useCallback(
    (text: string) => {
      const synth = synthesis();
      if (!synth || !voice) return;
      synth.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.voice = voice;
      utterance.lang = voice.lang || 'ru-RU';
      utterance.rate = 0.95;
      utterance.onend = () => setSpeaking(false);
      utterance.onerror = () => setSpeaking(false);
      setSpeaking(true);
      synth.speak(utterance);
    },
    [voice],
  );

  return { available: voice !== null, speaking, speak, stop };
}

/** «Вопрос 1 из 3. Сколько будет 2 + 2? Вариант А: 4. Вариант Б: 5. …» */
export function questionSpeech(
  index: number,
  total: number,
  text: string,
  options: readonly { readonly letter: string; readonly text: string }[],
): string {
  const variants = options.map((option) => `Вариант ${option.letter}: ${option.text}.`);
  return [
    `Вопрос ${index} из ${total}.`,
    text.trim().replace(/[.?!]?$/, (end) => end || '.'),
    ...variants,
  ].join(' ');
}
