package stirling.software.common.service;

import java.io.IOException;

/**
 * Interface for authenticated personal signature access in self-hosted deployments.
 */
public interface PersonalSignatureServiceInterface {

    /**
     * Get a personal signature from the user's folder. Only checks personal folder, not shared
     * folder.
     *
     * @param username Username of the signature owner
     * @param fileName Signature filename
     * @return Personal signature image bytes
     * @throws IOException If file not found or read error
     */
    byte[] getPersonalSignatureBytes(String username, String fileName) throws IOException;
}
