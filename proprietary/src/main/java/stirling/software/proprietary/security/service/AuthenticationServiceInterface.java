package stirling.software.proprietary.security.service;

import stirling.software.proprietary.security.model.User;

public interface AuthenticationServiceInterface {
    boolean verify(User user);
}
