/**
 * Desktop plan features configuration
 * Single source of truth for plan features in desktop billing page
 */

export interface PlanFeatureConfig {
  translationKey: string;
  defaultText: string;
}

export const FREE_PLAN_FEATURES: PlanFeatureConfig[] = [
  {
    translationKey: 'credits.modal.allInOneWorkspace',
    defaultText: 'All-in-one PDF workspace (viewer, tools & agent)'
  },
  {
    translationKey: 'credits.modal.fullyPrivateFiles',
    defaultText: 'Fully private files'
  },
  {
    translationKey: 'credits.modal.standardThroughput',
    defaultText: 'Standard throughput'
  },
  {
    translationKey: 'credits.modal.customSmartFolders',
    defaultText: 'Custom Smart Folders'
  },
  {
    translationKey: 'credits.modal.apiSandbox',
    defaultText: 'API sandbox'
  }
];

export const TEAM_PLAN_FEATURES: PlanFeatureConfig[] = [
  {
    translationKey: 'credits.modal.unlimitedSeats',
    defaultText: 'Unlimited seats'
  },
  {
    translationKey: 'credits.modal.fasterThroughput',
    defaultText: '10x faster throughput'
  },
  {
    translationKey: 'credits.modal.largeFileProcessing',
    defaultText: 'Large file processing'
  },
  {
    translationKey: 'credits.modal.premiumAiModels',
    defaultText: 'Premium AI models'
  },
  {
    translationKey: 'credits.modal.secureApiAccess',
    defaultText: 'Secure API access'
  },
  {
    translationKey: 'credits.modal.prioritySupport',
    defaultText: 'Priority support'
  }
];

export const ENTERPRISE_PLAN_FEATURES: PlanFeatureConfig[] = [
  {
    translationKey: 'credits.modal.orgWideAccess',
    defaultText: 'Org-wide access controls'
  },
  {
    translationKey: 'credits.modal.privateDocCloud',
    defaultText: 'Private Document Cloud'
  },
  {
    translationKey: 'credits.modal.ragFineTuning',
    defaultText: 'RAG + fine-tuning'
  },
  {
    translationKey: 'credits.modal.unlimitedApiAccess',
    defaultText: 'Unlimited API access'
  },
  {
    translationKey: 'credits.modal.advancedMonitoring',
    defaultText: 'Advanced monitoring'
  },
  {
    translationKey: 'credits.modal.dedicatedSupportSlas',
    defaultText: 'Dedicated support & SLAs'
  }
];
