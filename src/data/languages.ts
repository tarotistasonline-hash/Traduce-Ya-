import { Language } from '../types/translator';

export const AUTO_DETECT_LANGUAGE: Language = {
  code: 'auto',
  iso: 'auto',
  name: 'Detectar idioma',
  nativeName: 'Auto-detect',
  flag: '✨',
  popular: true,
};

export const POPULAR_LANGUAGES: Language[] = [
  { code: 'es-ES', iso: 'es', name: 'Español', nativeName: 'Español', flag: '🇪🇸', popular: true },
  { code: 'en-US', iso: 'en', name: 'Inglés', nativeName: 'English (US)', flag: '🇺🇸', popular: true },
  { code: 'en-GB', iso: 'en', name: 'Inglés Británico', nativeName: 'English (UK)', flag: '🇬🇧', popular: true },
  { code: 'fr-FR', iso: 'fr', name: 'Francés', nativeName: 'Français', flag: '🇫🇷', popular: true },
  { code: 'de-DE', iso: 'de', name: 'Alemán', nativeName: 'Deutsch', flag: '🇩🇪', popular: true },
  { code: 'it-IT', iso: 'it', name: 'Italiano', nativeName: 'Italiano', flag: '🇮🇹', popular: true },
  { code: 'pt-BR', iso: 'pt', name: 'Portugués', nativeName: 'Português (Brasil)', flag: '🇧🇷', popular: true },
  { code: 'pt-PT', iso: 'pt', name: 'Portugués', nativeName: 'Português (Portugal)', flag: '🇵🇹', popular: true },
  { code: 'zh-CN', iso: 'zh', name: 'Chino Mandarín', nativeName: '中文 (简体)', flag: '🇨🇳', popular: true },
  { code: 'ja-JP', iso: 'ja', name: 'Japonés', nativeName: '日本語', flag: '🇯🇵', popular: true },
  { code: 'ko-KR', iso: 'ko', name: 'Coreano', nativeName: '한국어', flag: '🇰🇷', popular: true },
  { code: 'ru-RU', iso: 'ru', name: 'Ruso', nativeName: 'Русский', flag: '🇷🇺', popular: true },
  { code: 'ar-SA', iso: 'ar', name: 'Árabe', nativeName: 'العربية', flag: '🇸🇦', popular: true },
  { code: 'hi-IN', iso: 'hi', name: 'Hindi', nativeName: 'हिन्दी', flag: '🇮🇳', popular: true },
  { code: 'tr-TR', iso: 'tr', name: 'Turco', nativeName: 'Türkçe', flag: '🇹🇷', popular: true },
  { code: 'nl-NL', iso: 'nl', name: 'Holandés', nativeName: 'Nederlands', flag: '🇳🇱', popular: true },
  { code: 'pl-PL', iso: 'pl', name: 'Polaco', nativeName: 'Polski', flag: '🇵🇱', popular: true },
  { code: 'el-GR', iso: 'el', name: 'Griego', nativeName: 'Ελληνικά', flag: '🇬🇷', popular: true },
  { code: 'sv-SE', iso: 'sv', name: 'Sueco', nativeName: 'Svenska', flag: '🇸🇪', popular: true },
  { code: 'uk-UA', iso: 'uk', name: 'Ucraniano', nativeName: 'Українська', flag: '🇺🇦', popular: true },
  { code: 'vi-VN', iso: 'vi', name: 'Vietnamita', nativeName: 'Tiếng Việt', flag: '🇻🇳', popular: true },
  { code: 'th-TH', iso: 'th', name: 'Tailandés', nativeName: 'ไทย', flag: '🇹🇭', popular: true },
  { code: 'id-ID', iso: 'id', name: 'Indonesio', nativeName: 'Bahasa Indonesia', flag: '🇮🇩', popular: true },
  { code: 'ro-RO', iso: 'ro', name: 'Rumano', nativeName: 'Română', flag: '🇷🇴', popular: true },
  { code: 'cs-CZ', iso: 'cs', name: 'Checo', nativeName: 'Čeština', flag: '🇨🇿', popular: true },
  { code: 'hu-HU', iso: 'hu', name: 'Húngaro', nativeName: 'Magyar', flag: '🇭🇺', popular: true },
  { code: 'da-DK', iso: 'da', name: 'Danés', nativeName: 'Dansk', flag: '🇩🇰', popular: true },
  { code: 'fi-FI', iso: 'fi', name: 'Finlandés', nativeName: 'Suomi', flag: '🇫🇮', popular: true },
  { code: 'no-NO', iso: 'no', name: 'Noruego', nativeName: 'Norsk', flag: '🇳🇴', popular: true },
  { code: 'he-IL', iso: 'he', name: 'Hebreo', nativeName: 'עברית', flag: '🇮🇱', popular: true },
];

export const ALL_LANGUAGES: Language[] = [
  ...POPULAR_LANGUAGES,
  { code: 'ca-ES', iso: 'ca', name: 'Catalán', nativeName: 'Català', flag: '🏴󠁥󠁳󠁣󠁴󠁿' },
  { code: 'gl-ES', iso: 'gl', name: 'Gallego', nativeName: 'Galego', flag: '🇪🇸' },
  { code: 'eu-ES', iso: 'eu', name: 'Euskera', nativeName: 'Euskara', flag: '🇪🇸' },
  { code: 'bn-BD', iso: 'bn', name: 'Bengalí', nativeName: 'বাংলা', flag: '🇧🇩' },
  { code: 'ms-MY', iso: 'ms', name: 'Malayo', nativeName: 'Bahasa Melayu', flag: '🇲🇾' },
  { code: 'fil-PH', iso: 'fil', name: 'Filipino', nativeName: 'Tagalog', flag: '🇵🇭' },
  { code: 'bg-BG', iso: 'bg', name: 'Búlgaro', nativeName: 'Български', flag: '🇧🇬' },
  { code: 'hr-HR', iso: 'hr', name: 'Croata', nativeName: 'Hrvatski', flag: '🇭🇷' },
  { code: 'sk-SK', iso: 'sk', name: 'Eslovaco', nativeName: 'Slovenčina', flag: '🇸🇰' },
  { code: 'sl-SI', iso: 'sl', name: 'Esloveno', nativeName: 'Slovenščina', flag: '🇸🇮' },
  { code: 'sr-RS', iso: 'sr', name: 'Serbio', nativeName: 'Српски', flag: '🇷🇸' },
  { code: 'lt-LT', iso: 'lt', name: 'Lituano', nativeName: 'Lietuvių', flag: '🇱🇹' },
  { code: 'lv-LV', iso: 'lv', name: 'Letón', nativeName: 'Latviešu', flag: '🇱🇻' },
  { code: 'et-EE', iso: 'et', name: 'Estonio', nativeName: 'Eesti', flag: '🇪🇪' },
  { code: 'fa-IR', iso: 'fa', name: 'Persa', nativeName: 'فارسی', flag: '🇮🇷' },
  { code: 'ur-PK', iso: 'ur', name: 'Urdu', nativeName: 'اردو', flag: '🇵🇰' },
  { code: 'sw-KE', iso: 'sw', name: 'Suajili', nativeName: 'Kiswahili', flag: '🇰🇪' },
];

export const DEFAULT_USER_LANG: Language = POPULAR_LANGUAGES[0]; // Español
export const DEFAULT_PARTNER_LANG: Language = POPULAR_LANGUAGES[1]; // English (US)

export function matchLanguageByNameOrIso(nameOrIso?: string): Language | undefined {
  if (!nameOrIso) return undefined;
  const clean = nameOrIso.toLowerCase().trim();
  return ALL_LANGUAGES.find(
    (l) =>
      l.name.toLowerCase() === clean ||
      l.nativeName.toLowerCase() === clean ||
      l.iso.toLowerCase() === clean ||
      clean.includes(l.name.toLowerCase()) ||
      l.name.toLowerCase().includes(clean)
  );
}
