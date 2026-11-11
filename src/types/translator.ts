export interface Language {
  code: string;        // e.g. 'es-ES', 'en-US'
  iso: string;         // e.g. 'es', 'en'
  name: string;        // 'Español'
  nativeName: string;  // 'Español'
  flag: string;        // '🇪🇸'
  popular?: boolean;
}

export interface ConversationTurn {
  id: string;
  speaker: 'user' | 'partner';
  originalText: string;
  translatedText: string;
  sourceLang: string;
  targetLang: string;
  detectedLanguage?: string;
  phonetic?: string;
  nuance?: string | null;
  alternatives?: string[];
  audioBase64?: string;
  timestamp: number;
}

export type ViewMode = 'chat' | 'facetoface' | 'fullscreen';

export interface TranslatorSettings {
  autoSpeak: boolean;
  voiceSpeed: number; // 0.8, 1.0, 1.2
  useAiVoice: boolean; // Gemini TTS vs Browser native
  voiceName: string; // 'Kore', 'Puck', etc.
  continuousListen: boolean; // Auto-listen after speech
  fontSize: 'normal' | 'large' | 'huge';
  hapticFeedback: boolean;
}
