// Core shim for proprietary team service.
// This allows the core TypeScript project to resolve imports.
// Proprietary builds map to the real implementation via path aliases.

export interface Team {
	id: number;
	name: string;
	userCount?: number;
}

export interface TeamMember {
	id: number;
	username: string;
	email?: string;
	roleName: string;
	enabled: boolean;
	team?: {
		id: number;
		name: string;
	};
	lastRequest?: Date | null;
}

export interface TeamDetailsResponse {
	team: Team;
	members: TeamMember[];
	availableUsers: TeamMember[];
}

function notAvailable(): never {
	throw new Error('Team management is a proprietary feature and is not available in the core build.');
}

export const teamService = {
	async getTeams(): Promise<Team[]> {
		return notAvailable();
	},
	async getTeamDetails(_teamId: number): Promise<any> {
		return notAvailable();
	},
	async createTeam(_name: string): Promise<void> {
		return notAvailable();
	},
	async renameTeam(_teamId: number, _newName: string): Promise<void> {
		return notAvailable();
	},
	async deleteTeam(_teamId: number): Promise<void> {
		return notAvailable();
	},
	async addUserToTeam(_teamId: number, _userId: number): Promise<void> {
		return notAvailable();
	},
	async moveUserToTeam(_username: string, _currentRole: string, _teamId: number): Promise<void> {
		return notAvailable();
	},
};


