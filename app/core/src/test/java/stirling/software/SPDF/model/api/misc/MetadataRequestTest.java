package stirling.software.SPDF.model.api.misc;

import static org.assertj.core.api.Assertions.*;

import java.util.Map;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

@DisplayName("MetadataRequest")
class MetadataRequestTest {

    @Nested
    @DisplayName("defaults")
    class Defaults {

        @Test
        @DisplayName("all fields default to null on a fresh instance")
        void defaultsNull() {
            MetadataRequest req = new MetadataRequest();
            assertThat(req.getDeleteAll()).isNull();
            assertThat(req.getAuthor()).isNull();
            assertThat(req.getCreationDate()).isNull();
            assertThat(req.getCreator()).isNull();
            assertThat(req.getKeywords()).isNull();
            assertThat(req.getModificationDate()).isNull();
            assertThat(req.getProducer()).isNull();
            assertThat(req.getSubject()).isNull();
            assertThat(req.getTitle()).isNull();
            assertThat(req.getTrapped()).isNull();
            assertThat(req.getAllRequestParams()).isNull();
        }
    }

    @Nested
    @DisplayName("getters and setters")
    class GettersAndSetters {

        @Test
        @DisplayName("all fields round-trip")
        void allFieldsRoundTrip() {
            MetadataRequest req = new MetadataRequest();
            Map<String, String> params = Map.of("customKey1", "customValue1");
            req.setDeleteAll(Boolean.TRUE);
            req.setAuthor("Anthony");
            req.setCreationDate("2023/10/01 12:00:00");
            req.setCreator("creatorApp");
            req.setKeywords("pdf,test");
            req.setModificationDate("2024/01/01 09:30:00");
            req.setProducer("producerApp");
            req.setSubject("subject text");
            req.setTitle("My Title");
            req.setTrapped("True");
            req.setAllRequestParams(params);

            assertThat(req.getDeleteAll()).isTrue();
            assertThat(req.getAuthor()).isEqualTo("Anthony");
            assertThat(req.getCreationDate()).isEqualTo("2023/10/01 12:00:00");
            assertThat(req.getCreator()).isEqualTo("creatorApp");
            assertThat(req.getKeywords()).isEqualTo("pdf,test");
            assertThat(req.getModificationDate()).isEqualTo("2024/01/01 09:30:00");
            assertThat(req.getProducer()).isEqualTo("producerApp");
            assertThat(req.getSubject()).isEqualTo("subject text");
            assertThat(req.getTitle()).isEqualTo("My Title");
            assertThat(req.getTrapped()).isEqualTo("True");
            assertThat(req.getAllRequestParams())
                    .containsExactlyEntriesOf(Map.of("customKey1", "customValue1"));
        }

        @Test
        @DisplayName("inherited fileId round-trips")
        void inheritedFileIdRoundTrip() {
            MetadataRequest req = new MetadataRequest();
            req.setFileId("file-4");
            assertThat(req.getFileId()).isEqualTo("file-4");
        }
    }

    @Nested
    @DisplayName("equals and hashCode")
    class EqualsAndHashCode {

        @Test
        @DisplayName("two fresh defaults are equal and share hashCode")
        void freshDefaultsEqual() {
            MetadataRequest a = new MetadataRequest();
            MetadataRequest b = new MetadataRequest();
            assertThat(a).isEqualTo(b);
            assertThat(a).hasSameHashCodeAs(b);
        }

        @Test
        @DisplayName("differ when a subclass field differs")
        void differBySubclassField() {
            MetadataRequest a = new MetadataRequest();
            MetadataRequest b = new MetadataRequest();
            b.setAuthor("someone");
            assertThat(a).isNotEqualTo(b);
        }

        @Test
        @DisplayName("not equal to null or other type")
        void notEqualToNullOrOtherType() {
            MetadataRequest a = new MetadataRequest();
            assertThat(a).isNotEqualTo(null);
            assertThat(a).isNotEqualTo("a string");
        }
    }

    @Nested
    @DisplayName("toString")
    class ToString {

        @Test
        @DisplayName("is non-null and contains a field value")
        void toStringContainsField() {
            MetadataRequest req = new MetadataRequest();
            req.setTitle("My Title");
            assertThat(req.toString()).isNotNull().contains("title=My Title");
        }
    }
}
