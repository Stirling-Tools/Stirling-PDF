package stirling.software.proprietary.model;

import java.util.UUID;

import jakarta.servlet.http.HttpServletResponse;
import stirling.software.proprietary.security.model.User;

/** Holds context information for credit-based API requests */
public class CreditRequestContext {

    private final String requestId;
    private final User user;
    private final String ipAddress;
    private final String userAgent;
    private final int creditCost;
    private final String endpoint;
    private boolean creditsPreChecked = false;
    private HttpServletResponse httpResponse;

    public CreditRequestContext(
            String requestId,
            User user,
            String ipAddress,
            String userAgent,
            int creditCost,
            String endpoint) {
        this.requestId = requestId;
        this.user = user;
        this.ipAddress = ipAddress;
        this.userAgent = userAgent;
        this.creditCost = creditCost;
        this.endpoint = endpoint;
    }

    public String getRequestId() {
        return requestId;
    }

    public User getUser() {
        return user;
    }

    public String getIpAddress() {
        return ipAddress;
    }

    public String getUserAgent() {
        return userAgent;
    }

    public int getCreditCost() {
        return creditCost;
    }

    public String getEndpoint() {
        return endpoint;
    }

    public boolean isCreditsPreChecked() {
        return creditsPreChecked;
    }

    public void setCreditsPreChecked(boolean preChecked) {
        this.creditsPreChecked = preChecked;
    }

    public boolean isAnonymous() {
        return user == null;
    }
    
    public HttpServletResponse getHttpResponse() {
        return httpResponse;
    }
    
    public void setHttpResponse(HttpServletResponse httpResponse) {
        this.httpResponse = httpResponse;
    }

    /** Generate a unique identifier for this request */
    public static String generateRequestId() {
        return UUID.randomUUID().toString();
    }
}
