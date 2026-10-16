package stirling.software.common.service;

/**
 * Interface for checking license status dynamically. Implementation provided by proprietary module
 * when available.
 */
public interface LicenseServiceInterface {

    /**
     * Get the license type as a string.
     *
     * @return "NORMAL", "SERVER", or "ENTERPRISE"
     */
    String getLicenseTypeName();

    /**
     * Check if running Pro or higher (SERVER or ENTERPRISE license).
     *
     * @return true if SERVER or ENTERPRISE license is active
     */
    boolean isRunningProOrHigher();

    /** True for an installed Server licence; linked Team feature entitlements do not qualify. */
    boolean hasServerLicense();

    /**
     * Check if running Enterprise edition.
     *
     * @return true if ENTERPRISE license is active
     */
    boolean isRunningEE();
}
