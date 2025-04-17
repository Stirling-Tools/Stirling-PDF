package stirling.software.spdf.proprietary.security.model;

public interface AdminInterface {
    default boolean getShowUpdateOnlyAdmins() {
        return true;
    }
}
