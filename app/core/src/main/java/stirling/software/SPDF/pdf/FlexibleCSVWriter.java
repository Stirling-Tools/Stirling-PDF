package stirling.software.SPDF.pdf;

import org.apache.commons.csv.CSVFormat;

import technology.tabula.writers.CSVWriter;

public class FlexibleCSVWriter extends CSVWriter {

    public FlexibleCSVWriter() {
        super();
    }

    public FlexibleCSVWriter(CSVFormat csvFormat) {
        super(csvFormat);
    }
}
