package stirling.software.SPDF.controller.api;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentCatalog;
import org.apache.pdfbox.pdmodel.PDDocumentInformation;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDMetadata;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.outline.PDDocumentOutline;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.outline.PDOutlineItem;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDField;
import org.apache.pdfbox.pdmodel.interactive.form.PDSignatureField;
import org.apache.xmpbox.XMPMetadata;
import org.apache.xmpbox.schema.XMPBasicSchema;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Operation;

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.swagger.StandardPdfResponse;
import stirling.software.SPDF.model.api.general.MergePdfsRequest;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.GeneralApi;
import stirling.software.common.enumeration.ResourceWeight;
import stirling.software.common.model.tool.ToolArity;
import stirling.software.common.model.tool.ToolFormat;
import stirling.software.common.model.tool.ToolIO;
import stirling.software.common.pdf.worker.MergeJob;
import stirling.software.common.pdf.worker.PdfWorkerPool;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.PdfErrorUtils;
import stirling.software.common.util.PdfUtils;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;
import stirling.software.common.util.XmpUtils;

@GeneralApi
@Slf4j
public class MergeController {
    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final TempFileManager tempFileManager;
    private final PdfWorkerPool pdfWorkerPool;

    @Autowired
    public MergeController(
            CustomPDFDocumentFactory pdfDocumentFactory,
            TempFileManager tempFileManager,
            PdfWorkerPool pdfWorkerPool) {
        this.pdfDocumentFactory = pdfDocumentFactory;
        this.tempFileManager = tempFileManager;
        this.pdfWorkerPool = pdfWorkerPool;
    }

    public MergeController(
            CustomPDFDocumentFactory pdfDocumentFactory, TempFileManager tempFileManager) {
        this(pdfDocumentFactory, tempFileManager, PdfWorkerPool.inProcess());
    }

    public PDDocument mergeDocuments(List<PDDocument> documents) throws IOException {
        PDDocument mergedDoc = pdfDocumentFactory.createNewDocument();
        boolean success = false;
        try {
            for (PDDocument doc : documents) {
                for (PDPage page : doc.getPages()) {
                    mergedDoc.addPage(page);
                }
            }
            success = true;
            return mergedDoc;
        } finally {
            if (!success) {
                mergedDoc.close();
            }
        }
    }

    private static MultipartFile[] reorderFilesByProvidedOrder(
            MultipartFile[] files, String fileOrder) {
        String[] desired =
                stirling.software.common.util.RegexPatternUtils.getInstance()
                        .getNewlineSplitPattern()
                        .split(fileOrder);

        List<MultipartFile> remaining = new ArrayList<>(Arrays.asList(files));
        List<MultipartFile> ordered = new ArrayList<>(files.length);

        for (String name : desired) {
            name = name.trim();
            if (name.isEmpty()) {
                log.debug("Skipping empty entry");
                continue;
            }
            int idx = indexOfByOriginalFilename(remaining, name);
            if (idx >= 0) {
                ordered.add(remaining.remove(idx));
            } else {
                log.debug("Filename from order list not found in uploaded files: {}", name);
            }
        }

        ordered.addAll(remaining);
        return ordered.toArray(new MultipartFile[0]);
    }

    private Comparator<MultipartFile> getSortComparator(String sortType) {
        return switch (sortType) {
            case "byFileName" ->
                    Comparator.comparing(
                            (MultipartFile mf) -> {
                                String name = mf.getOriginalFilename();
                                return name == null ? "" : name;
                            },
                            String.CASE_INSENSITIVE_ORDER);
            case "byDateModified" ->
                    (file1, file2) -> {
                        long t1 = getPdfDateTimeSafe(file1);
                        long t2 = getPdfDateTimeSafe(file2);
                        return Long.compare(t2, t1);
                    };
            case "byDateCreated" ->
                    (file1, file2) -> {
                        long t1 = getPdfDateTimeSafe(file1);
                        long t2 = getPdfDateTimeSafe(file2);
                        return Long.compare(t2, t1);
                    };
            case "byPDFTitle" ->
                    // Titles must be read per file: a pairwise load that returns 0 when either
                    // side is unreadable (an image input) makes the comparator intransitive.
                    Comparator.comparing(
                            this::getPdfTitleSafe,
                            Comparator.nullsLast(String.CASE_INSENSITIVE_ORDER));
            case "orderProvided" -> (file1, file2) -> 0;
            default -> (file1, file2) -> 0;
        };
    }

    private void addTableOfContents(PDDocument mergedDocument, MultipartFile[] files) {
        PDDocumentOutline outline = new PDDocumentOutline();
        mergedDocument.getDocumentCatalog().setDocumentOutline(outline);

        int pageIndex = 0;
        for (MultipartFile file : files) {
            String filename = file.getOriginalFilename();
            String title = GeneralUtils.removeExtension(filename);

            PDOutlineItem item = new PDOutlineItem();
            item.setTitle(title);

            if (pageIndex < mergedDocument.getNumberOfPages()) {
                PDPage page = mergedDocument.getPage(pageIndex);
                item.setDestination(page);
            }
            outline.addLast(item);

            try (PDDocument doc = pdfDocumentFactory.load(file)) {
                pageIndex += doc.getNumberOfPages();
            } catch (IOException e) {
                ExceptionUtils.logException("document loading for TOC generation", e);
                pageIndex++;
            }
        }
    }

    /** Null when the file has no title or is not a loadable PDF (an image), sorting those last. */
    private String getPdfTitleSafe(MultipartFile file) {
        try (PDDocument doc = pdfDocumentFactory.load(file)) {
            PDDocumentInformation info = doc.getDocumentInformation();
            return info != null ? info.getTitle() : null;
        } catch (IOException e) {
            return null;
        }
    }

    private long getPdfDateTimeSafe(MultipartFile file) {
        try {
            try (PDDocument doc = pdfDocumentFactory.load(file)) {
                PDDocumentInformation info = doc.getDocumentInformation();
                if (info != null) {
                    if (info.getModificationDate() != null) {
                        return info.getModificationDate().getTimeInMillis();
                    }
                    if (info.getCreationDate() != null) {
                        return info.getCreationDate().getTimeInMillis();
                    }
                }

                PDMetadata metadata = doc.getDocumentCatalog().getMetadata();
                if (metadata != null) {
                    try {
                        XMPMetadata xmp = XmpUtils.parse(metadata, true);
                        XMPBasicSchema basic = xmp.getXMPBasicSchema();
                        if (basic != null) {
                            if (basic.getModifyDate() != null) {
                                return basic.getModifyDate().getTimeInMillis();
                            }
                            if (basic.getCreateDate() != null) {
                                return basic.getCreateDate().getTimeInMillis();
                            }
                        }
                    } catch (Exception e) {
                        log.debug(
                                "Unable to read XMP metadata dates from uploaded file: {}",
                                e.getMessage());
                    }
                }
            }
        } catch (IOException e) {
            log.debug("Unable to read PDF dates from uploaded file: {}", e.getMessage());
        }
        return 0L;
    }

    private static int indexOfByOriginalFilename(List<MultipartFile> list, String name) {
        for (int i = 0; i < list.size(); i++) {
            MultipartFile f = list.get(i);
            if (name.equals(f.getOriginalFilename())) return i;
        }
        return -1;
    }

    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            value = "/merge-pdfs",
            resourceWeight = ResourceWeight.MEDIUM_WEIGHT)
    @StandardPdfResponse
    @ToolIO(
            accepts = {ToolFormat.PDF, ToolFormat.IMAGE},
            // The installed ImageIO readers cover these; ToolFormat.IMAGE's ai/eps have none.
            inputExtensions = {
                "pdf", "png", "jpg", "jpeg", "gif", "bmp", "tif", "tiff", "webp", "svg", "psd"
            },
            produces = ToolFormat.PDF,
            arity = ToolArity.MISO)
    @Operation(
            summary = "Merge multiple PDF files into one",
            description =
                    "This endpoint merges multiple PDF files into a single PDF file. The merged"
                            + " file will contain all pages from the input files in the order they were"
                            + " provided. Image inputs are converted to PDF pages before merging.")
    public ResponseEntity<Resource> mergePdfs(
            @ModelAttribute MergePdfsRequest request,
            @RequestParam(value = "fileOrder", required = false) String fileOrder)
            throws IOException {
        List<File> filesToDelete = new ArrayList<>();
        TempFile outputTempFile = null;

        boolean removeCertSign = Boolean.TRUE.equals(request.getRemoveCertSign());
        boolean generateToc = request.isGenerateToc();

        MultipartFile[] files = request.getFileInput();
        if (files == null) {
            files = new MultipartFile[0];
        }

        if (fileOrder != null && !fileOrder.isBlank()) {
            log.info("Reordering files based on fileOrder parameter");
            files = reorderFilesByProvidedOrder(files, fileOrder);
        } else {
            log.info("Sorting files based on sortType: {}", request.getSortType());
            Arrays.sort(files, getSortComparator(request.getSortType()));
        }

        try (TempFile mt = new TempFile(tempFileManager, ".pdf")) {

            List<Path> inputPaths = new ArrayList<>(files.length);
            for (MultipartFile multipartFile : files) {
                File tempFile;
                if (isImageFile(multipartFile)) {
                    // Convert images to PDF so JPDFium can merge them; fall back to the raw
                    // upload if conversion fails so the merge reports it.
                    try {
                        tempFile = convertImageToPdf(multipartFile);
                    } catch (Exception e) {
                        ExceptionUtils.logException("image to PDF conversion for merge", e);
                        tempFile = tempFileManager.convertMultipartFileToFile(multipartFile);
                    }
                } else {
                    tempFile = tempFileManager.convertMultipartFileToFile(multipartFile);
                }
                filesToDelete.add(tempFile);
                inputPaths.add(tempFile.toPath());
            }

            MergeJob.Result merged;
            try {
                merged =
                        pdfWorkerPool.execute(
                                new MergeJob(
                                        inputPaths,
                                        mt.getFile().toPath(),
                                        generateToc ? tocTitles(files) : null,
                                        removeCertSign));
            } catch (IOException e) {
                ExceptionUtils.logException("PDF merge", e);
                if (PdfErrorUtils.isCorruptedPdfError(e)) {
                    throw ExceptionUtils.createMultiplePdfCorruptedException(e);
                }
                throw e;
            }

            boolean sigFlattenNeeded =
                    removeCertSign && (merged.hasSignatures() || merged.signatureCheckFailed());
            if (removeCertSign && !sigFlattenNeeded) {
                log.info(
                        "removeCertSign requested but merged document has no signature"
                                + " fields; skipping PDFBox flatten pass");
            }

            if (sigFlattenNeeded) {
                try (PDDocument mergedDocument = pdfDocumentFactory.load(mt.getFile())) {
                    PDDocumentCatalog catalog = mergedDocument.getDocumentCatalog();
                    PDAcroForm acroForm = catalog.getAcroForm();
                    if (acroForm != null) {
                        List<PDField> fieldsToRemove =
                                acroForm.getFields().stream()
                                        .filter(PDSignatureField.class::isInstance)
                                        .toList();
                        if (!fieldsToRemove.isEmpty()) {
                            acroForm.flatten(fieldsToRemove, false);
                        }
                    }
                    outputTempFile = new TempFile(tempFileManager, ".pdf");
                    try {
                        mergedDocument.save(outputTempFile.getFile());
                    } catch (Exception e) {
                        outputTempFile.close();
                        outputTempFile = null;
                        throw e;
                    }
                }
            } else {
                outputTempFile = new TempFile(tempFileManager, ".pdf");
                try {
                    Files.copy(
                            mt.getFile().toPath(),
                            outputTempFile.getFile().toPath(),
                            java.nio.file.StandardCopyOption.REPLACE_EXISTING);
                } catch (Exception e) {
                    outputTempFile.close();
                    outputTempFile = null;
                    throw e;
                }
            }
        } catch (Exception ex) {
            if (outputTempFile != null) {
                outputTempFile.close();
            }
            if (ex instanceof IOException && PdfErrorUtils.isCorruptedPdfError((IOException) ex)) {
                log.warn("Corrupted PDF detected in merge pdf process: {}", ex.getMessage());
            } else {
                log.error("Error in merge pdf process", ex);
            }
            throw ex;
        } finally {
            for (File file : filesToDelete) {
                tempFileManager.deleteTempFile(file);
            }
        }

        String firstFilename = files.length > 0 ? files[0].getOriginalFilename() : null;
        String mergedFileName =
                GeneralUtils.generateFilename(firstFilename, "_merged_unsigned.pdf");

        return WebResponseUtils.pdfFileToWebResponse(outputTempFile, mergedFileName);
    }

    private boolean isImageFile(MultipartFile file) {
        String contentType = file.getContentType();
        if (contentType != null && contentType.toLowerCase(Locale.ROOT).startsWith("image/")) {
            return true;
        }
        String filename = file.getOriginalFilename();
        if (filename == null) {
            return false;
        }
        int dot = filename.lastIndexOf('.');
        if (dot < 0 || dot == filename.length() - 1) {
            return false;
        }
        return ToolFormat.IMAGE
                .getExtensions()
                .contains(filename.substring(dot + 1).toLowerCase(Locale.ROOT));
    }

    private File convertImageToPdf(MultipartFile image) throws IOException {
        byte[] pdfBytes =
                PdfUtils.imageToPdf(
                        new MultipartFile[] {image},
                        "maintainAspectRatio",
                        false,
                        "color",
                        pdfDocumentFactory);
        File pdfFile = tempFileManager.createTempFile(".pdf");
        try {
            Files.write(pdfFile.toPath(), pdfBytes);
        } catch (IOException e) {
            tempFileManager.deleteTempFile(pdfFile);
            throw e;
        }
        return pdfFile;
    }

    private static List<String> tocTitles(MultipartFile[] files) {
        List<String> titles = new ArrayList<>(files.length);
        for (int i = 0; i < files.length; i++) {
            String title = GeneralUtils.removeExtension(files[i].getOriginalFilename());
            titles.add(title == null || title.isBlank() ? "Document " + (i + 1) : title);
        }
        return titles;
    }
}
