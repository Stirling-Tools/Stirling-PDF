import apiClient from "@app/services/apiClient";

export interface DatabaseBackupFile {
  fileName: string;
  filePath?: string;
  formattedCreationDate?: string;
  formattedFileSize?: string;
  creationDate?: string;
  fileSize?: number;
}

export interface DatabaseData {
  backupFiles: DatabaseBackupFile[];
  databaseVersion: string;
  versionUnknown: boolean;
}

const databaseManagementService = {
  async getDatabaseData(): Promise<DatabaseData> {
    const response = await apiClient.get<DatabaseData>("/api/v1/proprietary/ui-data/database", {
      suppressErrorToast: true,
    });
    return response.data;
  },

  async createBackup(): Promise<void> {
    await apiClient.get("/api/v1/database/createDatabaseBackup");
  },

  async importFromFileName(fileName: string): Promise<void> {
    await apiClient.get(`/api/v1/database/import-database-file/${encodeURIComponent(fileName)}`);
  },

  async uploadAndImport(file: File): Promise<void> {
    const formData = new FormData();
    formData.append("fileInput", file);

    await apiClient.post("/api/v1/database/import-database", formData);
  },

  async deleteBackup(fileName: string): Promise<void> {
    await apiClient.get(`/api/v1/database/delete/${encodeURIComponent(fileName)}`);
  },

  async downloadBackup(fileName: string): Promise<Blob> {
    const response = await apiClient.get(`/api/v1/database/download/${encodeURIComponent(fileName)}`, {
      responseType: "blob",
    });
    return response.data;
  },
};

export default databaseManagementService;
