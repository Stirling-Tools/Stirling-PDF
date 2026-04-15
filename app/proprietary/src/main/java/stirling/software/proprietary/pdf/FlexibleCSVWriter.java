package stirling.software.proprietary.pdf;

import org.apache.commons.csv.CSVFormat;

import technology.tabula.writers.CSVWriter;

/** Exposes Tabula's protected {@link CSVWriter#CSVWriter(CSVFormat)} constructor. */
public class FlexibleCSVWriter extends CSVWriter {

    public FlexibleCSVWriter() {
        super();
    }

    public FlexibleCSVWriter(CSVFormat csvFormat) {
        super(csvFormat);
    }
}
