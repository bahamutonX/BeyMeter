import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import en from './locales/en/translation.json'
import ja from './locales/ja/translation.json'

i18n
  .use(
    new LanguageDetector(
      null,
      {
        order: ['navigator'],
        caches: [], // no localStorage/cookie
        lookupNavigator: 'languages',
      } as any,
    ),
  )
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
