package stirling.software.proprietary.security.service;

import org.springframework.security.core.userdetails.UserDetails;

public interface AuthenticationServiceInterface {
    boolean verify(UserDetails userDetails);
}
