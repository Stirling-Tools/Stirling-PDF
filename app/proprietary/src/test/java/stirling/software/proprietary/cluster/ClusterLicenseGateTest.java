package stirling.software.proprietary.cluster;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.lang.reflect.Field;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;

import org.junit.jupiter.api.Test;

class ClusterLicenseGateTest {

    private void injectRunningProOrHigher(ClusterLicenseGate gate, Boolean value) throws Exception {
        Field f = ClusterLicenseGate.class.getDeclaredField("runningProOrHigher");
        f.setAccessible(true);
        f.set(gate, value);
    }

    private void invokeVerify(ClusterLicenseGate gate) throws Throwable {
        Method m = ClusterLicenseGate.class.getDeclaredMethod("verifyLicense");
        m.setAccessible(true);
        try {
            m.invoke(gate);
        } catch (InvocationTargetException e) {
            throw e.getCause();
        }
    }

    @Test
    void serverOrEnterpriseLicense_allowsClusterMode() throws Throwable {
        ClusterLicenseGate gate = new ClusterLicenseGate();
        injectRunningProOrHigher(gate, Boolean.TRUE);
        assertDoesNotThrow(() -> invokeVerify(gate));
    }

    @Test
    void normalLicense_refusesClusterMode_withActionableMessage() throws Exception {
        ClusterLicenseGate gate = new ClusterLicenseGate();
        injectRunningProOrHigher(gate, Boolean.FALSE);
        IllegalStateException ex =
                assertThrows(IllegalStateException.class, () -> invokeVerify(gate));
        String msg = ex.getMessage();
        // The error message must tell the operator exactly what to do.
        assertTrue(msg.contains("SERVER"), "message must mention SERVER license tier: " + msg);
        assertTrue(msg.contains("ENTERPRISE"), "message must mention ENTERPRISE tier: " + msg);
        assertTrue(
                msg.contains("stirling.premium.key") || msg.contains("license key"),
                "message must explain how to set the license: " + msg);
        assertTrue(
                msg.contains("cluster.enabled=false"),
                "message must offer the opt-out (disable cluster): " + msg);
    }

    @Test
    void saasFlavor_bypassesGate_whenRunningProOrHigherBeanAbsent() throws Throwable {
        // In saas builds the runningProOrHigher bean is absent (@Autowired required=false -> null).
        ClusterLicenseGate gate = new ClusterLicenseGate();
        assertDoesNotThrow(() -> invokeVerify(gate));
    }
}
