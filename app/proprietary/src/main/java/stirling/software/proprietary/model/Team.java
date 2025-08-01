package stirling.software.proprietary.model;

import java.io.Serializable;
import java.util.HashSet;
import java.util.Set;

import jakarta.persistence.*;

import lombok.*;

import stirling.software.proprietary.security.model.User;

@Entity
@Table(name = "teams", uniqueConstraints = @UniqueConstraint(columnNames = {"name", "org_id"}))
@NoArgsConstructor
@Getter
@Setter
@EqualsAndHashCode(onlyExplicitlyIncluded = true)
@ToString(onlyExplicitlyIncluded = true)
public class Team implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "team_id")
    private Long id;

    @Column(name = "name", nullable = false)
    private String name;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(
            name = "org_id",
            nullable = true) // Nullable for backward compatibility during migration
    private Organization organization;

    @OneToMany(mappedBy = "team", cascade = CascadeType.ALL, orphanRemoval = true)
    private Set<User> users = new HashSet<>();

    public void addUser(User user) {
        users.add(user);
        user.setTeam(this);
    }

    public void removeUser(User user) {
        users.remove(user);
        user.setTeam(null);
    }
}
