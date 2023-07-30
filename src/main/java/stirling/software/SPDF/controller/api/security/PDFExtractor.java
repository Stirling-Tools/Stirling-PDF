package stirling.software.SPDF.controller.api.security;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentInformation;
import com.itextpdf.kernel.pdf.PdfObject;
import com.itextpdf.forms.PdfAcroForm;
import com.itextpdf.forms.fields.PdfFormField;
import com.itextpdf.kernel.geom.Rectangle;
import com.itextpdf.kernel.pdf.PdfArray;
import com.itextpdf.kernel.pdf.PdfCatalog;
import com.itextpdf.kernel.pdf.PdfDictionary;
import com.itextpdf.kernel.pdf.PdfDocument;
import com.itextpdf.kernel.pdf.PdfDocumentInfo;
import com.itextpdf.kernel.pdf.PdfEncryption;
import com.itextpdf.kernel.pdf.PdfReader;
import com.itextpdf.kernel.pdf.PdfResources;
import com.itextpdf.kernel.pdf.PdfStream;
import com.itextpdf.kernel.pdf.PdfName;
import com.itextpdf.kernel.pdf.PdfViewerPreferences;
import com.itextpdf.kernel.pdf.PdfWriter;
import com.itextpdf.kernel.pdf.annot.PdfAnnotation;
import com.itextpdf.kernel.pdf.annot.PdfFileAttachmentAnnotation;
import com.itextpdf.kernel.pdf.annot.PdfLinkAnnotation;
import com.itextpdf.kernel.pdf.layer.PdfLayer;
import com.itextpdf.kernel.pdf.layer.PdfOCProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.apache.pdfbox.text.PDFTextStripper;
import java.io.File;
import java.io.FileWriter;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.List;
import java.util.Map;

public class PDFExtractor {
    public static void main(String[] args) {
        try {
            PDDocument pdfBoxDoc = PDDocument.load(new File("path_to_pdf.pdf"));
            ObjectMapper objectMapper = new ObjectMapper();
            ObjectNode jsonOutput = objectMapper.createObjectNode();

            // Metadata using PDFBox
            PDDocumentInformation info = pdfBoxDoc.getDocumentInformation();
            ObjectNode metadata = objectMapper.createObjectNode();
            metadata.put("Title", info.getTitle());
            metadata.put("Author", info.getAuthor());
            metadata.put("Subject", info.getSubject());
            metadata.put("Keywords", info.getKeywords());
            metadata.put("Producer", info.getProducer());
            metadata.put("Creator", info.getCreator());
            metadata.put("CreationDate", formatDate(info.getCreationDate()));
            metadata.put("ModificationDate", formatDate(info.getModificationDate()));
            metadata.put("Trapped", info.getTrapped());
            jsonOutput.set("Metadata", metadata);

            // Document Information using PDFBox
            ObjectNode docInfoNode = objectMapper.createObjectNode();
            docInfoNode.put("Number of pages", pdfBoxDoc.getNumberOfPages());
            docInfoNode.put("PDF version", pdfBoxDoc.getVersion());
            ;

            // Page Mode using iText7
            PdfDocument itextDoc = new PdfDocument(new PdfReader("path_to_pdf.pdf"));
            PdfCatalog catalog = itextDoc.getCatalog();
            PdfName pageMode = catalog.getPdfObject().getAsName(PdfName.PageMode);

            ObjectNode itextDocInfo = objectMapper.createObjectNode();
            docInfoNode.put("Page Mode", getPageModeDescription(pageMode));;

            jsonOutput.set("Document Information", docInfoNode);
            
            for (int pageNum = 1; pageNum <= itextDoc.getNumberOfPages(); pageNum++) {
                ObjectNode pageInfo = objectMapper.createObjectNode();

                // Page-level Information
                Rectangle pageSize = itextDoc.getPage(pageNum).getPageSize();
                pageInfo.put("Width", pageSize.getWidth());
                pageInfo.put("Height", pageSize.getHeight());
                pageInfo.put("Rotation", itextDoc.getPage(pageNum).getRotation());

                // Boxes
                pageInfo.put("MediaBox", itextDoc.getPage(pageNum).getMediaBox().toString());
                pageInfo.put("CropBox", itextDoc.getPage(pageNum).getCropBox().toString());
                pageInfo.put("BleedBox", itextDoc.getPage(pageNum).getBleedBox().toString());
                pageInfo.put("TrimBox", itextDoc.getPage(pageNum).getTrimBox().toString());
                pageInfo.put("ArtBox", itextDoc.getPage(pageNum).getArtBox().toString());

                // Content Extraction
                PDFTextStripper textStripper = new PDFTextStripper();
                textStripper.setStartPage(pageNum -1);
                textStripper.setEndPage(pageNum - 1);
                String pageText = textStripper.getText(pdfBoxDoc);
                
                pageInfo.put("Text Characters Count", pageText.length()); //

             // Annotations
                ArrayNode annotationsArray = objectMapper.createArrayNode();
                List<PdfAnnotation> annotations = itextDoc.getPage(pageNum).getAnnotations();
                for (PdfAnnotation annotation : annotations) {
                    ObjectNode annotationNode = objectMapper.createObjectNode();
                    annotationNode.put("Subtype", annotation.getSubtype().toString());
                    annotationNode.put("Contents", annotation.getContents().getValue());
                    annotationsArray.add(annotationNode);
                }
                pageInfo.set("Annotations", annotationsArray);

                // Images (simplified)
                // This part is non-trivial as images can be embedded in multiple ways in a PDF.
                // Here is a basic structure to recognize image XObjects on a page.
                ArrayNode imagesArray = objectMapper.createArrayNode();
                PdfResources resources = itextDoc.getPage(pageNum).getResources();
                for (PdfName name : resources.getResourceNames()) {
                    PdfObject obj = resources.getResource(name);
                    if (obj instanceof PdfStream) {
                        PdfStream stream = (PdfStream) obj;
                        if (PdfName.Image.equals(stream.getAsName(PdfName.Subtype))) {
                            ObjectNode imageNode = objectMapper.createObjectNode();
                            imageNode.put("Width", stream.getAsNumber(PdfName.Width).intValue());
                            imageNode.put("Height", stream.getAsNumber(PdfName.Height).intValue());
                            PdfObject colorSpace = stream.get(PdfName.ColorSpace);
                            if (colorSpace != null) {
                                imageNode.put("ColorSpace", colorSpace.toString());
                            }
                            imagesArray.add(imageNode);
                        }
                    }
                }
                pageInfo.set("Images", imagesArray);

                // Links
                ArrayNode linksArray = objectMapper.createArrayNode();
                for (PdfAnnotation annotation : annotations) {
                    if (annotation instanceof PdfLinkAnnotation) {
                        PdfLinkAnnotation linkAnnotation = (PdfLinkAnnotation) annotation;
                        ObjectNode linkNode = objectMapper.createObjectNode();
                        linkNode.put("URI", linkAnnotation.getAction().toString()); // Basic, might not work for all links
                        linksArray.add(linkNode);
                    }
                }
                pageInfo.set("Links", linksArray);
                
                //Fonts
                ArrayNode fontsArray = objectMapper.createArrayNode();
                PdfDictionary fontDicts = resources.getResource(PdfName.Font);
                if (fontDicts != null) {
                    for (PdfName key : fontDicts.keySet()) {
                        PdfDictionary font = fontDicts.getAsDictionary(key);
                        ObjectNode fontNode = objectMapper.createObjectNode();
                        fontNode.put("Name", font.getAsString(PdfName.BaseFont).toString());
                        
                        // Font Subtype (e.g., Type1, TrueType)
                        if (font.containsKey(PdfName.Subtype)) {
                            fontNode.put("Subtype", font.getAsName(PdfName.Subtype).toString());
                        }

                        // Font Descriptor
                        PdfDictionary fontDescriptor = font.getAsDictionary(PdfName.FontDescriptor);
                        if (fontDescriptor != null) {
                            // Italic Angle
                            if (fontDescriptor.containsKey(PdfName.ItalicAngle)) {
                                fontNode.put("ItalicAngle", fontDescriptor.getAsNumber(PdfName.ItalicAngle).floatValue());
                            }
                            
                            // Flags (e.g., italic, bold)
                            if (fontDescriptor.containsKey(PdfName.Flags)) {
                                int flags = fontDescriptor.getAsNumber(PdfName.Flags).intValue();
                                fontNode.put("IsItalic", (flags & 64) != 0);
                                fontNode.put("IsBold", (flags & 1) != 0);
                            }
                        }

                        fontsArray.add(fontNode);
                    }
                }
                pageInfo.set("Fonts", fontsArray);
                
                
                
                
             // Access resources dictionary
                PdfDictionary resourcesDict = itextDoc.getPage(pageNum).getResources().getPdfObject();

                // Color Spaces & ICC Profiles
                ArrayNode colorSpacesArray = objectMapper.createArrayNode();
                PdfDictionary colorSpaces = resourcesDict.getAsDictionary(PdfName.ColorSpace);
                if (colorSpaces != null) {
                    for (PdfName name : colorSpaces.keySet()) {
                        PdfObject colorSpaceObject = colorSpaces.get(name);
                        if (colorSpaceObject instanceof PdfArray) {
                            PdfArray colorSpaceArray = (PdfArray) colorSpaceObject;
                            if (colorSpaceArray.size() > 1 && colorSpaceArray.get(0) instanceof PdfName && PdfName.ICCBased.equals(colorSpaceArray.get(0))) {
                                ObjectNode iccProfileNode = objectMapper.createObjectNode();
                                PdfStream iccStream = (PdfStream) colorSpaceArray.get(1);
                                byte[] iccData = iccStream.getBytes();
                                // TODO: Further decode and analyze the ICC data if needed
                                iccProfileNode.put("ICC Profile Length", iccData.length);
                                colorSpacesArray.add(iccProfileNode);
                            }
                        }
                    }
                }
                pageInfo.set("Color Spaces & ICC Profiles", colorSpacesArray);

                // Other XObjects
                ArrayNode xObjectsArray = objectMapper.createArrayNode();
                PdfDictionary xObjects = resourcesDict.getAsDictionary(PdfName.XObject);
                if (xObjects != null) {
                    for (PdfName name : xObjects.keySet()) {
                        PdfStream xObjectStream = xObjects.getAsStream(name);
                        ObjectNode xObjectNode = objectMapper.createObjectNode();
                        xObjectNode.put("Type", xObjectStream.getAsName(PdfName.Subtype).toString());
                        // TODO: Extract further details depending on the XObject type
                        xObjectsArray.add(xObjectNode);
                    }
                }
                pageInfo.set("XObjects", xObjectsArray);

                jsonOutput.set("Page " + pageNum, pageInfo);
            }
            
            PdfAcroForm acroForm = PdfAcroForm.getAcroForm(itextDoc, false);
            if (acroForm != null) {
                ObjectNode formFieldsNode = objectMapper.createObjectNode();
                for (Map.Entry<String, PdfFormField> entry : acroForm.getFormFields().entrySet()) {
                    formFieldsNode.put(entry.getKey(), entry.getValue().getValueAsString());
                }
                jsonOutput.set("FormFields", formFieldsNode);
            }

            
            
           //TODO bookmarks here
            
            
            
            
            //embeed files TODO size
            PdfDictionary embeddedFiles = itextDoc.getCatalog().getPdfObject().getAsDictionary(PdfName.Names)
                    .getAsDictionary(PdfName.EmbeddedFiles);
            if (embeddedFiles != null) {
                ArrayNode embeddedFilesArray = objectMapper.createArrayNode();
                PdfArray namesArray = embeddedFiles.getAsArray(PdfName.Names);
                for (int i = 0; i < namesArray.size(); i += 2) {
                    ObjectNode embeddedFileNode = objectMapper.createObjectNode();
                    embeddedFileNode.put("Name", namesArray.getAsString(i).toString());
                    // Add other details if required
                    embeddedFilesArray.add(embeddedFileNode);
                }
                jsonOutput.set("EmbeddedFiles", embeddedFilesArray);
            }

            
            //attachments TODO size
            ArrayNode attachmentsArray = objectMapper.createArrayNode();
            for (int pageNum = 1; pageNum <= itextDoc.getNumberOfPages(); pageNum++) {
                for (PdfAnnotation annotation : itextDoc.getPage(pageNum).getAnnotations()) {
                    if (annotation instanceof PdfFileAttachmentAnnotation) {
                        ObjectNode attachmentNode = objectMapper.createObjectNode();
                        attachmentNode.put("Name", ((PdfFileAttachmentAnnotation) annotation).getName().toString());
                        attachmentNode.put("Description", annotation.getContents().getValue());
                        attachmentsArray.add(attachmentNode);
                    }
                }
            }
            jsonOutput.set("Attachments", attachmentsArray);

            //Javascript
            PdfDictionary namesDict = itextDoc.getCatalog().getPdfObject().getAsDictionary(PdfName.Names);
            if (namesDict != null) {
                PdfDictionary javascriptDict = namesDict.getAsDictionary(PdfName.JavaScript);
                if (javascriptDict != null) {
                    ArrayNode javascriptArray = objectMapper.createArrayNode();
                    PdfArray namesArray = javascriptDict.getAsArray(PdfName.Names);
                    for (int i = 0; i < namesArray.size(); i += 2) {
                        ObjectNode jsNode = objectMapper.createObjectNode();
                        jsNode.put("JS Name", namesArray.getAsString(i).toString());
                        jsNode.put("JS Code", namesArray.getAsString(i + 1).toString());
                        javascriptArray.add(jsNode);
                    }
                    jsonOutput.set("JavaScripts", javascriptArray);
                }
            }

            
            //TODO size
            PdfOCProperties ocProperties = itextDoc.getCatalog().getOCProperties(false);
            if (ocProperties != null) {
                ArrayNode layersArray = objectMapper.createArrayNode();
                for (PdfLayer layer : ocProperties.getLayers()) {
                    ObjectNode layerNode = objectMapper.createObjectNode();
                    layerNode.put("Name", layer.getPdfObject().getAsString(PdfName.Name).toString());
                    layersArray.add(layerNode);
                }
                jsonOutput.set("Layers", layersArray);
            }

            
            //TODO Security
            

            
            
            
            
         // Digital Signatures using iText7 TODO
            
            
            // Save JSON to file
            try (FileWriter file = new FileWriter("output.json")) {
                file.write(objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(jsonOutput)); 
                file.flush();
            }

            pdfBoxDoc.close();
            itextDoc.close();
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private static String formatDate(Calendar calendar) {
        if (calendar != null) {
            SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss");
            return sdf.format(calendar.getTime());
        } else {
            return null;
        }
    }

    private static String getPageModeDescription(PdfName pageMode) {
        return pageMode != null ? pageMode.toString().replaceFirst("/", "") : "Unknown";
    }
}
