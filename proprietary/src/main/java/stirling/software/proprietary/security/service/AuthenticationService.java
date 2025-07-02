package stirling.software.proprietary.security.service;

import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.stereotype.Service;

@Service
public class AuthenticationService implements AuthenticationServiceInterface {

    private AuthenticationManager authenticationManager;

    @Override
    public boolean verify(UserDetails userDetails) {
        UsernamePasswordAuthenticationToken authenticationToken =
                new UsernamePasswordAuthenticationToken(
                        userDetails.getUsername(),
                        userDetails.getPassword(),
                        userDetails.getAuthorities());
        var authentication = authenticationManager.authenticate(authenticationToken);
        return authentication.isAuthenticated();
    }
}
