import { DOWNLOAD_BASE_URL } from '@app/constants/downloads';

export interface UpdateSummary {
  latest_version: string | null;
  latest_stable_version?: string | null;
  max_priority: 'urgent' | 'normal' | 'minor' | 'low';
  recommended_action?: string;
  any_breaking: boolean;
  migration_guides?: Array<{
    version: string;
    notes: string;
    url: string;
  }>;
}

export interface VersionUpdate {
  version: string;
  priority: 'urgent' | 'normal' | 'minor' | 'low';
  announcement: {
    title: string;
    message: string;
  };
  compatibility: {
    breaking_changes: boolean;
    breaking_description?: string;
    migration_guide_url?: string;
  };
}

export interface FullUpdateInfo {
  latest_version: string;
  latest_stable_version?: string;
  new_versions: VersionUpdate[];
}

export interface MachineInfo {
  machineType: string;
  activeSecurity: boolean;
  licenseType: string;
}

export class UpdateService {
  compareVersions(version1: string, version2: string): number {
    const v1 = version1.split('.');
    const v2 = version2.split('.');
    for (let i = 0; i < v1.length || i < v2.length; i++) {
      const n1 = parseInt(v1[i]) || 0;
      const n2 = parseInt(v2[i]) || 0;
      if (n1 > n2) return 1;
      if (n1 < n2) return -1;
    }
    return 0;
  }

  getDownloadUrl(machineInfo: MachineInfo): string | null {
    if (machineInfo.machineType === 'Docker' || machineInfo.machineType === 'Kubernetes') {
      return null;
    }
    if (machineInfo.machineType === 'Server-jar') {
      return DOWNLOAD_BASE_URL + (machineInfo.activeSecurity ? 'Stirling-PDF-with-login.jar' : 'Stirling-PDF.jar');
    }
    if (machineInfo.machineType.startsWith('Client-')) {
      const os = machineInfo.machineType.replace('Client-', '');
      const type = machineInfo.activeSecurity ? '-server-security' : '-server';
      if (os === 'unix') return DOWNLOAD_BASE_URL + os + type + '.jar';
      if (os === 'win') return DOWNLOAD_BASE_URL + os + '-installer.exe';
      if (os === 'mac') return DOWNLOAD_BASE_URL + os + '-installer.dmg';
    }
    return null;
  }

  async getUpdateSummary(_currentVersion: string, _machineInfo: MachineInfo): Promise<UpdateSummary | null> {
    return null;
  }

  async getFullUpdateInfo(_currentVersion: string, _machineInfo: MachineInfo): Promise<FullUpdateInfo | null> {
    return null;
  }

  async getCurrentVersionFromGitHub(): Promise<string> {
    return '';
  }
}

export const updateService = new UpdateService();
