package stirling.software.SPDF.config.security;

import java.util.Map;
import java.util.Optional;
import java.util.HashMap;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import stirling.software.SPDF.repository.UserRepository;
import stirling.software.SPDF.model.Authority;
import stirling.software.SPDF.model.Role;
import stirling.software.SPDF.model.User;
@Service
public class UserService {
    
    @Autowired
    private UserRepository userRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    public void saveUser(String username, String password) {
        User user = new User();
        user.setUsername(username);
        user.setPassword(passwordEncoder.encode(password));
        user.setEnabled(true);
        userRepository.save(user);
    }

    public void saveUser(String username, String password, String role) {
        User user = new User();
        user.setUsername(username);
        user.setPassword(passwordEncoder.encode(password));
        user.addAuthority(new Authority(role, user));
        user.setEnabled(true);
        userRepository.save(user);
    }
    
    public void deleteUser(String username) {
    	 Optional<User> userOpt = userRepository.findByUsername(username);
         if (userOpt.isPresent()) {
        	 userRepository.delete(userOpt.get());
         }
    }
    
    public boolean usernameExists(String username) {
        return userRepository.findByUsername(username) != null;
    }
    
    public boolean hasUsers() {
        return userRepository.count() > 0;
    }
    
    public void updateUserSettings(String username, Map<String, String> updates) {
        Optional<User> userOpt = userRepository.findByUsername(username);
        if (userOpt.isPresent()) {
            User user = userOpt.get();
            Map<String, String> settingsMap = user.getSettings();

            if(settingsMap == null) {
                settingsMap = new HashMap<String,String>();
            } 
            settingsMap.clear();
            settingsMap.putAll(updates);
            user.setSettings(settingsMap);

            userRepository.save(user);
        } 
    }

    
}
