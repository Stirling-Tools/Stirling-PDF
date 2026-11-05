export interface PlanFeature {
  name: string;
  included: boolean;
}

export interface LicenseInfo {
  licenseType: "NORMAL" | "SERVER" | "ENTERPRISE";
  enabled: boolean;
  maxUsers: number;
  linkedTeamUsers?: number | null;
  maxAllowedUsers?: number;
  hasKey: boolean;
  licenseKey?: string;
}
