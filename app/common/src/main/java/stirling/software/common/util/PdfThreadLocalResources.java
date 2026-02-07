package stirling.software.common.util;

import java.awt.image.BufferedImage;
import java.io.File;
import java.io.IOException;
import java.nio.file.Path;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.rendering.PDFRenderer;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.service.CustomPDFDocumentFactory;

@Slf4j
public class PdfThreadLocalResources implements AutoCloseable {

    private final CustomPDFDocumentFactory factory;
    private final File sharedFile;
    private final byte[] sharedBytes;

    private final ConcurrentMap<Thread, ThreadResources> threadResourcesMap =
            new ConcurrentHashMap<>();
    private final ThreadLocal<ThreadResources> resources =
            ThreadLocal.withInitial(
                    () -> {
                        try {
                            ThreadResources res = createResources();
                            threadResourcesMap.put(Thread.currentThread(), res);
                            return res;
                        } catch (IOException e) {
                            throw new RuntimeException(
                                    "Failed to initialize PDF thread-local resources", e);
                        }
                    });

    public PdfThreadLocalResources(CustomPDFDocumentFactory factory, File file) {
        this.factory = factory;
        this.sharedFile = file;
        this.sharedBytes = null;
    }

    public PdfThreadLocalResources(CustomPDFDocumentFactory factory, Path path) {
        this(factory, path.toFile());
    }

    public PdfThreadLocalResources(CustomPDFDocumentFactory factory, byte[] bytes) {
        this.factory = factory;
        this.sharedBytes = bytes;
        this.sharedFile = null;
    }

    private ThreadResources createResources() throws IOException {
        PDDocument doc;
        if (sharedBytes != null) {
            doc = factory.load(sharedBytes, true);
        } else {
            // Each thread gets its own isolated RandomAccessReadBufferedFile on the same file
            // but we use the factory which might have its own logic.
            // Ideally we want to ensure it's a new instance.
            doc = factory.load(sharedFile, true);
        }
        return new ThreadResources(doc);
    }

    public PDDocument getDocument() {
        return resources.get().document;
    }

    public PDFRenderer getRenderer() {
        return resources.get().renderer;
    }

    public PDRectangle getPageMediaBox(int pageIndex) {
        return getDocument().getPage(pageIndex).getMediaBox();
    }

    public BufferedImage renderPage(int pageIndex, int dpi) throws IOException {
        return getRenderer().renderImageWithDPI(pageIndex, dpi);
    }

    public BufferedImage renderPage(
            int pageIndex, int dpi, org.apache.pdfbox.rendering.ImageType type) throws IOException {
        return getRenderer().renderImageWithDPI(pageIndex, dpi, type);
    }

    @Override
    public void close() {
        resources.remove();
        threadResourcesMap.values().forEach(ThreadResources::closeQuietly);
        threadResourcesMap.clear();
    }

    private static class ThreadResources {
        final PDDocument document;
        final PDFRenderer renderer;

        ThreadResources(PDDocument document) {
            this.document = document;
            this.renderer = new PDFRenderer(document);
            this.renderer.setSubsamplingAllowed(true);
        }

        void closeQuietly() {
            try {
                document.close();
            } catch (IOException e) {
                log.warn("Failed to close thread-local PDDocument", e);
            }
        }
    }
}
