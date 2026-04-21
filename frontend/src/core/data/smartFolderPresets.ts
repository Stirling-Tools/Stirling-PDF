/**
 * Default Smart Folder presets — seeded once on first run
 */

import { SmartFolder } from '@app/types/smartFolders';
import { AutomationConfig } from '@app/types/automation';
import { automationStorage } from '@app/services/automationStorage';
import { smartFolderStorage } from '@app/services/smartFolderStorage';

const SEEDED_FLAG = 'smart_folders_seeded';
let seedingInProgress = false;

interface PresetDefinition {
  folder: Omit<SmartFolder, 'id' | 'automationId' | 'createdAt' | 'updatedAt'>;
  automation: Omit<AutomationConfig, 'id' | 'createdAt' | 'updatedAt'>;
}

const PRESETS: PresetDefinition[] = [
  {
    folder: {
      name: 'Secure Ingestion',
      description: 'Sanitize and flatten all incoming PDFs',
      icon: 'SecurityIcon',
      accentColor: '#9333ea',
      order: 0,
      isDefault: true,
    },
    automation: {
      name: 'Secure Ingestion',
      description: 'Sanitize then flatten PDF to remove hidden data',
      icon: 'SecurityIcon',
      operations: [
        { operation: 'sanitize', parameters: {} },
        { operation: 'flatten', parameters: {} },
      ],
    },
  },
  {
    folder: {
      name: 'Pre-publish',
      description: 'Sanitize and compress before publishing',
      icon: 'CloudIcon',
      accentColor: '#0ea5e9',
      order: 1,
      isDefault: true,
    },
    automation: {
      name: 'Pre-publish',
      description: 'Sanitize and compress PDF for publication',
      icon: 'CloudIcon',
      operations: [
        { operation: 'sanitize', parameters: {} },
        { operation: 'compress', parameters: {} },
      ],
    },
  },
  {
    folder: {
      name: 'Email Prep',
      description: 'Compress then sanitize for email distribution',
      icon: 'CompressIcon',
      accentColor: '#14b8a6',
      order: 2,
      isDefault: true,
    },
    automation: {
      name: 'Email Prep',
      description: 'Compress then sanitize PDF for email',
      icon: 'CompressIcon',
      operations: [
        { operation: 'compress', parameters: {} },
        { operation: 'sanitize', parameters: {} },
      ],
    },
  },
  {
    folder: {
      name: 'Rotate & Optimise',
      description: 'Auto-rotate pages and compress',
      icon: 'RotateRightIcon',
      accentColor: '#f97316',
      order: 3,
      isDefault: true,
    },
    automation: {
      name: 'Rotate & Optimise',
      description: 'Rotate pages and compress PDF',
      icon: 'RotateRightIcon',
      operations: [
        { operation: 'rotate', parameters: { angle: 90 } },
        { operation: 'compress', parameters: {} },
      ],
    },
  },
];

export async function seedDefaultFolders(): Promise<void> {
  if (localStorage.getItem(SEEDED_FLAG) || seedingInProgress) return;
  seedingInProgress = true;

  try {
    for (const preset of PRESETS) {
      const savedAutomation = await automationStorage.saveAutomation(preset.automation);
      await smartFolderStorage.createFolder({
        ...preset.folder,
        automationId: savedAutomation.id,
      });
    }
    localStorage.setItem(SEEDED_FLAG, 'true');
  } catch (error) {
    console.error('Failed to seed default smart folders:', error);
  } finally {
    seedingInProgress = false;
  }
}
