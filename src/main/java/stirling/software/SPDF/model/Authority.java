package stirling.software.SPDF.model;

import java.io.Serializable;

import jakarta.persistence.*;

@Entity
@Table(name = "authorities")
public class Authority implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "authority")
    private String authority;

    @ManyToOne
    @JoinColumn(name = "user_id")
    private User user;

    public Authority() {}

    public Authority(String authority, User user) {
        this.authority = authority;
        this.user = user;
        user.getAuthorities().add(this);
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getAuthority() {
        return authority;
    }

    public void setAuthority(String authority) {
        this.authority = authority;
    }

    public User getUser() {
        return user;
    }

    public void setUser(User user) {
        this.user = user;
    }
}
