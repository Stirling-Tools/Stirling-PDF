package stirling.software.SPDF.model;

public enum Role {

    // Unlimited access
    ADMIN("ROLE_ADMIN", Integer.MAX_VALUE, Integer.MAX_VALUE),

    // Unlimited access
    USER("ROLE_USER", Integer.MAX_VALUE, Integer.MAX_VALUE),

    // 40 API calls Per Day, 40 web calls
    LIMITED_API_USER("ROLE_LIMITED_API_USER", 40, 40),

    // 20 API calls Per Day, 20 web calls
    EXTRA_LIMITED_API_USER("ROLE_EXTRA_LIMITED_API_USER", 20, 20),

    // 0 API calls per day and 20 web calls
    WEB_ONLY_USER("ROLE_WEB_ONLY_USER", 0, 20),

    INTERNAL_API_USER("STIRLING-PDF-BACKEND-API-USER", Integer.MAX_VALUE, Integer.MAX_VALUE),

    DEMO_USER("ROLE_DEMO_USER", 100, 100);

    private final String roleId;
    private final int apiCallsPerDay;
    private final int webCallsPerDay;

    Role(String roleId, int apiCallsPerDay, int webCallsPerDay) {
        this.roleId = roleId;
        this.apiCallsPerDay = apiCallsPerDay;
        this.webCallsPerDay = webCallsPerDay;
    }

    public String getRoleId() {
        return roleId;
    }

    public int getApiCallsPerDay() {
        return apiCallsPerDay;
    }

    public int getWebCallsPerDay() {
        return webCallsPerDay;
    }

    public static Role fromString(String roleId) {
        for (Role role : Role.values()) {
            if (role.getRoleId().equalsIgnoreCase(roleId)) {
                return role;
            }
        }
        throw new IllegalArgumentException("No Role defined for id: " + roleId);
    }
}
