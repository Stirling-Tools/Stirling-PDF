package stirling.software.common.configuration.interfaces;

import org.junit.jupiter.api.Test;

class ShowAdminInterfaceTest {

    // Create a simple implementation for testing
    static class TestImpl implements ShowAdminInterface {}

    @Test
    void getShowUpdateOnlyAdmins_returnsTrueByDefault() {
        ShowAdminInterface instance = new TestImpl();
        org.junit.jupiter.api.Assertions.assertTrue(
                instance.getShowUpdateOnlyAdmins(), "Default should return true");
    }
}
