// Core shim for proprietary user management service.
// This file exists so the core TypeScript project can resolve imports.
// In proprietary builds, the path alias maps to the real implementation.

export interface User {
	id: number;
	username: string;
	email?: string;
	roleName: string;
	rolesAsString?: string;
	enabled: boolean;
	isFirstLogin?: boolean;
	authenticationType?: string;
	team?: {
		id: number;
		name: string;
	};
	createdAt?: string;
	updatedAt?: string;
	isActive?: boolean;
	lastRequest?: number;
}

export interface AdminSettingsData {
	users: User[];
	userSessions: Record<string, boolean>;
	userLastRequest: Record<string, number>;
	totalUsers: number;
	activeUsers: number;
	disabledUsers: number;
	currentUsername?: string;
	roleDetails?: Record<string, string>;
	teams?: any[];
	maxPaidUsers?: number;
	maxAllowedUsers: number;
	availableSlots: number;
	grandfatheredUserCount: number;
	licenseMaxUsers: number;
	premiumEnabled: boolean;
}

export interface CreateUserRequest {
	username: string;
	password?: string;
	role: string;
	teamId?: number;
	authType: 'password' | 'SSO';
	forceChange?: boolean;
}

export interface UpdateUserRoleRequest {
	username: string;
	role: string;
	teamId?: number;
}

export interface InviteUsersRequest {
	emails: string;
	role: string;
	teamId?: number;
}

export interface InviteUsersResponse {
	successCount: number;
	failureCount: number;
	message?: string;
	errors?: string;
	error?: string;
}

export interface InviteLinkRequest {
	email?: string;
	role: string;
	teamId?: number;
	expiryHours?: number;
	sendEmail?: boolean;
}

export interface InviteLinkResponse {
	token: string;
	inviteUrl: string;
	email: string;
	expiresAt: string;
	expiryHours: number;
	emailSent?: boolean;
	emailError?: string;
	error?: string;
}

export interface InviteToken {
	id: number;
	email: string;
	role: string;
	teamId?: number;
	createdBy: string;
	createdAt: string;
	expiresAt: string;
}

function notAvailable(): never {
	throw new Error('User management is a proprietary feature and is not available in the core build.');
}

export const userManagementService = {
	async getUsers(): Promise<AdminSettingsData> {
		return notAvailable();
	},
	async getUsersWithoutTeam(): Promise<User[]> {
		return notAvailable();
	},
	async createUser(_data: CreateUserRequest): Promise<void> {
		return notAvailable();
	},
	async updateUserRole(_data: UpdateUserRoleRequest): Promise<void> {
		return notAvailable();
	},
	async toggleUserEnabled(_username: string, _enabled: boolean): Promise<void> {
		return notAvailable();
	},
	async deleteUser(_username: string): Promise<void> {
		return notAvailable();
	},
	async inviteUsers(_data: InviteUsersRequest): Promise<InviteUsersResponse> {
		return notAvailable();
	},
	async generateInviteLink(_data: InviteLinkRequest): Promise<InviteLinkResponse> {
		return notAvailable();
	},
	async getInviteLinks(): Promise<InviteToken[]> {
		return notAvailable();
	},
	async revokeInviteLink(_inviteId: number): Promise<void> {
		return notAvailable();
	},
	async cleanupExpiredInvites(): Promise<{ deletedCount: number }> {
		return notAvailable();
	}
};


