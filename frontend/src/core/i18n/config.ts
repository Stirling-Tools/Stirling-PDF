import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import TomlBackend from '@app/i18n/tomlBackend';

i18n
  .use(TomlBackend)
  .use(initReactI18next)
  .init({
    lng: 'en',
    fallbackLng: 'en',
    debug: false,
    backend: {
      loadPath: '/locales/{{lng}}/{{ns}}.toml',
    },
    interpolation: {
      escapeValue: false,
    },
    // For testing environment, provide fallback resources
    resources: {
      en: {
        translation: {
          'convert.selectSourceFormat': 'Select source file format',
          'convert.selectTargetFormat': 'Select target file format',
          'convert.selectFirst': 'Select a source format first',
          'convert.imageOptions': 'Image Options:',
          'convert.emailOptions': 'Email Options:',
          'convert.colorType': 'Color Type',
          'convert.dpi': 'DPI',
          'convert.singleOrMultiple': 'Output',
          'convert.emailNote': 'Email attachments and embedded images will be included',
          'common.color': 'Color',
          'common.grayscale': 'Grayscale',
          'common.blackWhite': 'Black & White',
          'common.single': 'Single Image',
          'common.multiple': 'Multiple Images',
          'groups.document': 'Document',
          'groups.spreadsheet': 'Spreadsheet',
          'groups.presentation': 'Presentation',
          'groups.image': 'Image',
          'groups.web': 'Web',
          'groups.text': 'Text',
          'groups.email': 'Email'
        }
      }
    }
  });

export default i18n;
