import { PlanFeature } from '@app/services/licenseService';

/**
 * Shared plan feature definitions for Stirling PDF Self-Hosted
 * Used by both dynamic (Stripe) and static (fallback) plan displays
 */

export const PLAN_FEATURES = {
  FREE: [
    { name: 'Self-hosted deployment', included: true },
    { name: 'All PDF operations', included: true },
    { name: 'Secure Login Support', included: true },
    { name: 'Community support', included: true },
    { name: 'Regular updates', included: true },
    { name: 'up to 5 users', included: true },
    { name: 'Unlimited users', included: false },
    { name: 'Google drive integration', included: false },
    { name: 'External Database', included: false },
    { name: 'Editing text in pdfs', included: false },
    { name: 'Users limited to seats', included: false },
    { name: 'SSO', included: false },
    { name: 'SAML', included: false },
    { name: 'Auditing', included: false },
    { name: 'Usage tracking', included: false },
    { name: 'Prometheus Support', included: false },
    { name: 'Custom PDF metadata', included: false },
  ] as PlanFeature[],

  SERVER: [
    { name: 'Self-hosted deployment', included: true },
    { name: 'All PDF operations', included: true },
    { name: 'Secure Login Support', included: true },
    { name: 'Community support', included: true },
    { name: 'Regular updates', included: true },
    { name: 'Up to 5 users', included: false },
    { name: 'Unlimited users', included: true },
    { name: 'Google drive integration', included: true },
    { name: 'External Database', included: true },
    { name: 'Editing text in pdfs', included: true },
    { name: 'Users limited to seats', included: false },
    { name: 'SSO', included: true },
    { name: 'SAML', included: false },
    { name: 'Auditing', included: false },
    { name: 'Usage tracking', included: false },
    { name: 'Prometheus Support', included: false },
    { name: 'Custom PDF metadata', included: false },
  ] as PlanFeature[],

  ENTERPRISE: [
    { name: 'Self-hosted deployment', included: true },
    { name: 'All PDF operations', included: true },
    { name: 'Secure Login Support', included: true },
    { name: 'Community support', included: true },
    { name: 'Regular updates', included: true },
    { name: 'up to 5 users', included: false },
    { name: 'Unlimited users', included: false },
    { name: 'Google drive integration', included: true },
    { name: 'External Database', included: true },
    { name: 'Editing text in pdfs', included: true },
    { name: 'Users limited to seats', included: true },
    { name: 'SSO', included: true },
    { name: 'SAML', included: true },
    { name: 'Auditing', included: true },
    { name: 'Usage tracking', included: true },
    { name: 'Prometheus Support', included: true },
    { name: 'Custom PDF metadata', included: true },
  ] as PlanFeature[],
} as const;

export const PLAN_HIGHLIGHTS = {
  FREE: [
    'Up to 5 users',
    'Self-hosted',
    'All basic features'
  ],
  SERVER_MONTHLY: [
    'Self-hosted on your infrastructure',
    'Unlimited users',
    'Advanced integrations',
    'SSO (OAuth2/OIDC)',
    'Editing text in PDFs',
    'Cancel anytime'
  ],
  SERVER_YEARLY: [
    'Self-hosted on your infrastructure',
    'Unlimited users',
    'Advanced integrations',
    'SSO (OAuth2/OIDC)',
    'Editing text in PDFs',
    'Save with annual billing'
  ],
  ENTERPRISE_MONTHLY: [
    'Enterprise features (SAML, Auditing)',
    'Usage tracking & Prometheus',
    'Custom PDF metadata',
    'Per-seat licensing'
  ],
  ENTERPRISE_YEARLY: [
    'Enterprise features (SAML, Auditing)',
    'Usage tracking & Prometheus',
    'Custom PDF metadata',
    'Save with annual billing'
  ]
} as const;
