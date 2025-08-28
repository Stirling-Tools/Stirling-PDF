import { Flex } from '@mantine/core';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useCookieConsent } from '../../hooks/useCookieConsent';

interface FooterProps {
  privacyPolicy?: string;
  termsAndConditions?: string;
  accessibilityStatement?: string;
  cookiePolicy?: string;
  impressum?: string;
  analyticsEnabled?: boolean;
}

export default function Footer({
  privacyPolicy = '/privacy',
  termsAndConditions = '/terms',
  accessibilityStatement = 'accessibility',
  cookiePolicy = 'cookie',
  analyticsEnabled = false
}: FooterProps) {
  const { t } = useTranslation();
  const { showCookiePreferences } = useCookieConsent({ analyticsEnabled });

  return (
    <div style={{
      zIndex: 999999,
      backgroundColor: 'var(--mantine-color-gray-1)',
      borderTop: '1px solid var(--mantine-color-gray-3)',
      paddingBottom: '0.5rem',
    }}>
        <Flex pt='sm' gap="md"
          justify="center"
          align="center"
          direction="row"
          wrap="wrap"
          px="lg"
          style={{ fontSize: '0.75rem' }}>
          <a
            className="footer-link px-3"
            id="licenses"
            target="_blank"
            rel="noopener noreferrer"
            href="/licenses"
          >
            {t('licenses.nav', 'Licenses')}
          </a>
          <a
            className="footer-link px-3"
            id="releases"
            target="_blank"
            rel="noopener noreferrer"
            href="/releases"
          >
            {t('releases.footer', 'Releases')}
          </a>
          <a
            className="footer-link px-3"
            id="survey"
            target="_blank"
            rel="noopener noreferrer"
            href="https://stirlingpdf.info/s/cm28y3niq000o56dv7liv8wsu"
          >
            {t('survey.nav', 'Survey')}
          </a>
          {privacyPolicy && (
            <a
              className="footer-link px-3"
              target="_blank"
              rel="noopener noreferrer"
              href={privacyPolicy}
            >
              {t('legal.privacy', 'Privacy Policy')}
            </a>
          )}
          {termsAndConditions && (
            <a
              className="footer-link px-3"
              target="_blank"
              rel="noopener noreferrer"
              href={termsAndConditions}
            >
              {t('legal.terms', 'Terms and Conditions')}
            </a>
          )}
          {accessibilityStatement && (
            <a
              className="footer-link px-3"
              target="_blank"
              rel="noopener noreferrer"
              href={accessibilityStatement}
            >
              {t('legal.accessibility', 'Accessibility')}
            </a>
          )}
          {cookiePolicy && (
            <a
              className="footer-link px-3"
              target="_blank"
              rel="noopener noreferrer"
              href={cookiePolicy}
            >
              {t('legal.cookie', 'Cookie Preferecences')}
            </a>
          )}
          {analyticsEnabled && (
            <button
              className="footer-link px-3"
              id="cookieBanner"
              onClick={showCookiePreferences}
              style={{ border: 'none', background: 'none', cursor: 'pointer' }}
            >
              {t('legal.showCookieBanner', 'Cookie Preferences')}
            </button>
          )}
        </Flex>

        {/* Powered by section */}
        <Flex justify="center" align="center" gap={"sm"} >
          <span>{t('poweredBy', 'Powered by')} </span>
          <a href="https://stirlingpdf.com" className="stirling-link">
            Stirling PDF
          </a>
        </Flex>
    </div>
  );
}
