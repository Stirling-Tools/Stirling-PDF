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
  private readonly baseUrl = 'https://supabase.stirling.com/functions/v1/updates';

  /**
   * Compare two version strings
   * @returns 1 if v1 > v2, -1 if v1 < v2, 0 if equal
   */
  compareVersions(version1: string, version2: string): number {
    const v1 = version1.split('.');
    const v2 = version2.split('.');

    for (let i = 0; i < v1.length || i < v2.length; i++) {
      const n1 = parseInt(v1[i]) || 0;
      const n2 = parseInt(v2[i]) || 0;

      if (n1 > n2) {
        return 1;
      } else if (n1 < n2) {
        return -1;
      }
    }

    return 0;
  }

  /**
   * Get download URL based on machine type and security settings
   */
  getDownloadUrl(machineInfo: MachineInfo): string | null {
    // Only show download for non-Docker installations
    if (machineInfo.machineType === 'Docker' || machineInfo.machineType === 'Kubernetes') {
      return null;
    }

    // Determine file based on machine type and security
    if (machineInfo.machineType === 'Server-jar') {
      return DOWNLOAD_BASE_URL + (machineInfo.activeSecurity ? 'Stirling-PDF-with-login.jar' : 'Stirling-PDF.jar');
    }

    // Client installations
    if (machineInfo.machineType.startsWith('Client-')) {
      const os = machineInfo.machineType.replace('Client-', ''); // win, mac, unix
      const type = machineInfo.activeSecurity ? '-server-security' : '-server';

      if (os === 'unix') {
        return DOWNLOAD_BASE_URL + os + type + '.jar';
      } else if (os === 'win') {
        return DOWNLOAD_BASE_URL + os + '-installer.exe';
      } else if (os === 'mac') {
        return DOWNLOAD_BASE_URL + os + '-installer.dmg';
      }
    }

    return null;
  }

  /**
   * Fetch update summary from API
   */
  async getUpdateSummary(currentVersion: string, machineInfo: MachineInfo): Promise<UpdateSummary | null> {
    // Map Java License enum to API types
    let type = 'normal';
    if (machineInfo.licenseType === 'PRO') {
      type = 'pro';
    } else if (machineInfo.licenseType === 'ENTERPRISE') {
      type = 'enterprise';
    }

    const url = `${this.baseUrl}?from=${currentVersion}&type=${type}&login=${machineInfo.activeSecurity}&summary=true`;
    console.log('Fetching update summary from:', url);

    try {
      const response = await fetch(url);
      console.log('Response status:', response.status);

      if (response.status === 200) {
        const data = await response.json();
        return data as UpdateSummary;
      } else {
        console.error('Failed to fetch update summary from Supabase:', response.status);
        return null;
      }
    } catch (error) {
      console.error('Failed to fetch update summary from Supabase:', error);
      return null;
    }
  }

  /**
   * Fetch full update information with detailed version info
   */
  async getFullUpdateInfo(currentVersion: string, machineInfo: MachineInfo): Promise<FullUpdateInfo | null> {
    // Map Java License enum to API types
    let type = 'normal';
    if (machineInfo.licenseType === 'PRO') {
      type = 'pro';
    } else if (machineInfo.licenseType === 'ENTERPRISE') {
      type = 'enterprise';
    }

    const url = `${this.baseUrl}?from=${currentVersion}&type=${type}&login=${machineInfo.activeSecurity}&summary=false`;
    console.log('Fetching full update info from:', url);

    try {
      const response = await fetch(url);
      console.log('Full update response status:', response.status);

      if (response.status === 200) {
        const data = await response.json();
        return data as FullUpdateInfo;
      } else {
        console.error('Failed to fetch full update info from Supabase:', response.status);
        return null;
      }
    } catch (error) {
      console.error('Failed to fetch full update info from Supabase:', error);
      return null;
    }
  }

  /**
   * Get current version from GitHub build.gradle as fallback
   */
  async getCurrentVersionFromGitHub(): Promise<string> {
    const url = 'https://raw.githubusercontent.com/Stirling-Tools/Stirling-PDF/master/build.gradle';

    try {
      const response = await fetch(url);
      if (response.status === 200) {
        const text = await response.text();
        const versionRegex = /version\s*=\s*['"](\d+\.\d+\.\d+)['"]/;
        const match = versionRegex.exec(text);
        if (match) {
          return match[1];
        }
      }
      throw new Error('Version number not found');
    } catch (error) {
      console.error('Failed to fetch latest version from build.gradle:', error);
      return '';
    }
  }
}

export const updateService = new UpdateService();
