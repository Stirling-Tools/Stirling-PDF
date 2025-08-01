package stirling.software.proprietary.security.model;

import java.io.Serializable;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

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
public class User implements Serializable {

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

    @Column(name = "roleName")
    private String roleName;

    @Column(name = "authenticationtype")
    private String authenticationType;

    @OneToMany(
            fetch = FetchType.EAGER,
            cascade = CascadeType.ALL,
            mappedBy = "user",
            orphanRemoval = true)
    private Set<Authority> authorities = new HashSet<>();

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "team_id")
    private Team team;

    @ElementCollection
    @MapKeyColumn(name = "setting_key")
    @Lob
    @Column(name = "setting_value", columnDefinition = "text")
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

    public void setAuthenticationType(AuthenticationType authenticationType) {
        this.authenticationType = authenticationType.toString().toLowerCase();
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

    public stirling.software.proprietary.model.Organization getOrganization() {
        return this.team != null ? this.team.getOrganization() : null;
    }

    // Role-based permission methods
    public Role getUserRole() {
        String roleString = getRolesAsString();
        if (roleString == null || roleString.isEmpty()) return Role.USER;

        try {
            return Role.fromString(roleString);
        } catch (IllegalArgumentException e) {
            return Role.USER; // Default fallback
        }
    }

    public boolean isSystemAdmin() {
        Role role = getUserRole();
        return role.isSystemAdmin();
    }

    public boolean isOrgAdmin() {
        Role role = getUserRole();
        return role.isOrgAdmin();
    }

    public boolean isTeamLead() {
        Role role = getUserRole();
        return role.isTeamLead();
    }

    public boolean canManageUser(User otherUser) {
        // System admins can manage anyone
        if (isSystemAdmin()) return true;

        // Org admins can manage users in their organization
        if (isOrgAdmin()) {
            stirling.software.proprietary.model.Organization thisOrg = getOrganization();
            stirling.software.proprietary.model.Organization otherOrg = otherUser.getOrganization();
            return thisOrg != null && otherOrg != null && thisOrg.getId().equals(otherOrg.getId());
        }

        // Team leads can manage users in their team
        if (isTeamLead()) {
            return this.team != null
                    && otherUser.team != null
                    && this.team.getId().equals(otherUser.team.getId());
        }

        return false;
    }

    public boolean canManageTeam(stirling.software.proprietary.model.Team targetTeam) {
        if (targetTeam == null) return false;

        // System admins can manage any team
        if (isSystemAdmin()) return true;

        // Org admins can manage teams in their organization
        if (isOrgAdmin()) {
            stirling.software.proprietary.model.Organization thisOrg = getOrganization();
            stirling.software.proprietary.model.Organization teamOrg = targetTeam.getOrganization();
            return thisOrg != null && teamOrg != null && thisOrg.getId().equals(teamOrg.getId());
        }

        // Team leads can only manage their own team
        if (isTeamLead()) {
            return this.team != null && this.team.getId().equals(targetTeam.getId());
        }

        return false;
    }

    public void setUserRole(Role role) {
        // Clear existing authorities
        this.authorities.clear();

        // Add new authority
        Authority authority = new Authority();
        authority.setAuthority(role.getRoleId());
        authority.setUser(this);
        this.authorities.add(authority);
    }
}
