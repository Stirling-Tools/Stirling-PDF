package stirling.software.SPDF.model;

import java.util.Collection;

public interface ProviderInterface {

    public Collection<String> getScopes();

    public void setScopes(String scopes);

    public String getUseAsUsername();

    public void setUseAsUsername(String useAsUsername);

    public String getIssuer();

    public void setIssuer(String issuer);

    public String getClientSecret();

    public void setClientSecret(String clientSecret);

    public String getClientId();

    public void setClientId(String clientId);
}
