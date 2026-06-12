package stirling.software.proprietary.security.model;

import java.io.Serializable;

import com.fasterxml.jackson.annotation.JsonIgnore;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import lombok.Getter;
import lombok.Setter;

// TODO: Migration required - this entity previously implemented Spring Security's
// org.springframework.security.core.GrantedAuthority. That interface only required
// String getAuthority(), which the Lombok @Getter on the 'authority' field still
// provides. Quarkus uses its own role model (SecurityIdentity roles); when wiring the
// IdentityProvider that loads users, map this 'authority' value into the granted roles.
@Entity
@Table(name = "authorities")
@Getter
@Setter
public class Authority implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "authority")
    private String authority;

    @ManyToOne
    @JoinColumn(name = "user_id")
    @JsonIgnore
    private User user;

    public Authority() {}

    public Authority(String authority, User user) {
        this.authority = authority;
        this.user = user;
        user.getAuthorities().add(this);
    }
}
