package stirling.software.SPDF.controller;

import java.io.IOException;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.multipart.MultipartFile;

import com.spire.pdf.PdfCompressionLevel;
import com.spire.pdf.PdfDocument;
import com.spire.pdf.PdfPageBase;
import com.spire.pdf.exporting.PdfImageInfo;
import com.spire.pdf.graphics.PdfBitmap;

import stirling.software.SPDF.utils.PdfUtils;

//import com.spire.pdf.*;
@Controller
public class CompressController {

    private static final Logger logger = LoggerFactory.getLogger(CompressController.class);

    @GetMapping("/compress-pdf")
    public String compressPdfForm(Model model) {
        model.addAttribute("currentPage", "compress-pdf");
        return "compress-pdf";
    }

    @PostMapping("/compress-pdf")
    public ResponseEntity<byte[]> compressPDF(@RequestParam("fileInput") MultipartFile pdfFile, @RequestParam("imageCompressionLevel") String imageCompressionLevel)
            throws IOException {
        // Load a sample PDF document
        PdfDocument document = new PdfDocument();
        document.loadFromBytes(pdfFile.getBytes());

        // Compress PDF
        document.getFileInfo().setIncrementalUpdate(false);
        document.setCompressionLevel(PdfCompressionLevel.Best);

        // compress PDF Images
        for (int i = 0; i < document.getPages().getCount(); i++) {

            PdfPageBase page = document.getPages().get(i);
            PdfImageInfo[] images = page.getImagesInfo();
            if (images != null && images.length > 0)
                for (int j = 0; j < images.length; j++) {
                    PdfImageInfo image = images[j];
                    PdfBitmap bp = new PdfBitmap(image.getImage());
                    // bp.setPngDirectToJpeg(true);
                    bp.setQuality(Integer.valueOf(imageCompressionLevel));

                    page.replaceImage(j, bp);

                }
        }

        return PdfUtils.pdfDocToWebResponse(document, pdfFile.getOriginalFilename().replaceFirst("[.][^.]+$", "") + "_compressed.pdf");

    }

}
