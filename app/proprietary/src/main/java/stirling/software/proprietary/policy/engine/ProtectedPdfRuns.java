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
import java.util.List;
import java.util.Objects;
import java.util.stream.Stream;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.connectedaccount.CloudProvider;
import stirling.software.proprietary.connectedaccount.ConnectedAccount;
import stirling.software.proprietary.connectedaccount.ConnectedAccountService;
import stirling.software.proprietary.integration.purview.protection.ProtectedPdfDetector;
import stirling.software.proprietary.integration.purview.protection.ProtectionInfo;
import stirling.software.proprietary.integration.purview.protection.RightsManagementService;
import stirling.software.proprietary.policy.model.PolicyInputs;
import stirling.software.proprietary.security.database.repository.UserRepository;

@Slf4j
@Service
@RequiredArgsConstructor
public class ProtectedPdfRuns {

    private static final byte[] PDF_2_HEADER = "%PDF-2".getBytes(StandardCharsets.US_ASCII);
    private static final byte[] PDF_HEADER = "%PDF-".getBytes(StandardCharsets.US_ASCII);

    private final RightsManagementService rightsManagement;
    private final ConnectedAccountService accounts;
    private final UserRepository users;

    public record RunAccount(Long accountId, String fileOwner) {}

    private record Original(Path file, String name) {}

    public final class Unlocked implements AutoCloseable {
        private final PolicyInputs inputs;
        private final List<Original> originals;
        private final ConnectedAccount account;
        private final Path workDir;

        private Unlocked(
                PolicyInputs inputs,
                List<Original> originals,
                ConnectedAccount account,
                Path workDir) {
            this.inputs = inputs;
            this.originals = originals;
            this.account = account;
            this.workDir = workDir;
        }

        public PolicyInputs inputs() {
            return inputs;
        }

        public boolean hasProtectedInputs() {
            return account != null;
        }

        public List<Resource> protect(PolicyExecutionResult result) throws IOException {
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
                    throw new IOException(
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
            Path derived = Files.createTempFile(workDir, "derived-", ".pdf");
            try (InputStream in = file.getInputStream()) {
                Files.copy(in, derived, StandardCopyOption.REPLACE_EXISTING);
            }
            if (!startsWith(derived, PDF_HEADER)) {
                throw new IOException(
                        name
                                + " came from "
                                + original.name()
                                + ", which is protected with Microsoft Purview. Only PDF outputs"
                                + " can be protected again, so it was not delivered.");
            }
            byte[] protectedBytes = rightsManagement.protectLike(account, original.file(), derived);
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

    public Unlocked unlock(PolicyInputs inputs, RunAccount runAccount, boolean hasSteps)
            throws IOException {
        if (!hasSteps) {
            return new Unlocked(inputs, List.of(), null, null);
        }
        List<Integer> protectedIndexes = new ArrayList<>();
        for (int i = 0; i < inputs.primary().size(); i++) {
            if (isProtected(inputs.primary().get(i))) {
                protectedIndexes.add(i);
            }
        }
        if (protectedIndexes.isEmpty()) {
            return new Unlocked(inputs, List.of(), null, null);
        }
        String firstName = nameOf(inputs.primary().get(protectedIndexes.getFirst()));
        if (!rightsManagement.available()) {
            throw new IOException(
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
                Path original = Files.createTempFile(workDir, "original-", ".pdf");
                try (InputStream in = input.getInputStream()) {
                    Files.copy(in, original, StandardCopyOption.REPLACE_EXISTING);
                }
                RightsManagementService.Opened opened = rightsManagement.open(account, original);
                requireEdit(name, opened.protection());
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
                            workDir);
            return unlocked;
        } finally {
            if (unlocked == null) {
                new Unlocked(inputs, List.of(), null, workDir).close();
            }
        }
    }

    private ConnectedAccount accountFor(RunAccount runAccount, String fileName) throws IOException {
        Long ownerId =
                runAccount.fileOwner() == null
                        ? null
                        : users.findByUsernameIgnoreCase(runAccount.fileOwner())
                                .map(user -> user.getId())
                                .orElse(null);
        if (runAccount.accountId() != null) {
            return accounts.find(runAccount.accountId())
                    .filter(account -> CloudProvider.MICROSOFT.id().equals(account.getProvider()))
                    .filter(account -> ownerId == null || account.getOwnerUserId().equals(ownerId))
                    .orElseThrow(() -> needsAccount(fileName));
        }
        if (ownerId == null) {
            throw needsAccount(fileName);
        }
        List<ConnectedAccount> microsoft =
                users.findById(ownerId).map(accounts::list).orElse(List.of()).stream()
                        .filter(
                                account ->
                                        CloudProvider.MICROSOFT.id().equals(account.getProvider()))
                        .toList();
        if (microsoft.size() != 1) {
            throw needsAccount(fileName);
        }
        return microsoft.getFirst();
    }

    private static IOException needsAccount(String fileName) {
        return new IOException(
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
        throw new IOException(
                "Your Microsoft account can view "
                        + name
                        + " but not edit it"
                        + (owner == null || owner.isBlank()
                                ? "."
                                : ". Ask " + owner + " for edit rights."));
    }

    private static boolean isProtected(Resource resource) throws IOException {
        Path copy = null;
        try {
            Path file = fileOf(resource);
            if (file == null) {
                copy = Files.createTempFile("stirling-protected-check-", ".pdf");
                try (InputStream in = resource.getInputStream()) {
                    Files.copy(in, copy, StandardCopyOption.REPLACE_EXISTING);
                }
                file = copy;
            }
            if (!startsWith(file, PDF_2_HEADER)) {
                return false;
            }
            try (PDDocument document = Loader.loadPDF(file.toFile())) {
                return ProtectedPdfDetector.isMicrosoftProtected(document);
            } catch (IOException e) {
                return false;
            }
        } finally {
            if (copy != null) {
                Files.deleteIfExists(copy);
            }
        }
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
