package stirling.software.SPDF.service;

import org.apache.pdfbox.io.RandomAccessStreamCache.StreamCacheCreateFunction;

class SpyPDFDocumentFactory extends CustomPDFDocumentFactory {
    enum StrategyType {
        MEMORY_ONLY,
        MIXED,
        TEMP_FILE
    }

    public StrategyType lastStrategyUsed;

    public SpyPDFDocumentFactory(PdfMetadataService service) {
        super(service);
    }

    @Override
    public StreamCacheCreateFunction getStreamCacheFunction(long contentSize) {
        StrategyType type;
        if (contentSize < 10 * 1024 * 1024) {
            type = StrategyType.MEMORY_ONLY;
        } else if (contentSize < 50 * 1024 * 1024) {
            type = StrategyType.MIXED;
        } else {
            type = StrategyType.TEMP_FILE;
        }
        this.lastStrategyUsed = type;
        return super.getStreamCacheFunction(contentSize); // delegate to real behavior
    }
}
