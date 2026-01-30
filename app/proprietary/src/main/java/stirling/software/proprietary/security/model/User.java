package stirling.software.proprietary.security.model;

import java.io.Serializable;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;
import org.springframework.security.core.userdetails.UserDetails;

import com.fasterxml.jackson.annotation.JsonIgnore;

import jakarta.persistence.*;

import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import lombok.ToString;

import stirling.software.common.model.enumeration.Role;
import stirling.software.proprietary.model.Team;

@Entity
@Table(name = "users")
@NoArgsConstructor
@Getter
@Setter
@EqualsAndHashCode(onlyExplicitlyIncluded = true)
@ToString(onlyExplicitlyIncluded = true)
public class User implements UserDetails, Serializable {

    private static final long serialVersionUID = 1L;

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

    @Column(name = "hasCompletedInitialSetup")
    private Boolean hasCompletedInitialSetup = false;

    @Column(name = "forcePasswordChange")
    private Boolean forcePasswordChange = false;

    @Column(name = "roleName")
    private String roleName;

    @Column(name = "authenticationtype")
    private String authenticationType;

    @Column(name = "sso_provider_id")
    private String ssoProviderId;

    @Column(name = "sso_provider")
    private String ssoProvider;

    @Column(name = "oauth_grandfathered")
    private Boolean oauthGrandfathered = false;

    @OneToMany(fetch = FetchType.EAGER, cascade = CascadeType.ALL, mappedBy = "user")
    private Set<Authority> authorities = new HashSet<>();

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "team_id")
    private Team team;

    @ElementCollection
    @MapKeyColumn(name = "setting_key")
    @Column(name = "setting_value", columnDefinition = "text")
    @CollectionTable(name = "user_settings", joinColumns = @JoinColumn(name = "user_id"))
    @JsonIgnore
    private Map<String, String> settings = new HashMap<>(); // Key-value pairs of settings.

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    public String getRoleName() {
        return Role.getRoleNameByRoleId(getRolesAsString());
    }

    public boolean isFirstLogin() {
        return isFirstLogin != null && isFirstLogin;
    }

    public void setFirstLogin(boolean isFirstLogin) {
        this.isFirstLogin = isFirstLogin;
    }

    public boolean hasCompletedInitialSetup() {
        return hasCompletedInitialSetup != null && hasCompletedInitialSetup;
    }

    public void setHasCompletedInitialSetup(boolean hasCompletedInitialSetup) {
        this.hasCompletedInitialSetup = hasCompletedInitialSetup;
    }

    public boolean isForcePasswordChange() {
        return forcePasswordChange != null && forcePasswordChange;
    }

    public void setForcePasswordChange(boolean forcePasswordChange) {
        this.forcePasswordChange = forcePasswordChange;
    }

    public void setAuthenticationType(AuthenticationType authenticationType) {
        this.authenticationType = authenticationType.toString().toLowerCase(Locale.ROOT);
    }

    public void addAuthorities(Set<Authority> authorities) {
        this.authorities.addAll(authorities);
    }

    public void addAuthority(Authority authority) {
        this.authorities.add(authority);
    }

    public String getRolesAsString() {
        return this.authorities.stream()
                .map(Authority::getAuthority)
                .collect(Collectors.joining(", "));
    }

    public boolean hasPassword() {
        return this.password != null && !this.password.isEmpty();
    }

    public boolean isOauthGrandfathered() {
        return oauthGrandfathered != null && oauthGrandfathered;
    }

    public void setOauthGrandfathered(boolean oauthGrandfathered) {
        this.oauthGrandfathered = oauthGrandfathered;
    }
}
