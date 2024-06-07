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
        // throw new IllegalArgumentException(getName() + ": " + name + " is required!");
    }

    protected boolean isValid(Collection<String> value, String name) {
        if (value != null && !value.isEmpty()) {
            return true;
        }
        return false;
        // throw new IllegalArgumentException(getName() + ": " + name + " is required!");
    }

    @Override
    public Collection<String> getScopes() {
        // TODO Auto-generated method stub
        throw new UnsupportedOperationException("Unimplemented method 'getScope'");
    }

    @Override
    public void setScopes(String scopes) {
        // TODO Auto-generated method stub
        throw new UnsupportedOperationException("Unimplemented method 'setScope'");
    }

    @Override
    public String getUseAsUsername() {
        // TODO Auto-generated method stub
        throw new UnsupportedOperationException("Unimplemented method 'getUseAsUsername'");
    }

    @Override
    public void setUseAsUsername(String useAsUsername) {
        // TODO Auto-generated method stub
        throw new UnsupportedOperationException("Unimplemented method 'setUseAsUsername'");
    }

    @Override
    public String getIssuer() {
        // TODO Auto-generated method stub
        throw new UnsupportedOperationException("Unimplemented method 'getIssuer'");
    }

    @Override
    public void setIssuer(String issuer) {
        // TODO Auto-generated method stub
        throw new UnsupportedOperationException("Unimplemented method 'setIssuer'");
    }

    @Override
    public String getClientSecret() {
        // TODO Auto-generated method stub
        throw new UnsupportedOperationException("Unimplemented method 'getClientSecret'");
    }

    @Override
    public void setClientSecret(String clientSecret) {
        // TODO Auto-generated method stub
        throw new UnsupportedOperationException("Unimplemented method 'setClientSecret'");
    }

    @Override
    public String getClientId() {
        // TODO Auto-generated method stub
        throw new UnsupportedOperationException("Unimplemented method 'getClientId'");
    }

    @Override
    public void setClientId(String clientId) {
        // TODO Auto-generated method stub
        throw new UnsupportedOperationException("Unimplemented method 'setClientId'");
    }
}
