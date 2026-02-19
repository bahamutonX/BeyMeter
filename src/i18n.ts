import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import en from './locales/en/translation.json'
import ja from './locales/ja/translation.json'

const detectorOptions = {
  order: ['navigator'],
  caches: [], // no localStorage/cookie
  lookupNavigator: 'languages',
} as unknown as ConstructorParameters<typeof LanguageDetector>[1]

i18n
  .use(new LanguageDetector(null, detectorOptions))
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      ja: { translation: ja },
    },
    supportedLngs: ['en', 'ja'],
    fallbackLng: 'en',
    load: 'languageOnly', // ja-JP -> ja
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  })

export default i18n
