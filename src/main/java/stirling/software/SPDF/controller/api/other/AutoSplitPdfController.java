package stirling.software.SPDF.controller.api.other;
import java.awt.image.BufferedImage;
import java.awt.image.DataBufferByte;
import java.awt.image.DataBufferInt;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.google.zxing.BinaryBitmap;
import com.google.zxing.LuminanceSource;
import com.google.zxing.MultiFormatReader;
import com.google.zxing.NotFoundException;
import com.google.zxing.PlanarYUVLuminanceSource;
import com.google.zxing.Result;
import com.google.zxing.common.HybridBinarizer;

import stirling.software.SPDF.utils.WebResponseUtils;

@RestController
public class AutoSplitPdfController {

    private static final String QR_CONTENT = "https://github.com/Frooodle/Stirling-PDF";

    @PostMapping(value = "/auto-split-pdf", consumes = "multipart/form-data")
    public ResponseEntity<byte[]> autoSplitPdf(@RequestParam("fileInput") MultipartFile file) throws IOException {
        InputStream inputStream = file.getInputStream();
        PDDocument document = PDDocument.load(inputStream);
        PDFRenderer pdfRenderer = new PDFRenderer(document);

        List<PDDocument> splitDocuments = new ArrayList<>();
        List<ByteArrayOutputStream> splitDocumentsBoas = new ArrayList<>();  // create this list to store ByteArrayOutputStreams for zipping

        for (int page = 0; page < document.getNumberOfPages(); ++page) {
            BufferedImage bim = pdfRenderer.renderImageWithDPI(page, 150);
            String result = decodeQRCode(bim);
            
            if(QR_CONTENT.equals(result) && page != 0) {
                splitDocuments.add(new PDDocument());
            }

            if (!splitDocuments.isEmpty() && !QR_CONTENT.equals(result)) {
                splitDocuments.get(splitDocuments.size() - 1).addPage(document.getPage(page));
            } else if (page == 0) {
                PDDocument firstDocument = new PDDocument();
                firstDocument.addPage(document.getPage(page));
                splitDocuments.add(firstDocument);
            }
        }

        // After all pages are added to splitDocuments, convert each to ByteArrayOutputStream and add to splitDocumentsBoas
        for (PDDocument splitDocument : splitDocuments) {
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            splitDocument.save(baos);
            splitDocumentsBoas.add(baos);
            splitDocument.close();
        }

        document.close();

        // After this line, you can find your zip logic integrated
        Path zipFile = Files.createTempFile("split_documents", ".zip");
        String filename = file.getOriginalFilename().replaceFirst("[.][^.]+$", "");
        byte[] data;
        try (ZipOutputStream zipOut = new ZipOutputStream(Files.newOutputStream(zipFile))) {
            // loop through the split documents and write them to the zip file
            for (int i = 0; i < splitDocumentsBoas.size(); i++) {
                String fileName = filename + "_" + (i + 1) + ".pdf"; // You should replace "originalFileName" with the real file name
                ByteArrayOutputStream baos = splitDocumentsBoas.get(i);
                byte[] pdf = baos.toByteArray();

                // Add PDF file to the zip
                ZipEntry pdfEntry = new ZipEntry(fileName);
                zipOut.putNextEntry(pdfEntry);
                zipOut.write(pdf);
                zipOut.closeEntry();
            }
        } catch (Exception e) {
            e.printStackTrace();
        } finally {
        	data = Files.readAllBytes(zipFile);
            Files.delete(zipFile);
        }

        

        // return the Resource in the response
        return WebResponseUtils.bytesToWebResponse(data, filename + ".zip", MediaType.APPLICATION_OCTET_STREAM);
    }


    private static String decodeQRCode(BufferedImage bufferedImage) {
        LuminanceSource source;

        if (bufferedImage.getRaster().getDataBuffer() instanceof DataBufferByte) {
            byte[] pixels = ((DataBufferByte) bufferedImage.getRaster().getDataBuffer()).getData();
            source = new PlanarYUVLuminanceSource(pixels, bufferedImage.getWidth(), bufferedImage.getHeight(), 0, 0, bufferedImage.getWidth(), bufferedImage.getHeight(), false);
        } else if (bufferedImage.getRaster().getDataBuffer() instanceof DataBufferInt) {
            int[] pixels = ((DataBufferInt) bufferedImage.getRaster().getDataBuffer()).getData();
            byte[] newPixels = new byte[pixels.length];
            for (int i = 0; i < pixels.length; i++) {
                newPixels[i] = (byte) (pixels[i] & 0xff);
            }
            source = new PlanarYUVLuminanceSource(newPixels, bufferedImage.getWidth(), bufferedImage.getHeight(), 0, 0, bufferedImage.getWidth(), bufferedImage.getHeight(), false);
        } else {
            throw new IllegalArgumentException("BufferedImage must have 8-bit gray scale, 24-bit RGB, 32-bit ARGB (packed int), byte gray, or 3-byte/4-byte RGB image data");
        }

        BinaryBitmap bitmap = new BinaryBitmap(new HybridBinarizer(source));

        try {
            Result result = new MultiFormatReader().decode(bitmap);
            return result.getText();
        } catch (NotFoundException e) {
            return null; // there is no QR code in the image
        }
    }
}
