package stirling.software.SPDF.config.interfaces;

public interface ShowAdminInterface {
    default boolean getShowUpdateOnlyAdmins() {
        return true;
    }
}
