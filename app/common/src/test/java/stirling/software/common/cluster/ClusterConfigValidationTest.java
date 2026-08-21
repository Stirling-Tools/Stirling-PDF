package stirling.software.common.cluster;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.lang.reflect.Method;

import org.junit.jupiter.api.Test;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.ApplicationProperties.Cluster;

class ClusterConfigValidationTest {

    @Test
    void validationPassesWhenDisabled() {
        ApplicationProperties props = new ApplicationProperties();
        ClusterConfig config = new ClusterConfig(props);
        assertDoesNotThrow(() -> invokeValidate(config));
    }

    @Test
    void validationFailsWhenValkeyEnabledWithoutUrl() {
        ApplicationProperties props = new ApplicationProperties();
        Cluster cluster = props.getCluster();
        cluster.setEnabled(true);
        cluster.setBackplane("valkey");
        ClusterConfig config = new ClusterConfig(props);
        assertThrows(IllegalStateException.class, () -> invokeValidate(config));
    }

    @Test
    void validationPassesWhenValkeyEnabledWithUrl() {
        ApplicationProperties props = new ApplicationProperties();
        Cluster cluster = props.getCluster();
        cluster.setEnabled(true);
        cluster.setBackplane("valkey");
        cluster.getValkey().setUrl("redis://localhost:6379");
        ClusterConfig config = new ClusterConfig(props);
        assertDoesNotThrow(() -> invokeValidate(config));
    }

    @Test
    void validationPassesWhenInProcessEnabled() {
        ApplicationProperties props = new ApplicationProperties();
        Cluster cluster = props.getCluster();
        cluster.setEnabled(true);
        cluster.setBackplane("inprocess");
        ClusterConfig config = new ClusterConfig(props);
        assertDoesNotThrow(() -> invokeValidate(config));
    }

    private void invokeValidate(ClusterConfig config) throws Exception {
        Method m = ClusterConfig.class.getDeclaredMethod("validate");
        m.setAccessible(true);
        try {
            m.invoke(config);
        } catch (java.lang.reflect.InvocationTargetException ex) {
            if (ex.getCause() instanceof RuntimeException re) {
                throw re;
            }
            throw ex;
        }
    }
}
