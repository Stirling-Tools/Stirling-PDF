package stirling.software.SPDF.controller;

import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;

import javax.imageio.ImageIO;

import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.multipart.MultipartFile;

import com.itextpdf.text.DocumentException;
import com.itextpdf.text.pdf.PdfReader;
import com.itextpdf.text.pdf.PdfStamper;

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
    public ResponseEntity<byte[]> compressPDF(
            @RequestParam("fileInput") MultipartFile pdfFile,
            @RequestParam(value = "compressPDF", defaultValue = "false") boolean compressPDF,
            @RequestParam(value = "compressImages", defaultValue = "false") boolean compressImages,
            @RequestParam(value = "useLossyCompression", defaultValue = "false") boolean useLossyCompression,
            @RequestParam(value = "resolutionPercentage", defaultValue = "50") int resolutionPercentage) {

        ByteArrayOutputStream baosPDFBox = new ByteArrayOutputStream();
        
        try (InputStream is = pdfFile.getInputStream();
             PDDocument document = PDDocument.load(is)) {

            if (compressImages) {
                for (PDPage page : document.getPages()) {
                    PDResources resources = page.getResources();
                    for (COSName cosName : resources.getXObjectNames()) {
                        if (resources.isImageXObject(cosName)) {
                            PDImageXObject image = (PDImageXObject) resources.getXObject(cosName);
                            BufferedImage bufferedImage = image.getImage();
                            BufferedImage resizedImage = resizeImage(bufferedImage, resolutionPercentage);

                            if (useLossyCompression) {
                                File tempFile = File.createTempFile("pdfbox", ".jpg");
                                ImageIO.write(resizedImage, "jpg", tempFile);
                                PDImageXObject newImage = PDImageXObject.createFromFile(tempFile.getAbsolutePath(), document);
                                resources.put(cosName, newImage);
                            } else {
                                File tempFile = File.createTempFile("pdfbox", ".png");
                                ImageIO.write(resizedImage, "png", tempFile);
                                PDImageXObject newImage = PDImageXObject.createFromFile(tempFile.getAbsolutePath(), document);
                                resources.put(cosName, newImage);
                            }
                        }
                    }
                }
            }

            document.save(baosPDFBox);

        } catch (IOException e) {
            e.printStackTrace();
            return new ResponseEntity<>(HttpStatus.INTERNAL_SERVER_ERROR);
        }

        try (ByteArrayInputStream baisPDFBox = new ByteArrayInputStream(baosPDFBox.toByteArray());
             ByteArrayOutputStream baosFinal = new ByteArrayOutputStream()) {

            PdfReader reader = new PdfReader(baisPDFBox);
            PdfStamper stamper = new PdfStamper(reader, baosFinal);

            if (compressPDF) {
                stamper.setFullCompression();
            }

            stamper.close();
            reader.close();

            return PdfUtils.boasToWebResponse(baosFinal, pdfFile.getOriginalFilename().replaceFirst("[.][^.]+$", "") + "_compressed.pdf");
        } catch (IOException | DocumentException e) {
            e.printStackTrace();
            return new ResponseEntity<>(HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }


    private BufferedImage resizeImage(BufferedImage originalImage, int resolutionPercentage) {
        int newWidth = originalImage.getWidth() * resolutionPercentage / 100;
        int newHeight = originalImage.getHeight() * resolutionPercentage / 100;
        BufferedImage resizedImage = new BufferedImage(newWidth, newHeight, originalImage.getType());
        Graphics2D g = resizedImage.createGraphics();
        g.drawImage(originalImage, 0, 0, newWidth, newHeight, null);
        g.dispose();
        return resizedImage;
    }
}
