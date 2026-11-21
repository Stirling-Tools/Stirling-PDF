package stirling.software.common.util;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

import lombok.experimental.UtilityClass;

import stirling.software.common.model.api.converters.EmlToPdfRequest;
import stirling.software.common.service.CustomPDFDocumentFactory;

@UtilityClass
public class EmlToPdf {

    /** Renders sanitized email HTML while preserving interruption for request cancellation. */
    @FunctionalInterface
    public interface HtmlToPdfRenderer {
        byte[] render(String html) throws IOException, InterruptedException;
    }

    public static String convertEmlToHtml(byte[] emlBytes, EmlToPdfRequest request)
            throws IOException {
        return convertEmlToHtml(emlBytes, request, null);
    }

    public static String convertEmlToHtml(
            byte[] emlBytes, EmlToPdfRequest request, CustomHtmlSanitizer customHtmlSanitizer)
            throws IOException {
        EmlProcessingUtils.validateEmlInput(emlBytes);

        EmlParser.EmailContent emailContent =
                EmlParser.extractEmailContent(emlBytes, request, customHtmlSanitizer);
        return EmlProcessingUtils.generateEnhancedEmailHtml(
                emailContent, request, customHtmlSanitizer);
    }

    public static byte[] convertEmlToPdf(
            String weasyprintPath,
            EmlToPdfRequest request,
            byte[] emlBytes,
            String fileName,
            CustomPDFDocumentFactory pdfDocumentFactory,
            TempFileManager tempFileManager,
            CustomHtmlSanitizer customHtmlSanitizer)
            throws IOException, InterruptedException {

        return convertEmlToPdf(
                request,
                emlBytes,
                pdfDocumentFactory,
                customHtmlSanitizer,
                html ->
                        convertHtmlToPdf(
                                weasyprintPath,
                                request,
                                html,
                                tempFileManager,
                                customHtmlSanitizer));
    }

    /** Keeps parsing, sanitization and attachment rules independent of the PDF renderer. */
    public static byte[] convertEmlToPdf(
            EmlToPdfRequest request,
            byte[] emlBytes,
            CustomPDFDocumentFactory pdfDocumentFactory,
            CustomHtmlSanitizer customHtmlSanitizer,
            HtmlToPdfRenderer renderer)
            throws IOException, InterruptedException {

        EmlProcessingUtils.validateEmlInput(emlBytes);

        try {
            EmlParser.EmailContent emailContent =
                    EmlParser.extractEmailContent(emlBytes, request, customHtmlSanitizer);

            String htmlContent =
                    EmlProcessingUtils.generateEnhancedEmailHtml(
                            emailContent, request, customHtmlSanitizer);

            byte[] pdfBytes = renderer.render(htmlContent);

            if (shouldAttachFiles(emailContent, request)) {
                pdfBytes =
                        PdfAttachmentHandler.attachFilesToPdf(
                                pdfBytes, emailContent.getAttachments(), pdfDocumentFactory);
            }

            return pdfBytes;

        } catch (IOException | InterruptedException e) {
            throw e;
        } catch (Exception e) {
            throw new IOException("Error converting EML to PDF", e);
        }
    }

    private static boolean shouldAttachFiles(
            EmlParser.EmailContent emailContent, EmlToPdfRequest request) {
        return emailContent != null
                && request != null
                && request.isIncludeAttachments()
                && !emailContent.getAttachments().isEmpty();
    }

    private static byte[] convertHtmlToPdf(
            String weasyprintPath,
            EmlToPdfRequest request,
            String htmlContent,
            TempFileManager tempFileManager,
            CustomHtmlSanitizer customHtmlSanitizer)
            throws IOException, InterruptedException {

        var htmlRequest = EmlProcessingUtils.createHtmlRequest(request);

        try {
            return FileToPdf.convertHtmlToPdf(
                    weasyprintPath,
                    htmlRequest,
                    htmlContent.getBytes(StandardCharsets.UTF_8),
                    "email.html",
                    tempFileManager,
                    customHtmlSanitizer);
        } catch (IOException | InterruptedException e) {
            String simplifiedHtml = EmlProcessingUtils.simplifyHtmlContent(htmlContent);
            return FileToPdf.convertHtmlToPdf(
                    weasyprintPath,
                    htmlRequest,
                    simplifiedHtml.getBytes(StandardCharsets.UTF_8),
                    "email.html",
                    tempFileManager,
                    customHtmlSanitizer);
        }
    }
}
