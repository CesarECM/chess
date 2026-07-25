import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';

import es from './locales/es.json';
import en from './locales/en.json';
import pt from './locales/pt.json';
import fr from './locales/fr.json';

const SUPPORTED = ['es', 'en', 'pt', 'fr'] as const;
type SupportedLang = typeof SUPPORTED[number];

export function getDeviceLocale(): SupportedLang {
  const tag = getLocales()[0]?.languageTag ?? 'es';
  const code = tag.split('-')[0] as SupportedLang;
  return SUPPORTED.includes(code) ? code : 'es';
}

i18n.use(initReactI18next).init({
  resources: {
    es: { translation: es },
    en: { translation: en },
    pt: { translation: pt },
    fr: { translation: fr },
  },
  lng: getDeviceLocale(),
  fallbackLng: 'es',
  interpolation: { escapeValue: false },
});

export default i18n;
