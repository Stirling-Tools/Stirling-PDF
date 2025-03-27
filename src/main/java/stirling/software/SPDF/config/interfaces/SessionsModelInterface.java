package stirling.software.SPDF.config.interfaces;

import java.util.Date;

public interface SessionsModelInterface {

    String getSessionId();

    String getPrincipalName();

    Date getLastRequest();

    boolean isExpired();
}
