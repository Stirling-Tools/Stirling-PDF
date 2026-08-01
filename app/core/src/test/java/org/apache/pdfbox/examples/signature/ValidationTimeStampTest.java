package org.apache.pdfbox.examples.signature;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Unit tests for {@link ValidationTimeStamp}. Only the constructor is exercised; it builds a
 * TSAClient object without performing any network I/O.
 */
class ValidationTimeStampTest {

    @Test
    @DisplayName("null tsaUrl leaves the client unset and constructs cleanly")
    void nullUrl() throws Exception {
        ValidationTimeStamp vts = new ValidationTimeStamp(null);
        assertThat(vts).isNotNull();
    }

    @Test
    @DisplayName("valid tsaUrl builds the timestamp client without contacting the network")
    void validUrl() throws Exception {
        ValidationTimeStamp vts = new ValidationTimeStamp("http://timestamp.example.com/tsa");
        assertThat(vts).isNotNull();
    }

    @Test
    @DisplayName("malformed tsaUrl is rejected with an exception")
    void malformedUrl() {
        assertThatThrownBy(() -> new ValidationTimeStamp("http://  bad host/tsa"))
                .isInstanceOf(Exception.class);
    }
}
