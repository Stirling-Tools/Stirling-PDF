package stirling.software.proprietary.security.model;

import java.io.Serializable;

import org.springframework.security.core.GrantedAuthority;

import com.fasterxml.jackson.annotation.JsonIgnore;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import lombok.Getter;
import lombok.Setter;

@Entity
@Table(
        name = "authorities",
        // authorities is loaded by user_id for every user (roster, login); index the FK so the
        // EAGER/batched authority load is a seek, not a scan.
        indexes = @Index(name = "idx_authorities_user_id", columnList = "user_id"))
@Getter
@Setter
public class Authority implements GrantedAuthority, Serializable {

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
