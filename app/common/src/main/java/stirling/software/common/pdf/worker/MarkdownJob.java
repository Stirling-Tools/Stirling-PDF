package stirling.software.common.pdf.worker;

import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import stirling.software.common.pdf.MarkdownBlock;
import stirling.software.common.pdf.PdfMarkdownExtractor;
import stirling.software.jpdfium.PdfDocument;

/**
 * Converts a PDF to Markdown blocks. In a worker process the extractor is rebuilt from its class
 * name, so it must have a public no-argument constructor.
 */
public record MarkdownJob(Path input, PdfMarkdownExtractor extractor)
        implements PdfWorkerJob<MarkdownJob.Result> {

    public static final String TYPE = "markdown";

    public record Result(int pageCount, List<MarkdownBlock> blocks) {}

    @Override
    public String type() {
        return TYPE;
    }

    @Override
    public void writeRequest(DataOutputStream out) throws IOException {
        PdfWorkerProtocol.writeString(out, input.toString());
        PdfWorkerProtocol.writeString(out, extractor.getClass().getName());
    }

    static MarkdownJob readRequest(DataInputStream in) throws IOException {
        Path input = Path.of(PdfWorkerProtocol.readString(in));
        String extractorClass = PdfWorkerProtocol.readString(in);
        try {
            Class<?> type = Class.forName(extractorClass);
            if (!PdfMarkdownExtractor.class.isAssignableFrom(type)) {
                throw new IOException("Not a Markdown extractor: " + extractorClass);
            }
            return new MarkdownJob(
                    input, (PdfMarkdownExtractor) type.getDeclaredConstructor().newInstance());
        } catch (ReflectiveOperationException e) {
            throw new IOException("Cannot create Markdown extractor " + extractorClass, e);
        }
    }

    static void writeResult(DataOutputStream out, Result result) throws IOException {
        out.writeInt(result.pageCount());
        out.writeInt(result.blocks().size());
        for (MarkdownBlock block : result.blocks()) {
            PdfWorkerProtocol.writeString(out, block.markdown());
            out.writeInt(block.pageStart());
            out.writeInt(block.pageEnd());
            out.writeInt(block.headingPath().size());
            for (String heading : block.headingPath()) {
                PdfWorkerProtocol.writeString(out, heading);
            }
        }
    }

    @Override
    public Result readResult(DataInputStream in) throws IOException {
        int pageCount = in.readInt();
        int count = PdfWorkerProtocol.readCount(in);
        List<MarkdownBlock> blocks = new ArrayList<>(count);
        for (int i = 0; i < count; i++) {
            String markdown = PdfWorkerProtocol.readString(in);
            int pageStart = in.readInt();
            int pageEnd = in.readInt();
            int headings = PdfWorkerProtocol.readCount(in);
            List<String> headingPath = new ArrayList<>(headings);
            for (int h = 0; h < headings; h++) {
                headingPath.add(PdfWorkerProtocol.readString(in));
            }
            blocks.add(new MarkdownBlock(markdown, pageStart, pageEnd, headingPath));
        }
        return new Result(pageCount, blocks);
    }

    @Override
    public Result run() throws IOException {
        try (PdfDocument doc = PdfDocument.open(input)) {
            return new Result(doc.pageCount(), extractor.extractBlocks(doc));
        }
    }
}
