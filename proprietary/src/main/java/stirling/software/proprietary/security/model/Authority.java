<<<<<<<< HEAD:proprietary/src/main/java/stirling/software/proprietary/security/model/Authority.java
package stirling.software.proprietary.security.model;
========
package stirling.software.enterprise.security.model;
>>>>>>>> f833293d (renaming module):enterprise/src/main/java/stirling/software/enterprise/security/model/Authority.java

import java.io.Serializable;

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
    private User user;

    public Authority() {}

    public Authority(String authority, User user) {
        this.authority = authority;
        this.user = user;
        user.getAuthorities().add(this);
    }
}
