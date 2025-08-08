package stirling.software.common.util;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

import lombok.experimental.UtilityClass;

import stirling.software.common.model.api.converters.EmlToPdfRequest;
import stirling.software.common.service.CustomPDFDocumentFactory;

@UtilityClass
public class EmlToPdf {

    public static String convertEmlToHtml(byte[] emlBytes, EmlToPdfRequest request)
            throws IOException {
        EmlProcessingUtils.validateEmlInput(emlBytes);

        EmlParser.EmailContent emailContent =
                EmlParser.extractEmailContent(emlBytes, request, null);
        return EmlProcessingUtils.generateEnhancedEmailHtml(emailContent, request, null);
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

        EmlProcessingUtils.validateEmlInput(emlBytes);

        try {
            EmlParser.EmailContent emailContent =
                    EmlParser.extractEmailContent(emlBytes, request, customHtmlSanitizer);

            String htmlContent =
                    EmlProcessingUtils.generateEnhancedEmailHtml(
                            emailContent, request, customHtmlSanitizer);

            byte[] pdfBytes =
                    convertHtmlToPdf(
                            weasyprintPath,
                            request,
                            htmlContent,
                            tempFileManager,
                            customHtmlSanitizer);

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
