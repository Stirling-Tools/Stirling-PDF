package stirling.software.SPDF.pdf;

import static org.junit.jupiter.api.Assertions.assertNotNull;

import org.apache.commons.csv.CSVFormat;
import org.junit.jupiter.api.Test;

class FlexibleCSVWriterTest {

    @Test
    void testDefaultConstructor() {
        FlexibleCSVWriter writer = new FlexibleCSVWriter();
        assertNotNull(writer, "The FlexibleCSVWriter instance should not be null");
    }

    @Test
    void testConstructorWithCSVFormat() {
        CSVFormat csvFormat = CSVFormat.DEFAULT;
        FlexibleCSVWriter writer = new FlexibleCSVWriter(csvFormat);
        assertNotNull(
                writer,
                "The FlexibleCSVWriter instance should not be null when initialized with"
                        + " CSVFormat");
    }
}
