package stirling.software.proprietary.security.model;

import java.io.Serializable;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

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
// TODO: Migration required - this entity previously implemented
// org.springframework.security.core.userdetails.UserDetails. Quarkus has no UserDetails
// contract; the user-loading/principal adaptation must be rehosted in a Quarkus
// IdentityProvider (or SecurityIdentityAugmentor) that builds a SecurityIdentity from this
// entity. The Lombok getters still expose getUsername()/getPassword()/getAuthorities()/
// isEnabled() so that adapter can read them directly. isEnabled() override below is retained
// as plain business logic (null-safe enabled flag).
public class User implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "user_id")
    @EqualsAndHashCode.Include
    private Long id;

    @Column(name = "username", unique = true)
    private String username;

    @Column(name = "password")
    @JsonIgnore
    private String password;

    @Column(name = "apiKey", unique = true)
    @JsonIgnore
    private String apiKey;

    // Boxed so SaaS rows from Supabase can leave it null; isEnabled() treats null as enabled.
    @Column(name = "enabled")
    private Boolean enabled;

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

    @Column(name = "email", unique = true)
    private String email;

    // SaaS-only: Supabase user UUID. Null in OSS / proprietary deployments.
    @Column(name = "supabase_id", unique = true)
    private UUID supabaseId;

    @OneToMany(fetch = FetchType.EAGER, cascade = CascadeType.ALL, mappedBy = "user")
    private Set<Authority> authorities = new HashSet<>();

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "team_id")
    private Team team;

    @ElementCollection
    @MapKeyColumn(name = "setting_key")
    @Lob
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

    // No longer @Override: previously satisfied UserDetails.isEnabled().
    public boolean isEnabled() {
        return enabled == null || enabled;
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
