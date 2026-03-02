// Module-level storage for file path mappings (quickKey -> localFilePath)
// Used to pass file paths from Tauri file dialog to FileManagerContext
export const pendingFilePathMappings = new Map<string, string>();
