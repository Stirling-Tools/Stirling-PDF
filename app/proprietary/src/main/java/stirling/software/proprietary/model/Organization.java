package stirling.software.proprietary.model;

import java.io.Serializable;
import java.util.HashSet;
import java.util.Set;

import jakarta.persistence.*;

import lombok.*;

@Entity
@Table(name = "organizations")
@NoArgsConstructor
@Getter
@Setter
@EqualsAndHashCode(onlyExplicitlyIncluded = true)
@ToString(onlyExplicitlyIncluded = true)
public class Organization implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "org_id")
    private Long id;

    @Column(name = "name", unique = true, nullable = false)
    private String name;

    @Column(name = "description")
    private String description;

    @OneToMany(mappedBy = "organization", cascade = CascadeType.ALL, orphanRemoval = true)
    private Set<Team> teams = new HashSet<>();

    public void addTeam(Team team) {
        teams.add(team);
        team.setOrganization(this);
    }

    public void removeTeam(Team team) {
        teams.remove(team);
        team.setOrganization(null);
    }
}
