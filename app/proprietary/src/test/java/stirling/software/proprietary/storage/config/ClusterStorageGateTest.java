package stirling.software.proprietary.storage.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.lang.reflect.Field;

import org.junit.jupiter.api.Test;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.configuration.ee.KeygenLicenseVerifier.License;
import stirling.software.proprietary.security.configuration.ee.LicenseKeyChecker;

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
        ClusterStorageGate gate = new ClusterStorageGate(props, mockLicenseChecker(License.SERVER));
        setClusterEnabled(gate, true);
        setClusterArtifactStore(gate, "s3");
        assertThatCode(gate::validate).doesNotThrowAnyException();
    }

    // ----- License gating for premium storage backends -----

    @Test
    void storageProviderS3_withoutProLicense_throws() {
        ClusterStorageGate gate = newGate(false, true, "s3", "local", License.NORMAL);
        assertThatThrownBy(gate::validate)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("storage.provider=s3 requires a Pro or Enterprise license");
    }

    @Test
    void storageProviderDatabase_withoutProLicense_throws() {
        ClusterStorageGate gate = newGate(false, true, "database", "local", License.NORMAL);
        assertThatThrownBy(gate::validate)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining(
                        "storage.provider=database requires a Pro or Enterprise license");
    }

    @Test
    void storageProviderS3_withServerLicense_passes() {
        ClusterStorageGate gate = newGate(false, true, "s3", "local", License.SERVER);
        assertThatCode(gate::validate).doesNotThrowAnyException();
    }

    @Test
    void storageProviderS3_withEnterpriseLicense_passes() {
        ClusterStorageGate gate = newGate(false, true, "s3", "local", License.ENTERPRISE);
        assertThatCode(gate::validate).doesNotThrowAnyException();
    }

    @Test
    void storageProviderDatabase_withServerLicense_passes() {
        ClusterStorageGate gate = newGate(false, true, "database", "local", License.SERVER);
        assertThatCode(gate::validate).doesNotThrowAnyException();
    }

    @Test
    void clusterArtifactStoreS3_withoutProLicense_throws() {
        ClusterStorageGate gate = newGate(false, false, "local", "s3", License.NORMAL);
        assertThatThrownBy(gate::validate)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining(
                        "cluster.artifactStore=s3 requires a Pro or Enterprise license");
    }

    @Test
    void clusterArtifactStoreS3_withServerLicense_passes() {
        ClusterStorageGate gate = newGate(false, false, "local", "s3", License.SERVER);
        assertThatCode(gate::validate).doesNotThrowAnyException();
    }

    @Test
    void localOnly_normalLicense_passes_licenseNotChecked() {
        ClusterStorageGate gate = newGate(false, true, "local", "local", License.NORMAL);
        assertThatCode(gate::validate).doesNotThrowAnyException();
    }

    @Test
    void storageDisabled_butArtifactStoreS3_withoutLicense_stillThrows() {
        ClusterStorageGate gate = newGate(false, false, "local", "s3", License.NORMAL);
        assertThatThrownBy(gate::validate)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("cluster.artifactStore=s3");
    }

    private static ClusterStorageGate newGate(
            boolean clusterEnabled,
            boolean storageEnabled,
            String provider,
            String clusterArtifactStore) {
        // Default to a SERVER license so existing tests (which assert clustering / artifact-store
        // rules independently of license) continue to pass. License-specific tests below build
        // gates with explicit license tiers.
        return newGate(
                clusterEnabled, storageEnabled, provider, clusterArtifactStore, License.SERVER);
    }

    private static ClusterStorageGate newGate(
            boolean clusterEnabled,
            boolean storageEnabled,
            String provider,
            String clusterArtifactStore,
            License license) {
        ApplicationProperties props = new ApplicationProperties();
        ApplicationProperties.Storage storage = new ApplicationProperties.Storage();
        storage.setEnabled(storageEnabled);
        storage.setProvider(provider);
        props.setStorage(storage);
        LicenseKeyChecker checker = mockLicenseChecker(license);
        ClusterStorageGate gate = new ClusterStorageGate(props, checker);
        setClusterEnabled(gate, clusterEnabled);
        setClusterArtifactStore(gate, clusterArtifactStore);
        return gate;
    }

    private static LicenseKeyChecker mockLicenseChecker(License license) {
        LicenseKeyChecker checker = mock(LicenseKeyChecker.class);
        when(checker.getPremiumLicenseEnabledResult()).thenReturn(license);
        if (license == License.SERVER || license == License.ENTERPRISE) {
            doNothing().when(checker).requireProOrEnterprise(anyString());
        } else {
            // Mirror real LicenseKeyChecker.requireProOrEnterprise so message assertions match.
            org.mockito.Mockito.doAnswer(
                            inv -> {
                                throw new IllegalStateException(
                                        inv.getArgument(0)
                                                + " requires a Pro or Enterprise license");
                            })
                    .when(checker)
                    .requireProOrEnterprise(anyString());
        }
        return checker;
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
