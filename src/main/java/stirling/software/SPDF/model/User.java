package stirling.software.SPDF.model;

import java.util.Set;
import java.util.stream.Collectors;

import jakarta.persistence.CascadeType;
import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.MapKeyColumn;
import jakarta.persistence.OneToMany;
import jakarta.persistence.Table;
import jakarta.persistence.JoinColumn;
import java.util.Map;
import java.util.HashMap;
import java.util.HashSet;
@Entity
@Table(name = "users")
public class User {

    @Id
    @Column(name = "username")
    private String username;

    @Column(name = "password")
    private String password;

    @Column(name = "apiKey")
    private String apiKey;
    
    @Column(name = "enabled")
    private boolean enabled;

    @OneToMany(fetch = FetchType.EAGER, cascade = CascadeType.ALL, mappedBy = "user")
    private Set<Authority> authorities = new HashSet<>();

    @ElementCollection
    @MapKeyColumn(name = "setting_key")
    @Column(name = "setting_value")
    @CollectionTable(name = "user_settings", joinColumns = @JoinColumn(name = "username"))
    private Map<String, String> settings = new HashMap<>();  // Key-value pairs of settings.

    
    
	public String getApiKey() {
		return apiKey;
	}

	public void setApiKey(String apiKey) {
		this.apiKey = apiKey;
	}

	public Map<String, String> getSettings() {
		return settings;
	}

	public void setSettings(Map<String, String> settings) {
		this.settings = settings;
	}

	public String getUsername() {
		return username;
	}

	public void setUsername(String username) {
		this.username = username;
	}

	public String getPassword() {
		return password;
	}

	public void setPassword(String password) {
		this.password = password;
	}

	public boolean isEnabled() {
		return enabled;
	}

	public void setEnabled(boolean enabled) {
		this.enabled = enabled;
	}

	public Set<Authority> getAuthorities() {
		return authorities;
	}

	public void setAuthorities(Set<Authority> authorities) {
		this.authorities = authorities;
	}
	
	public void addAuthorities(Set<Authority> authorities) {
		this.authorities.addAll(authorities);
	}
	public void addAuthority(Authority authorities) {
		this.authorities.add(authorities);
	}
	
	public String getRolesAsString() {
	    return this.authorities.stream()
	                           .map(Authority::getAuthority)
	                           .collect(Collectors.joining(", "));
	}


}
