package stirling.software.SPDF.model;

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

    @OneToMany(fetch = FetchType.EAGER, cascade = CascadeType.ALL, mappedBy = "user")
    private Set<Authority> authorities = new HashSet<>();

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
}
