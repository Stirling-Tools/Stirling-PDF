package stirling.software.SPDF.model;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

class DependencyTest {

    private Dependency populated() {
        Dependency dep = new Dependency();
        dep.setModuleName("commons-lang3");
        dep.setModuleUrl("https://example.com/lang3");
        dep.setModuleVersion("3.14.0");
        dep.setModuleLicense("Apache-2.0");
        dep.setModuleLicenseUrl("https://example.com/license");
        return dep;
    }

    @Nested
    @DisplayName("accessors")
    class Accessors {

        @Test
        @DisplayName("getters return values set via setters")
        void roundTrip() {
            Dependency dep = populated();

            assertThat(dep.getModuleName()).isEqualTo("commons-lang3");
            assertThat(dep.getModuleUrl()).isEqualTo("https://example.com/lang3");
            assertThat(dep.getModuleVersion()).isEqualTo("3.14.0");
            assertThat(dep.getModuleLicense()).isEqualTo("Apache-2.0");
            assertThat(dep.getModuleLicenseUrl()).isEqualTo("https://example.com/license");
        }

        @Test
        @DisplayName("fields default to null")
        void defaultsNull() {
            Dependency dep = new Dependency();

            assertThat(dep.getModuleName()).isNull();
            assertThat(dep.getModuleVersion()).isNull();
        }
    }

    @Nested
    @DisplayName("equals/hashCode/toString")
    class Equality {

        @Test
        @DisplayName("identical content is equal and shares hashCode")
        void equalContent() {
            assertThat(populated()).isEqualTo(populated()).hasSameHashCodeAs(populated());
        }

        @Test
        @DisplayName("differing content is not equal")
        void differingContent() {
            Dependency other = populated();
            other.setModuleVersion("9.9.9");

            assertThat(populated()).isNotEqualTo(other).isNotEqualTo(null).isNotEqualTo("str");
        }

        @Test
        @DisplayName("toString lists field values")
        void toStringContent() {
            assertThat(populated().toString()).contains("commons-lang3").contains("Apache-2.0");
        }
    }
}
