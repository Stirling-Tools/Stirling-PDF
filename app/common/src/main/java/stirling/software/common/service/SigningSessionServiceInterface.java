package stirling.software.common.service;

import java.io.IOException;
import java.util.List;

public interface SigningSessionServiceInterface {

    /**
     * Creates a new signing session
     *
     * @param request The session creation request
     * @param username The username of the session owner (optional, pass null for non-authenticated)
     * @return The created session (implementation-specific return type)
     */
    Object createSession(Object request, String username) throws IOException;

    /**
     * Gets a signing session by ID
     *
     * @param sessionId The session ID
     * @return The session object (implementation-specific return type)
     */
    Object getSession(String sessionId);

    /**
     * Lists all sessions for a user
     *
     * @param username The username
     * @return List of session summaries (implementation-specific return type)
     */
    List<?> listUserSessions(String username);

    /**
     * Gets detailed session information with ownership validation
     *
     * @param sessionId The session ID
     * @param username The username for ownership validation
     * @return Detailed session object (implementation-specific return type)
     */
    Object getSessionDetail(String sessionId, String username);

    /**
     * Deletes a session
     *
     * @param sessionId The session ID
     * @param username The username for ownership validation
     */
    void deleteSession(String sessionId, String username);

    /**
     * Adds participants to a session
     *
     * @param sessionId The session ID
     * @param request The request containing participant emails and names
     * @param username The username for ownership validation
     * @return Updated session detail (implementation-specific return type)
     */
    Object addParticipants(String sessionId, Object request, String username);

    /**
     * Removes a participant from a session
     *
     * @param sessionId The session ID
     * @param userId The participant's user ID
     * @param username The username for ownership validation
     */
    void removeParticipant(String sessionId, Long userId, String username);

    /**
     * Notifies participants
     *
     * @param sessionId The session ID
     * @param request The notification request
     * @return The updated session (implementation-specific return type)
     */
    Object notifyParticipants(String sessionId, Object request);

    /**
     * Attaches a certificate for a participant
     *
     * @param sessionId The session ID
     * @param userId The participant's user ID
     * @param request The certificate request
     * @return The updated session (implementation-specific return type)
     */
    Object attachCertificate(String sessionId, Long userId, Object request) throws IOException;

    /**
     * Marks a session as finalized
     *
     * @param sessionId The session ID
     * @param signedPdf The final signed PDF bytes
     */
    void markSessionFinalized(String sessionId, byte[] signedPdf);

    /**
     * Gets the PDF for a session with user authentication
     *
     * @param sessionId The session ID
     * @param username The participant's username
     * @return The PDF bytes
     */
    byte[] getSessionPdf(String sessionId, String username);

    /**
     * Gets the signed PDF from a finalized session with ownership validation
     *
     * @param sessionId The session ID
     * @param username The username for ownership validation
     * @return The signed PDF bytes, or null if not finalized
     */
    byte[] getSignedPdf(String sessionId, String username);

    /**
     * Lists sign requests for a participant
     *
     * @param username The participant's username
     * @return List of sign requests where user is a participant
     */
    List<?> listSignRequests(String username);

    /**
     * Gets sign request detail for a participant
     *
     * @param sessionId The session ID
     * @param username The participant's username
     * @return Sign request detail DTO (implementation-specific return type)
     */
    Object getSignRequestDetail(String sessionId, String username);

    /**
     * Declines a sign request
     *
     * @param sessionId The session ID
     * @param username The participant's username
     */
    void declineSignRequest(String sessionId, String username);

    /**
     * Checks if this is the database-backed implementation
     *
     * @return true if database-backed, false if in-memory
     */
    boolean isDatabaseBacked();
}
