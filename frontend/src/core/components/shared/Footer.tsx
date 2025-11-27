import { Flex } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useCookieConsent } from '@app/hooks/useCookieConsent';

interface FooterProps {
  privacyPolicy?: string;
  termsAndConditions?: string;
  accessibilityStatement?: string;
  cookiePolicy?: string;
  impressum?: string;
  analyticsEnabled?: boolean;
  forceLightMode?: boolean;
}

export default function Footer({
  privacyPolicy,
  termsAndConditions,
  accessibilityStatement,
  cookiePolicy,
  impressum,
  analyticsEnabled = false,
  forceLightMode = false
}: FooterProps) {
  const { t } = useTranslation();
  const { showCookiePreferences } = useCookieConsent({ analyticsEnabled, forceLightMode });

  // Default URLs
  const defaultTermsUrl = "https://www.stirling.com/legal/terms-of-service";
  const defaultPrivacyUrl = "https://www.stirling.com/legal/privacy-policy";
  const defaultAccessibilityUrl = "https://www.stirling.com/accessibility";

  // Use provided URLs or fall back to defaults
  const finalTermsUrl = termsAndConditions || defaultTermsUrl;
  const finalPrivacyUrl = privacyPolicy || defaultPrivacyUrl;
  const finalAccessibilityUrl = accessibilityStatement || defaultAccessibilityUrl;

  // Helper to check if a value is valid (not null/undefined/empty string)
  const isValidLink = (link?: string) => link && link.trim().length > 0;

  return (
    <div style={{
      height: 'var(--footer-height)',
      backgroundColor: forceLightMode ? '#f1f3f5' : 'var(--mantine-color-gray-1)',
      borderTop: forceLightMode ? '1px solid #e9ecef' : '1px solid var(--mantine-color-gray-2)',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
    }}>
        <Flex gap="md"
          justify="center"
          align="center"
          direction="row"
          style={{
            fontSize: '0.75rem',
            color: forceLightMode ? '#495057' : undefined
          }}>
          <a
            className="footer-link px-3"
            id="survey"
            target="_blank"
            rel="noopener noreferrer"
            href="https://stirlingpdf.info/s/cm28y3niq000o56dv7liv8wsu"
          >
            {t('survey.nav', 'Survey')}
          </a>
          <a
            className="footer-link px-3"
            target="_blank"
            rel="noopener noreferrer"
            href={finalPrivacyUrl}
          >
            {t('legal.privacy', 'Privacy Policy')}
          </a>
          <a
            className="footer-link px-3"
            target="_blank"
            rel="noopener noreferrer"
            href={finalTermsUrl}
          >
            {t('legal.terms', 'Terms and Conditions')}
          </a>
          <a
            className="footer-link px-3"
            target="_blank"
            rel="noopener noreferrer"
            href={finalAccessibilityUrl}
          >
            {t('legal.accessibility', 'Accessibility')}
          </a>
          {isValidLink(cookiePolicy) && (
            <a
              className="footer-link px-3"
              target="_blank"
              rel="noopener noreferrer"
              href={cookiePolicy}
            >
              {t('legal.cookie', 'Cookie Policy')}
            </a>
          )}
          {isValidLink(impressum) && (
            <a
              className="footer-link px-3"
              target="_blank"
              rel="noopener noreferrer"
              href={impressum}
            >
              {t('legal.impressum', 'Impressum')}
            </a>
          )}
          {analyticsEnabled && (
            <button
              className="footer-link px-3"
              id="cookieBanner"
              onClick={showCookiePreferences}
            >
              {t('legal.showCookieBanner', 'Cookie Preferences')}
            </button>
          )}
        </Flex>
    </div>
  );
}
