package stirling.software.proprietary.security.service;

import org.springframework.security.core.userdetails.UserDetails;

public interface JWTServiceInterface {

    String generateToken(UserDetails userDetails);

    String extractUsername(String jwt);

    boolean isTokenValid(String jwt, UserDetails userDetails);
}
