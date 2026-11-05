import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.io.RandomAccessReadBufferedFile;
import org.apache.pdfbox.multipdf.PDFMergerUtility;
import org.apache.pdfbox.pdmodel.PDDocument;

import stirling.software.jpdfium.PdfDocument;
import stirling.software.jpdfium.PdfMerge;

public class PhaseBench {

    public static void main(String[] a) throws Exception {
        String engine = a[0], type = a[1];
        Path file = Path.of(a[2]);
        int copies = Integer.parseInt(a[3]), rounds = Integer.parseInt(a[4]);
        List<Path> inputs = Collections.nCopies(copies, file);
        for (int i = 0; i < 2; i++) run(engine, inputs);
        List<long[]> samples = new ArrayList<>();
        for (int i = 0; i < rounds; i++) samples.add(run(engine, inputs));
        long[] med = new long[samples.getFirst().length];
        for (int k = 0; k < med.length; k++) {
            long[] col = new long[samples.size()];
            for (int i = 0; i < col.length; i++) col[i] = samples.get(i)[k];
            Arrays.sort(col);
            med[k] = col[col.length / 2];
        }
        StringBuilder json = new StringBuilder();
        json.append(String.format("{\"engine\":\"%s\",\"type\":\"%s\",\"files\":%d,\"rounds\":%d,\"load\":%.3f,\"append\":%.3f,\"save\":%.3f,\"close\":%.3f",
                engine, type, copies, rounds, med[0] / 1e6, med[1] / 1e6, med[2] / 1e6, med[3] / 1e6));
        if (med.length > 4) {
            json.append(String.format(",\"file_backed\":%.3f,\"open_only\":%.3f", med[4] / 1e6, med[5] / 1e6));
        }
        System.out.println(json.append('}'));
        System.exit(0);
    }

    static long[] run(String engine, List<Path> inputs) throws Exception {
        Path out = Files.createTempFile("phase-bench", ".pdf");
        try {
            return engine.equals("pdfbox") ? pdfbox(inputs, out) : jpdfium(inputs, out);
        } finally {
            Files.deleteIfExists(out);
        }
    }

    static long[] pdfbox(List<Path> inputs, Path out) throws Exception {
        long t0 = System.nanoTime();
        List<PDDocument> docs = new ArrayList<>();
        for (Path p : inputs) docs.add(Loader.loadPDF(new RandomAccessReadBufferedFile(p.toFile())));
        long t1 = System.nanoTime();
        PDDocument dest = new PDDocument();
        PDFMergerUtility m = new PDFMergerUtility();
        for (PDDocument d : docs) m.appendDocument(dest, d);
        long t2 = System.nanoTime();
        dest.save(out.toFile());
        long t3 = System.nanoTime();
        dest.close();
        for (PDDocument d : docs) d.close();
        long t4 = System.nanoTime();
        return new long[] {t1 - t0, t2 - t1, t3 - t2, t4 - t3};
    }

    static long[] jpdfium(List<Path> inputs, Path out) throws Exception {
        long t0 = System.nanoTime();
        List<PdfDocument> docs = new ArrayList<>();
        for (Path p : inputs) docs.add(PdfDocument.open(p));
        long t1 = System.nanoTime();
        PdfDocument merged = PdfMerge.merge(docs);
        long t2 = System.nanoTime();
        merged.save(out);
        long t3 = System.nanoTime();
        merged.close();
        for (PdfDocument d : docs) d.close();
        long t4 = System.nanoTime();
        Files.delete(out);
        PdfMerge.mergeFilesToFile(inputs, out);
        long t5 = System.nanoTime();
        for (Path p : inputs) {
            try (PdfDocument d = PdfDocument.open(p)) {
                d.pageCount();
                d.bookmarks();
            }
        }
        long t6 = System.nanoTime();
        return new long[] {t1 - t0, t2 - t1, t3 - t2, t4 - t3, t5 - t4, t6 - t5};
    }
}
