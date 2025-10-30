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
}

export default function Footer({
  privacyPolicy,
  termsAndConditions,
  accessibilityStatement,
  cookiePolicy,
  impressum,
  analyticsEnabled = false
}: FooterProps) {
  const { t } = useTranslation();
  const { showCookiePreferences } = useCookieConsent({ analyticsEnabled });

  // Helper to check if a value is valid (not null/undefined/empty string)
  const isValidLink = (link?: string) => link && link.trim().length > 0;

  return (
    <div style={{
      height: 'var(--footer-height)',
      backgroundColor: 'var(--mantine-color-gray-1)',
      borderTop: '1px solid var(--mantine-color-gray-2)',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
    }}>
        <Flex gap="md"
          justify="center"
          align="center"
          direction="row"
          style={{ fontSize: '0.75rem' }}>
          <a
            className="footer-link px-3"
            id="survey"
            target="_blank"
            rel="noopener noreferrer"
            href="https://stirlingpdf.info/s/cm28y3niq000o56dv7liv8wsu"
          >
            {t('survey.nav', 'Survey')}
          </a>
          {isValidLink(privacyPolicy) && (
            <a
              className="footer-link px-3"
              target="_blank"
              rel="noopener noreferrer"
              href={privacyPolicy}
            >
              {t('legal.privacy', 'Privacy Policy')}
            </a>
          )}
          {isValidLink(termsAndConditions) && (
            <a
              className="footer-link px-3"
              target="_blank"
              rel="noopener noreferrer"
              href={termsAndConditions}
            >
              {t('legal.terms', 'Terms and Conditions')}
            </a>
          )}
          {isValidLink(accessibilityStatement) && (
            <a
              className="footer-link px-3"
              target="_blank"
              rel="noopener noreferrer"
              href={accessibilityStatement}
            >
              {t('legal.accessibility', 'Accessibility')}
            </a>
          )}
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
