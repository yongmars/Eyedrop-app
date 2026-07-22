export interface TimerChimeSettings {
  enabled: boolean;
  volume: number;
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

export const TIMER_CHIME_SETTINGS_STORAGE_KEY = "eye-drop-timer-chime-settings";
export const TIMER_CHIME_SETTINGS_CHANGED_EVENT = "eye-drop-timer-chime-settings-changed";

export const DEFAULT_TIMER_CHIME_SETTINGS: TimerChimeSettings = {
  enabled: true,
  volume: 0.5,
};

let audioContext: AudioContext | null = null;

const hasWindow = () => typeof window !== "undefined";

const sanitizeSettings = (value: unknown): TimerChimeSettings => {
  const parsed = value as Partial<TimerChimeSettings> | null;
  const volume = typeof parsed?.volume === "number" ? parsed.volume : DEFAULT_TIMER_CHIME_SETTINGS.volume;
  return {
    enabled: typeof parsed?.enabled === "boolean" ? parsed.enabled : DEFAULT_TIMER_CHIME_SETTINGS.enabled,
    volume: Math.min(1, Math.max(0, volume)),
  };
};

export const readTimerChimeSettings = (): TimerChimeSettings => {
  if (!hasWindow()) return DEFAULT_TIMER_CHIME_SETTINGS;

  const raw = localStorage.getItem(TIMER_CHIME_SETTINGS_STORAGE_KEY);
  if (!raw) return DEFAULT_TIMER_CHIME_SETTINGS;

  try {
    return sanitizeSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_TIMER_CHIME_SETTINGS;
  }
};

export const saveTimerChimeSettings = (settings: TimerChimeSettings) => {
  if (!hasWindow()) return;

  localStorage.setItem(TIMER_CHIME_SETTINGS_STORAGE_KEY, JSON.stringify(sanitizeSettings(settings)));
  window.dispatchEvent(new Event(TIMER_CHIME_SETTINGS_CHANGED_EVENT));
};

const getAudioContext = () => {
  if (!hasWindow()) return null;
  if (audioContext?.state === "closed") {
    audioContext = null;
  }
  if (audioContext) return audioContext;

  const AudioContextConstructor = window.AudioContext ?? window.webkitAudioContext;
  if (!AudioContextConstructor) return null;

  audioContext = new AudioContextConstructor();
  return audioContext;
};

const resumeAudioContext = async (context: AudioContext) => {
  if (context.state === "suspended") {
    await context.resume();
  }
  return context.state !== "closed";
};

export const prepareTimerChimeAudio = async () => {
  try {
    const context = getAudioContext();
    if (!context) return false;
    return resumeAudioContext(context);
  } catch {
    return false;
  }
};

export const playTimerChime = async (options: { force?: boolean } = {}) => {
  try {
    if (!options.force && !readTimerChimeSettings().enabled) return false;

    const context = getAudioContext();
    if (!context) return false;

    const canPlay = await resumeAudioContext(context);
    if (!canPlay) return false;

    const settings = readTimerChimeSettings();
    if (settings.volume <= 0) return true;

    const startTime = context.currentTime + 0.02;
    const masterGain = context.createGain();
    masterGain.gain.setValueAtTime(0.0001, startTime);
    masterGain.gain.exponentialRampToValueAtTime(0.32 * settings.volume, startTime + 0.03);
    masterGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.7);
    masterGain.connect(context.destination);

    const notes = [
      { frequency: 784, offset: 0 },
      { frequency: 1046.5, offset: 0.14 },
    ];

    notes.forEach((note) => {
      const oscillator = context.createOscillator();
      const noteGain = context.createGain();
      const noteStart = startTime + note.offset;
      const noteEnd = noteStart + 0.42;

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(note.frequency, noteStart);
      noteGain.gain.setValueAtTime(0.0001, noteStart);
      noteGain.gain.exponentialRampToValueAtTime(0.9, noteStart + 0.02);
      noteGain.gain.exponentialRampToValueAtTime(0.0001, noteEnd);

      oscillator.connect(noteGain);
      noteGain.connect(masterGain);
      oscillator.start(noteStart);
      oscillator.stop(noteEnd + 0.02);
    });

    return true;
  } catch {
    return false;
  }
};
