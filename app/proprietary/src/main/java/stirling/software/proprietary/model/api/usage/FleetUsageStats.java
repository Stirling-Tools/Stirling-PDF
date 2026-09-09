package stirling.software.proprietary.model.api.usage;

/**
 * Free-editor fleet usage for the portal Usage card. Null fields render as "N/A" (uncomputable).
 */
public record FleetUsageStats(Long editorsDeployed, Long activeThisMonth, Long pdfsProcessed) {}
