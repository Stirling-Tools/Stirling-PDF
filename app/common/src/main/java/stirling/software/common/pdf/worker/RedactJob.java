package stirling.software.common.pdf.worker;

import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

import stirling.software.jpdfium.PdfDocument;
import stirling.software.jpdfium.exception.JPDFiumException;
import stirling.software.jpdfium.redact.PdfRedactor;
import stirling.software.jpdfium.redact.RedactOptions;
import stirling.software.jpdfium.redact.RedactResult;

/**
 * Removes matching text with JPDFium and writes the result to {@code output}. A redaction JPDFium
 * could not verify comes back as an {@link Outcome} rather than an exception, so the caller can
 * reject it instead of falling back to a weaker redaction; other failures throw.
 */
public record RedactJob(
        Path input,
        Path output,
        List<String> terms,
        boolean useRegex,
        boolean wholeWord,
        boolean caseSensitive,
        int boxColor,
        float padding,
        boolean convertToImage)
        implements PdfWorkerJob<RedactJob.Result> {

    public static final String TYPE = "redact";

    public enum Outcome {
        REDACTED,
        UNVERIFIED_PAGES,
        UNVERIFIABLE
    }

    /** {@code unverifiedPages} lists 1-based page numbers when the outcome is UNVERIFIED_PAGES. */
    public record Result(
            Outcome outcome, int totalMatches, String unverifiedPages, String detail) {}

    @Override
    public String type() {
        return TYPE;
    }

    @Override
    public void writeRequest(DataOutputStream out) throws IOException {
        PdfWorkerProtocol.writeString(out, input.toString());
        PdfWorkerProtocol.writeString(out, output.toString());
        out.writeInt(terms.size());
        for (String term : terms) {
            PdfWorkerProtocol.writeString(out, term);
        }
        out.writeBoolean(useRegex);
        out.writeBoolean(wholeWord);
        out.writeBoolean(caseSensitive);
        out.writeInt(boxColor);
        out.writeFloat(padding);
        out.writeBoolean(convertToImage);
    }

    static RedactJob readRequest(DataInputStream in) throws IOException {
        Path input = Path.of(PdfWorkerProtocol.readString(in));
        Path output = Path.of(PdfWorkerProtocol.readString(in));
        int count = PdfWorkerProtocol.readCount(in);
        List<String> terms = new ArrayList<>(count);
        for (int i = 0; i < count; i++) {
            terms.add(PdfWorkerProtocol.readString(in));
        }
        return new RedactJob(
                input,
                output,
                terms,
                in.readBoolean(),
                in.readBoolean(),
                in.readBoolean(),
                in.readInt(),
                in.readFloat(),
                in.readBoolean());
    }

    static void writeResult(DataOutputStream out, Result result) throws IOException {
        out.writeByte(result.outcome().ordinal());
        out.writeInt(result.totalMatches());
        PdfWorkerProtocol.writeString(out, result.unverifiedPages());
        PdfWorkerProtocol.writeString(out, result.detail());
    }

    @Override
    public Result readResult(DataInputStream in) throws IOException {
        int ordinal = in.readByte();
        Outcome[] outcomes = Outcome.values();
        if (ordinal < 0 || ordinal >= outcomes.length) {
            throw new IOException("PDF worker sent an unknown redaction outcome: " + ordinal);
        }
        return new Result(
                outcomes[ordinal],
                in.readInt(),
                PdfWorkerProtocol.readString(in),
                PdfWorkerProtocol.readString(in));
    }

    @Override
    public Result run() throws IOException {
        try (PdfDocument check = PdfDocument.open(input)) {
            if (check.pageCount() <= 0) {
                throw new IOException("Invalid or empty PDF document");
            }
        }
        RedactResult result;
        try {
            result = PdfRedactor.redact(input, options());
        } catch (JPDFiumException e) {
            if (e.isRedactUnverifiable() || e.isRedactIncomplete()) {
                return new Result(Outcome.UNVERIFIABLE, 0, "", String.valueOf(e.getMessage()));
            }
            throw e;
        }
        if (result == null) {
            throw new IOException("JPDFium auto-redact returned null result");
        }
        try {
            String unverified =
                    result.pageResults().stream()
                            .filter(page -> page.matchesFound() < 0)
                            .map(page -> String.valueOf(page.pageIndex() + 1))
                            .collect(Collectors.joining(", "));
            if (!unverified.isEmpty()) {
                return new Result(Outcome.UNVERIFIED_PAGES, 0, unverified, "");
            }
            result.save(output);
            return new Result(Outcome.REDACTED, result.totalMatches(), "", "");
        } finally {
            if (result.document() != null) {
                result.document().close();
            }
        }
    }

    private RedactOptions options() {
        return RedactOptions.builder()
                .addWords(terms)
                .useRegex(useRegex)
                .wholeWord(wholeWord)
                .caseSensitive(caseSensitive)
                .boxColor(boxColor)
                .padding(padding)
                .removeContent(true)
                .convertToImage(convertToImage)
                .normalizeFonts(false)
                .fixToUnicode(false)
                .glyphAware(true)
                .ligatureAware(true)
                .bidiAware(true)
                .graphemeSafe(true)
                .sanitizeStructure(false)
                .redactMetadata(true)
                .build();
    }
}
