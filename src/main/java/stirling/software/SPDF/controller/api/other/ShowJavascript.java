package stirling.software.SPDF.controller.api.other;

import java.io.IOException;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import stirling.software.SPDF.utils.GeneralUtils;
import stirling.software.SPDF.utils.PdfUtils;
import stirling.software.SPDF.utils.WebResponseUtils;
import org.apache.pdfbox.pdmodel.*;
import org.apache.pdfbox.pdmodel.common.*;
import org.apache.pdfbox.pdmodel.PDPageContentStream.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.*;
import org.springframework.web.multipart.MultipartFile;
import io.swagger.v3.oas.annotations.*;
import io.swagger.v3.oas.annotations.media.*;
import io.swagger.v3.oas.annotations.parameters.*;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.text.TextPosition;
import org.apache.tomcat.util.http.ResponseUtil;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.ArrayList;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.multipart.MultipartFile;

import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.itextpdf.io.font.constants.StandardFonts;
import com.itextpdf.kernel.font.PdfFont;
import com.itextpdf.kernel.font.PdfFontFactory;
import com.itextpdf.kernel.geom.Rectangle;
import com.itextpdf.kernel.pdf.PdfReader;
import com.itextpdf.kernel.pdf.PdfStream;
import com.itextpdf.kernel.pdf.PdfWriter;
import com.itextpdf.kernel.pdf.PdfArray;
import com.itextpdf.kernel.pdf.PdfDictionary;
import com.itextpdf.kernel.pdf.PdfDocument;
import com.itextpdf.kernel.pdf.PdfName;
import com.itextpdf.kernel.pdf.PdfObject;
import com.itextpdf.kernel.pdf.PdfPage;
import com.itextpdf.kernel.pdf.canvas.PdfCanvas;
import com.itextpdf.layout.Canvas;
import com.itextpdf.layout.element.Paragraph;
import com.itextpdf.layout.properties.TextAlignment;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Schema;

import java.io.*;
import org.apache.pdfbox.pdmodel.*;
import org.apache.pdfbox.text.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import io.swagger.v3.oas.annotations.*;
import io.swagger.v3.oas.annotations.media.Schema;
import org.springframework.http.ResponseEntity;
@RestController
@Tag(name = "Other", description = "Other APIs")
public class ShowJavascript {

    private static final Logger logger = LoggerFactory.getLogger(ShowJavascript.class);
    @PostMapping(consumes = "multipart/form-data", value = "/show-javascript")
    @Operation(summary = "Extract header from PDF file", description = "This endpoint accepts a PDF file and attempts to extract its title or header based on heuristics. Input:PDF Output:PDF Type:SISO")
    public ResponseEntity<byte[]> extractHeader(
    	            @RequestPart(value = "fileInput") @Parameter(description = "The input PDF file from which the javascript is to be extracted.", required = true) MultipartFile inputFile)  
    	            throws Exception {

    	try (
			    PdfDocument itextDoc = new PdfDocument(new PdfReader(inputFile.getInputStream()))
			) {
    	        
    		String name = "";
    		String script = "";
    		String entryName = "File: "+inputFile.getOriginalFilename() + ",  Script: ";
    	      //Javascript
                PdfDictionary namesDict = itextDoc.getCatalog().getPdfObject().getAsDictionary(PdfName.Names);
                if (namesDict != null) {
                    PdfDictionary javascriptDict = namesDict.getAsDictionary(PdfName.JavaScript);
                    if (javascriptDict != null) {

                        PdfArray namesArray = javascriptDict.getAsArray(PdfName.Names);
                        for (int i = 0; i < namesArray.size(); i += 2) {
                            if(namesArray.getAsString(i) != null)
                            	name =  namesArray.getAsString(i).toString();

                            PdfObject jsCode = namesArray.get(i+1);
                            if (jsCode instanceof PdfStream) {
                                byte[] jsCodeBytes = ((PdfStream)jsCode).getBytes();
                                String jsCodeStr = new String(jsCodeBytes, StandardCharsets.UTF_8);
                                script = "//" + entryName + name + "\n" +jsCodeStr;

                            } else if (jsCode instanceof PdfDictionary) {
                                // If the JS code is in a dictionary, you'll need to know the key to use.
                                // Assuming the key is PdfName.JS:
                                PdfStream jsCodeStream = ((PdfDictionary)jsCode).getAsStream(PdfName.JS);
                                if (jsCodeStream != null) {
                                    byte[] jsCodeBytes = jsCodeStream.getBytes();
                                    String jsCodeStr = new String(jsCodeBytes, StandardCharsets.UTF_8);
                                    script = "//" + entryName + name + "\n" +jsCodeStr;
                                }
                            }
                        }

                    }
                }
                if(script.equals("")) {
                	script = "PDF '" +inputFile.getOriginalFilename() + "' does not contain Javascript";
                }
               return WebResponseUtils.bytesToWebResponse(script.getBytes(), name + ".js");
    	}
    	
    }
    



}
