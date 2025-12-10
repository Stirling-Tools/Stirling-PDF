import { useEffect } from 'react';
import { useAppConfig } from '@app/contexts/AppConfigContext';
import { updateSupportedLanguages } from '@app/i18n';

/**
 * Component that loads app configuration and applies it to the application.
 * This includes:
 * - Filtering available languages based on config.languages
 *
 * Place this component high in the component tree, after i18n has initialized.
 */
export default function AppConfigLoader() {
  const { config, loading } = useAppConfig();

  useEffect(() => {
    if (!loading && config) {
      // Update supported languages and apply default locale from server config
      // Priority: localStorage > config.defaultLocale > browser detection > fallback
      updateSupportedLanguages(config.languages, config.defaultLocale);
    }
  }, [config, loading]);

  // This component doesn't render anything
  return null;
}
