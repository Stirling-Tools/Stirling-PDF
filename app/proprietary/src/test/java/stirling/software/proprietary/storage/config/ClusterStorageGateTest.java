package stirling.software.proprietary.storage.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.lang.reflect.Field;

import org.junit.jupiter.api.Test;

import stirling.software.common.model.ApplicationProperties;

class ClusterStorageGateTest {

    @Test
    void clusterDisabled_localStorage_passes() {
        ClusterStorageGate gate = newGate(false, true, "local", "local");
        assertThatCode(gate::validate).doesNotThrowAnyException();
    }

    @Test
    void clusterDisabled_s3Storage_passes() {
        ClusterStorageGate gate = newGate(false, true, "s3", "local");
        assertThatCode(gate::validate).doesNotThrowAnyException();
    }

    @Test
    void clusterEnabled_storageDisabled_butArtifactStoreLocal_fails() {
        ClusterStorageGate gate = newGate(true, false, "local", "local");
        assertThatThrownBy(gate::validate)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("cluster.artifactStore=local");
    }

    @Test
    void clusterEnabled_storageDisabled_artifactStoreS3_passes() {
        ClusterStorageGate gate = newGate(true, false, "local", "s3");
        assertThatCode(gate::validate).doesNotThrowAnyException();
    }

    @Test
    void clusterEnabled_localStorage_fails() {
        ClusterStorageGate gate = newGate(true, true, "local", "s3");
        assertThatThrownBy(gate::validate)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("storage.provider=local")
                .hasMessageContaining("storage.provider=s3")
                .hasMessageContaining("storage.provider=database");
    }

    @Test
    void clusterEnabled_localStorage_caseInsensitive_fails() {
        ClusterStorageGate gate = newGate(true, true, "LOCAL", "s3");
        assertThatThrownBy(gate::validate).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void clusterEnabled_nullProvider_treatedAsLocal_fails() {
        ClusterStorageGate gate = newGate(true, true, null, "s3");
        assertThatThrownBy(gate::validate)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("storage.provider=local");
    }

    @Test
    void clusterEnabled_s3Storage_andArtifactStoreS3_passes() {
        ClusterStorageGate gate = newGate(true, true, "s3", "s3");
        assertThatCode(gate::validate).doesNotThrowAnyException();
    }

    @Test
    void clusterEnabled_databaseStorage_andArtifactStoreS3_passes() {
        ClusterStorageGate gate = newGate(true, true, "database", "s3");
        assertThatCode(gate::validate).doesNotThrowAnyException();
    }

    @Test
    void clusterEnabled_s3Storage_butLocalArtifactStore_fails() {
        ClusterStorageGate gate = newGate(true, true, "s3", "local");
        assertThatThrownBy(gate::validate)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("cluster.artifactStore=local");
    }

    @Test
    void clusterEnabled_localArtifactStore_caseInsensitive_fails() {
        ClusterStorageGate gate = newGate(true, true, "s3", "LOCAL");
        assertThatThrownBy(gate::validate).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void clusterEnabled_nullArtifactStore_treatedAsLocal_fails() {
        ClusterStorageGate gate = newGate(true, true, "s3", null);
        assertThatThrownBy(gate::validate)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("cluster.artifactStore=local");
    }

    @Test
    void clusterEnabled_nullStorageObject_passesProviderCheck_butArtifactStoreStillEvaluated() {
        ApplicationProperties props = new ApplicationProperties();
        props.setStorage(null);
        ClusterStorageGate gate = new ClusterStorageGate(props);
        setClusterEnabled(gate, true);
        setClusterArtifactStore(gate, "s3");
        assertThatCode(gate::validate).doesNotThrowAnyException();
    }

    private static ClusterStorageGate newGate(
            boolean clusterEnabled,
            boolean storageEnabled,
            String provider,
            String clusterArtifactStore) {
        ApplicationProperties props = new ApplicationProperties();
        ApplicationProperties.Storage storage = new ApplicationProperties.Storage();
        storage.setEnabled(storageEnabled);
        storage.setProvider(provider);
        props.setStorage(storage);
        ClusterStorageGate gate = new ClusterStorageGate(props);
        setClusterEnabled(gate, clusterEnabled);
        setClusterArtifactStore(gate, clusterArtifactStore);
        return gate;
    }

    private static void setClusterEnabled(ClusterStorageGate gate, boolean enabled) {
        try {
            Field f = ClusterStorageGate.class.getDeclaredField("clusterEnabled");
            f.setAccessible(true);
            f.setBoolean(gate, enabled);
            assertThat(f.getBoolean(gate)).isEqualTo(enabled);
        } catch (ReflectiveOperationException e) {
            throw new AssertionError("Failed to set clusterEnabled via reflection", e);
        }
    }

    private static void setClusterArtifactStore(ClusterStorageGate gate, String value) {
        try {
            Field f = ClusterStorageGate.class.getDeclaredField("clusterArtifactStore");
            f.setAccessible(true);
            f.set(gate, value);
        } catch (ReflectiveOperationException e) {
            throw new AssertionError("Failed to set clusterArtifactStore via reflection", e);
        }
    }
}
