export interface CloudOwnershipStatus {
  teamId: number;
  teamName: string;
  leaderUserId: number | null;
  targetUserId: number | null;
  linkedInstances: number;
  subscribed: boolean;
  state: "NEEDS_MEMBERSHIP" | "READY" | "TRANSFERRED";
}

export interface OwnershipStatus {
  targetId: number;
  targetName: string;
  targetEmail: string | null;
  cloud: CloudOwnershipStatus | null;
  cloudEmail?: string | null;
  candidates?: {
    teamId: number;
    teamName: string;
    members: { id: number; name: string | null; email: string }[];
  } | null;
}

/** Callbacks reject on failure; completion must enforce cloud readiness on the server. */
export interface OwnershipTransferAdapter {
  local: boolean;
  prepare: () => Promise<OwnershipStatus>;
  loadCandidates?: () => Promise<NonNullable<OwnershipStatus["candidates"]>>;
  selectCloud?: (selection: {
    cloudUserId?: number;
    cloudEmail?: string;
  }) => Promise<OwnershipStatus>;
  invite?: () => Promise<OwnershipStatus>;
  transferCloud: (status: OwnershipStatus) => Promise<OwnershipStatus>;
  completeLocal?: (status: OwnershipStatus) => Promise<void>;
  cancel?: () => Promise<void>;
  signIn?: () => void;
}

export interface OwnershipTransferProps {
  adapter: OwnershipTransferAdapter;
  onClose: () => void;
  /** Runs when the success screen is dismissed, so session refresh cannot hide the result. */
  onTransferred: () => void;
}
