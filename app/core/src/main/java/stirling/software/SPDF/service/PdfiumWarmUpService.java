package stirling.software.SPDF.service;

import java.nio.charset.StandardCharsets;

import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

import stirling.software.jpdfium.PdfDocument;
import stirling.software.jpdfium.PdfPage;

@Slf4j
@Service
public class PdfiumWarmUpService {

    @EventListener(ApplicationReadyEvent.class)
    public void warmUp() {
        Thread.ofPlatform().name("pdfium-warm-up").daemon().start(PdfiumWarmUpService::run);
    }

    static void run() {
        long start = System.nanoTime();
        try (PdfDocument document = PdfDocument.open(samplePdf());
                PdfPage page = document.page(0)) {
            page.renderImage(36);
            log.debug("PDFium warmed up in {} ms", (System.nanoTime() - start) / 1_000_000);
        } catch (Throwable e) {
            log.debug("PDFium warm-up skipped: {}", e.toString());
        }
    }

    static byte[] samplePdf() {
        String[] objects = {
            "<< /Type /Catalog /Pages 2 0 R >>",
            "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 72 72] /Contents 4 0 R"
                    + " /Resources << /Font << /F1 5 0 R >> >> >>",
            stream("BT /F1 12 Tf 8 30 Td (Stirling) Tj ET"),
            "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
        };
        StringBuilder pdf = new StringBuilder("%PDF-1.4\n");
        int[] offsets = new int[objects.length];
        for (int i = 0; i < objects.length; i++) {
            offsets[i] = pdf.length();
            pdf.append(i + 1).append(" 0 obj\n").append(objects[i]).append("\nendobj\n");
        }
        int xref = pdf.length();
        pdf.append("xref\n0 ").append(objects.length + 1).append("\n0000000000 65535 f \n");
        for (int offset : offsets) {
            pdf.append(String.format("%010d 00000 n \n", offset));
        }
        pdf.append("trailer\n<< /Size ")
                .append(objects.length + 1)
                .append(" /Root 1 0 R >>\nstartxref\n")
                .append(xref)
                .append("\n%%EOF\n");
        return pdf.toString().getBytes(StandardCharsets.US_ASCII);
    }

    private static String stream(String content) {
        return "<< /Length " + content.length() + " >>\nstream\n" + content + "\nendstream";
    }
}
