package stirling.software.SPDF.model;

import java.util.Collection;

public class Provider implements ProviderInterface {
    private String name;
    private String clientName;

    public String getName() {
        return name;
    }

    public String getClientName() {
        return clientName;
    }

    protected boolean isValid(String value, String name) {
        if (value != null && !value.trim().isEmpty()) {
            return true;
        }
        return false;
    }

    protected boolean isValid(Collection<String> value, String name) {
        if (value != null && !value.isEmpty()) {
            return true;
        }
        return false;
    }

    @Override
    public Collection<String> getScopes() {
        throw new UnsupportedOperationException("Unimplemented method 'getScope'");
    }

    @Override
    public void setScopes(String scopes) {
        throw new UnsupportedOperationException("Unimplemented method 'setScope'");
    }

    @Override
    public String getUseAsUsername() {
        throw new UnsupportedOperationException("Unimplemented method 'getUseAsUsername'");
    }

    @Override
    public void setUseAsUsername(String useAsUsername) {
        throw new UnsupportedOperationException("Unimplemented method 'setUseAsUsername'");
    }

    @Override
    public String getIssuer() {
        throw new UnsupportedOperationException("Unimplemented method 'getIssuer'");
    }

    @Override
    public void setIssuer(String issuer) {
        throw new UnsupportedOperationException("Unimplemented method 'setIssuer'");
    }

    @Override
    public String getClientSecret() {
        throw new UnsupportedOperationException("Unimplemented method 'getClientSecret'");
    }

    @Override
    public void setClientSecret(String clientSecret) {
        throw new UnsupportedOperationException("Unimplemented method 'setClientSecret'");
    }

    @Override
    public String getClientId() {
        throw new UnsupportedOperationException("Unimplemented method 'getClientId'");
    }

    @Override
    public void setClientId(String clientId) {
        throw new UnsupportedOperationException("Unimplemented method 'setClientId'");
    }
}
