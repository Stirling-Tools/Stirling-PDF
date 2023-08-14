package stirling.software.SPDF.config.security;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import jakarta.annotation.PostConstruct;
import stirling.software.SPDF.model.Role;
@Component
public class InitialSetup {

    @Autowired
    private UserService userService;

    @PostConstruct
    public void init() {
        if(!userService.hasUsers()) {
            String initialUsername = System.getenv("INITIAL_USERNAME");
            String initialPassword = System.getenv("INITIAL_PASSWORD");
            if(initialUsername != null && initialPassword != null) {
                userService.saveUser(initialUsername, initialPassword, Role.ADMIN.getRoleId());
            }
             else {
            	userService.saveUser("admin", "password", Role.ADMIN.getRoleId());
            }
        }
    }
}
