package stirling.software.proprietary.policy.engine;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Stream;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.encryption.InvalidPasswordException;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.tool.ToolFormat;
import stirling.software.common.model.tool.ToolIOSource;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.proprietary.connectedaccount.CloudProvider;
import stirling.software.proprietary.connectedaccount.ConnectedAccount;
import stirling.software.proprietary.connectedaccount.ConnectedAccountService;
import stirling.software.proprietary.integration.purview.protection.ProtectedPdfDetector;
import stirling.software.proprietary.integration.purview.protection.ProtectionInfo;
import stirling.software.proprietary.integration.purview.protection.RightsManagementException;
import stirling.software.proprietary.integration.purview.protection.RightsManagementService;
import stirling.software.proprietary.policy.model.PipelineStep;
import stirling.software.proprietary.policy.model.PolicyInputs;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;

@Slf4j
@Service
@RequiredArgsConstructor
public class ProtectedPdfRuns {

    private static final byte[] PDF_2_HEADER = "%PDF-2".getBytes(StandardCharsets.US_ASCII);
    private static final byte[] PDF_HEADER = "%PDF-".getBytes(StandardCharsets.US_ASCII);
    private static final String REMOVE_PASSWORD = "/api/v1/security/remove-password";
    private static final Set<String> PURVIEW_UNSUPPORTED =
            Set.of(
                    "/api/v1/security/add-password",
                    "/api/v1/security/remove-password",
                    "/api/v1/integration/purview-apply-label",
                    "/api/v1/integration/purview-read-label",
                    "/api/v1/security/cert-sign",
                    "/api/v1/security/timestamp-pdf",
                    "/api/v1/security/remove-cert-sign",
                    "/api/v1/ai/tools/classify-and-label",
                    "/api/v1/docparse/ingest",
                    "/api/v1/form/form-detection/detect",
                    "/api/v1/general/edit-table-of-contents",
                    "/api/v1/general/overlay-pdfs",
                    "/api/v1/convert/pdf/ua",
                    "/api/v1/convert/pdf/pdfa");
    private static final Set<String> PURVIEW_NEEDS_COPY =
            Set.of("/api/v1/misc/auto-rename", "/api/v1/general/split-pdf-by-chapters");

    private final RightsManagementService rightsManagement;
    private final ConnectedAccountService accounts;
    private final UserRepository users;
    private final ToolIOSource toolIO;

    public record RunAccount(Long accountId, String fileOwner) {}

    private record Original(Path file, String name) {}

    private enum Protection {
        NONE,
        PASSWORD,
        PURVIEW
    }

    public final class Unlocked implements AutoCloseable {
        private final PolicyInputs inputs;
        private final List<Original> originals;
        private final ConnectedAccount account;
        private final Path workDir;
        private final Set<Integer> passwordInputs;

        private Unlocked(
                PolicyInputs inputs,
                List<Original> originals,
                ConnectedAccount account,
                Path workDir,
                Set<Integer> passwordInputs) {
            this.inputs = inputs;
            this.originals = originals;
            this.account = account;
            this.workDir = workDir;
            this.passwordInputs = passwordInputs;
        }

        public PolicyInputs inputs() {
            return inputs;
        }

        public boolean hasProtectedInputs() {
            return account != null;
        }

        public List<Resource> protect(PolicyExecutionResult result) throws IOException {
            for (int i = 0; i < result.files().size(); i++) {
                Integer origin = i < result.origins().size() ? result.origins().get(i) : null;
                boolean mustKeepPassword =
                        origin == null
                                ? !passwordInputs.isEmpty()
                                : passwordInputs.contains(origin);
                if (mustKeepPassword
                        && protectionOf(result.files().get(i)) != Protection.PASSWORD) {
                    throw passwordDropped();
                }
            }
            if (!hasProtectedInputs()) {
                return result.files();
            }
            List<Original> protectedOriginals =
                    originals.stream().filter(Objects::nonNull).toList();
            List<Resource> protectedFiles = new ArrayList<>();
            for (int i = 0; i < result.files().size(); i++) {
                Resource file = result.files().get(i);
                Integer origin = i < result.origins().size() ? result.origins().get(i) : null;
                Original original;
                if (origin != null) {
                    original = originals.get(origin);
                } else if (protectedOriginals.size() == 1) {
                    original = protectedOriginals.getFirst();
                } else {
                    throw ExceptionUtils.createRightsManagedInputException(
                            "This run combines several Microsoft Purview-protected PDFs into "
                                    + nameOf(file)
                                    + ", and one file can only carry one document's protection.");
                }
                protectedFiles.add(original == null ? file : protectLike(original, file));
            }
            return protectedFiles;
        }

        private Resource protectLike(Original original, Resource file) throws IOException {
            String name = nameOf(file);
            Path derived = copyToTemp(file, Files.createTempFile(workDir, "derived-", ".pdf"));
            if (!startsWith(derived, PDF_HEADER)) {
                throw ExceptionUtils.createRightsManagedInputException(
                        name
                                + " came from "
                                + original.name()
                                + ", which is protected with Microsoft Purview. Only PDF outputs"
                                + " can be protected again, so it was not delivered.");
            }
            byte[] protectedBytes;
            try {
                protectedBytes = rightsManagement.protectLike(account, original.file(), derived);
            } catch (RightsManagementException e) {
                throw ExceptionUtils.createRightsManagedInputException(
                        name
                                + " could not be protected like "
                                + original.name()
                                + ": "
                                + e.getMessage());
            }
            return namedFile(Files.write(derived, protectedBytes), name);
        }

        @Override
        public void close() {
            if (workDir == null) {
                return;
            }
            try (Stream<Path> paths = Files.walk(workDir)) {
                paths.sorted(Comparator.reverseOrder())
                        .forEach(
                                path -> {
                                    try {
                                        Files.deleteIfExists(path);
                                    } catch (IOException e) {
                                        log.warn("Could not delete {}: {}", path, e.getMessage());
                                    }
                                });
            } catch (IOException e) {
                log.warn("Could not clean up {}: {}", workDir, e.getMessage());
            }
        }
    }

    public Unlocked unlock(PolicyInputs inputs, RunAccount runAccount, List<PipelineStep> steps)
            throws IOException {
        if (steps.isEmpty()) {
            return new Unlocked(inputs, List.of(), null, null, Set.of());
        }
        boolean firstStepTakesEncryptedPdfs = takesEncryptedPdfs(steps.getFirst());
        Set<Integer> passwordIndexes = new HashSet<>();
        List<Integer> protectedIndexes = new ArrayList<>();
        for (int i = 0; i < inputs.primary().size(); i++) {
            Protection protection = protectionOf(inputs.primary().get(i));
            if (protection == Protection.PURVIEW) {
                protectedIndexes.add(i);
            } else if (protection == Protection.PASSWORD) {
                if (!firstStepTakesEncryptedPdfs) {
                    throw passwordProtectedInput();
                }
                passwordIndexes.add(i);
            }
        }
        if (!passwordIndexes.isEmpty() && !protectedIndexes.isEmpty()) {
            throw ExceptionUtils.createRightsManagedInputException(
                    "A Microsoft Purview protected PDF can't be combined with a password-protected"
                            + " PDF in one run, because the result can only keep one kind of"
                            + " protection.");
        }
        Set<Integer> keptPasswords =
                removesPasswords(steps.getFirst()) ? Set.of() : Set.copyOf(passwordIndexes);
        if (protectedIndexes.isEmpty()) {
            return new Unlocked(inputs, List.of(), null, null, keptPasswords);
        }
        String firstName = nameOf(inputs.primary().get(protectedIndexes.getFirst()));
        requirePurviewSteps(firstName, steps);
        if (!rightsManagement.available()) {
            throw ExceptionUtils.createRightsManagedInputException(
                    firstName
                            + " is protected with Microsoft Purview, and this server is not set up"
                            + " to open protected PDFs.");
        }
        ConnectedAccount account = accountFor(runAccount, firstName);
        Path workDir = Files.createTempDirectory("stirling-protected-run-");
        Original[] originals = new Original[inputs.primary().size()];
        List<Resource> primary = new ArrayList<>(inputs.primary());
        Unlocked unlocked = null;
        try {
            for (int index : protectedIndexes) {
                Resource input = inputs.primary().get(index);
                String name = nameOf(input);
                Path original =
                        copyToTemp(input, Files.createTempFile(workDir, "original-", ".pdf"));
                RightsManagementService.Opened opened = open(account, original, name);
                requireEdit(name, opened.protection());
                requireCopyWhereNeeded(name, opened.protection(), steps);
                Path plaintext =
                        Files.write(
                                Files.createTempFile(workDir, "plaintext-", ".pdf"), opened.pdf());
                originals[index] = new Original(original, name);
                primary.set(index, namedFile(plaintext, name));
            }
            unlocked =
                    new Unlocked(
                            new PolicyInputs(primary, inputs.supportingFiles()),
                            Arrays.asList(originals),
                            account,
                            workDir,
                            Set.of());
            return unlocked;
        } finally {
            if (unlocked == null) {
                new Unlocked(inputs, List.of(), null, workDir, Set.of()).close();
            }
        }
    }

    private RightsManagementService.Opened open(
            ConnectedAccount account, Path original, String name) throws IOException {
        try {
            return rightsManagement.open(account, original);
        } catch (RightsManagementException e) {
            throw ExceptionUtils.createRightsManagedInputException(
                    name + " could not be opened with your Microsoft account: " + e.getMessage());
        }
    }

    private ConnectedAccount accountFor(RunAccount runAccount, String fileName) throws IOException {
        Long ownerId =
                runAccount.fileOwner() == null
                        ? null
                        : users.findByUsernameIgnoreCase(runAccount.fileOwner())
                                .map(User::getId)
                                .orElse(null);
        if (ownerId == null) {
            throw needsAccount(fileName);
        }
        if (runAccount.accountId() != null) {
            return accounts.find(runAccount.accountId())
                    .filter(ProtectedPdfRuns::isMicrosoft)
                    .filter(account -> account.getOwnerUserId().equals(ownerId))
                    .orElseThrow(() -> needsAccount(fileName));
        }
        List<ConnectedAccount> microsoft =
                users.findById(ownerId).map(accounts::list).orElse(List.of()).stream()
                        .filter(ProtectedPdfRuns::isMicrosoft)
                        .toList();
        if (microsoft.size() != 1) {
            throw needsAccount(fileName);
        }
        return microsoft.getFirst();
    }

    private static boolean isMicrosoft(ConnectedAccount account) {
        return CloudProvider.MICROSOFT.id().equals(account.getProvider());
    }

    private static IOException needsAccount(String fileName) {
        return ExceptionUtils.createRightsManagedInputException(
                fileName
                        + " is protected with Microsoft Purview. Read it from a OneDrive or"
                        + " SharePoint source, or connect exactly one Microsoft account, so the run"
                        + " can open it.");
    }

    private static void requireEdit(String name, ProtectionInfo protection) throws IOException {
        if (protection.permissions().edit()) {
            return;
        }
        String owner = protection.owner();
        throw ExceptionUtils.createRightsManagedInputException(
                "Your Microsoft account can view "
                        + name
                        + " but not edit it"
                        + (owner == null || owner.isBlank()
                                ? "."
                                : ". Ask " + owner + " for edit rights."));
    }

    private void requirePurviewSteps(String name, List<PipelineStep> steps) throws IOException {
        for (PipelineStep step : steps) {
            if (!keepsPurviewProtection(step)) {
                throw ExceptionUtils.createRightsManagedInputException(
                        name
                                + " is protected with Microsoft Purview, and "
                                + step.operation()
                                + " cannot keep that protection, so the file was not processed.");
            }
        }
    }

    private boolean keepsPurviewProtection(PipelineStep step) {
        String operation = step.operation();
        if (operation == null || PURVIEW_UNSUPPORTED.contains(operation)) {
            return false;
        }
        return toolIO.find(operation)
                .filter(spec -> spec.acceptsFormat(ToolFormat.PDF))
                .map(spec -> spec.resolveOutput(step.parameters()).format() == ToolFormat.PDF)
                .orElse(false);
    }

    private static void requireCopyWhereNeeded(
            String name, ProtectionInfo protection, List<PipelineStep> steps) throws IOException {
        if (protection.permissions().copy()) {
            return;
        }
        for (PipelineStep step : steps) {
            if (PURVIEW_NEEDS_COPY.contains(step.operation())) {
                throw ExceptionUtils.createRightsManagedInputException(
                        "Your Microsoft account can't copy content from "
                                + name
                                + ", which "
                                + step.operation()
                                + " needs.");
            }
        }
    }

    private boolean takesEncryptedPdfs(PipelineStep step) {
        String operation = step.operation();
        return operation != null
                && toolIO.find(operation)
                        .map(spec -> spec.acceptsFormat(ToolFormat.PDF_ENCRYPTED))
                        .orElse(false);
    }

    private static boolean removesPasswords(PipelineStep step) {
        return REMOVE_PASSWORD.equals(step.operation());
    }

    private static IOException passwordDropped() {
        return new ExceptionUtils.PdfPasswordException(
                "This run's result is no longer password-protected, so it was not delivered.",
                null,
                ExceptionUtils.ErrorCode.PDF_PASSWORD.getCode());
    }

    private static IOException passwordProtectedInput() {
        return new ExceptionUtils.PdfPasswordException(
                "This PDF is password-protected, and the first step of this run cannot keep that"
                        + " protection, so the file was not processed.",
                null,
                ExceptionUtils.ErrorCode.PDF_PASSWORD.getCode());
    }

    private static Protection protectionOf(Resource resource) throws IOException {
        Path copy = null;
        try {
            Path file = fileOf(resource);
            if (file == null) {
                copy = Files.createTempFile("stirling-protected-check-", ".pdf");
                file = copyToTemp(resource, copy);
            }
            if (!startsWith(file, PDF_HEADER)) {
                return Protection.NONE;
            }
            try (PDDocument document = Loader.loadPDF(file.toFile())) {
                if (document.isEncrypted()) {
                    return Protection.PASSWORD;
                }
                return startsWith(file, PDF_2_HEADER)
                                && ProtectedPdfDetector.isMicrosoftProtected(document)
                        ? Protection.PURVIEW
                        : Protection.NONE;
            } catch (InvalidPasswordException e) {
                return Protection.PASSWORD;
            } catch (IOException e) {
                return Protection.NONE;
            }
        } finally {
            if (copy != null) {
                Files.deleteIfExists(copy);
            }
        }
    }

    private static Path copyToTemp(Resource resource, Path target) throws IOException {
        try (InputStream in = resource.getInputStream()) {
            Files.copy(in, target, StandardCopyOption.REPLACE_EXISTING);
        }
        return target;
    }

    private static Path fileOf(Resource resource) {
        if (!resource.isFile()) {
            return null;
        }
        try {
            return resource.getFile().toPath();
        } catch (IOException e) {
            return null;
        }
    }

    private static boolean startsWith(Path file, byte[] prefix) throws IOException {
        byte[] head = new byte[prefix.length];
        try (InputStream in = Files.newInputStream(file)) {
            if (in.readNBytes(head, 0, head.length) < head.length) {
                return false;
            }
        }
        return Arrays.equals(head, prefix);
    }

    private static String nameOf(Resource resource) {
        String name = resource.getFilename();
        return name == null || name.isBlank() ? "document.pdf" : name;
    }

    private static Resource namedFile(Path path, String name) {
        return new FileSystemResource(path) {
            @Override
            public String getFilename() {
                return name;
            }
        };
    }
}
