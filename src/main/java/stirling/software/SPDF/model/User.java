package stirling.software.SPDF.model;

import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import jakarta.persistence.CascadeType;
import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.Lob;
import jakarta.persistence.MapKeyColumn;
import jakarta.persistence.OneToMany;
import jakarta.persistence.Table;

@Entity
@Table(name = "users")
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "user_id")
    private Long id;

    @Column(name = "username", unique = true)
    private String username;

    @Column(name = "password")
    private String password;

    @Column(name = "apiKey")
    private String apiKey;

    @Column(name = "enabled")
    private boolean enabled;

    @Column(name = "isFirstLogin")
    private Boolean isFirstLogin = false;

    @Column(name = "roleName")
    private String roleName;

    @Column(name = "authenticationtype")
    private String authenticationType;

    @OneToMany(fetch = FetchType.EAGER, cascade = CascadeType.ALL, mappedBy = "user")
    private Set<Authority> authorities = new HashSet<>();

    @ElementCollection
    @MapKeyColumn(name = "setting_key")
    @Lob
    @Column(name = "setting_value", columnDefinition = "CLOB")
    @CollectionTable(name = "user_settings", joinColumns = @JoinColumn(name = "user_id"))
    private Map<String, String> settings = new HashMap<>(); // Key-value pairs of settings.

    public String getRoleName() {
        return Role.getRoleNameByRoleId(getRolesAsString());
    }

    public boolean isFirstLogin() {
        return isFirstLogin != null && isFirstLogin;
    }

    public void setFirstLogin(boolean isFirstLogin) {
        this.isFirstLogin = isFirstLogin;
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getApiKey() {
        return apiKey;
    }

    public void setApiKey(String apiKey) {
        this.apiKey = apiKey;
    }

    public Map<String, String> getSettings() {
        return settings;
    }

    public void setSettings(Map<String, String> settings) {
        this.settings = settings;
    }

    public String getUsername() {
        return username;
    }

    public void setUsername(String username) {
        this.username = username;
    }

    public String getPassword() {
        return password;
    }

    public void setPassword(String password) {
        this.password = password;
    }

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public void setAuthenticationType(AuthenticationType authenticationType) {
        this.authenticationType = authenticationType.toString().toLowerCase();
    }

    public String getAuthenticationType() {
        return authenticationType;
    }

    public Set<Authority> getAuthorities() {
        return authorities;
    }

    public void setAuthorities(Set<Authority> authorities) {
        this.authorities = authorities;
    }

    public void addAuthorities(Set<Authority> authorities) {
        this.authorities.addAll(authorities);
    }

    public void addAuthority(Authority authorities) {
        this.authorities.add(authorities);
    }

    public String getRolesAsString() {
        return this.authorities.stream()
                .map(Authority::getAuthority)
                .collect(Collectors.joining(", "));
    }

    public boolean hasPassword() {
        return this.password != null && !this.password.isEmpty();
    }
}
