package stirling.software.common.pdf.worker;

import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Deque;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Set;

import lombok.extern.slf4j.Slf4j;

import stirling.software.jpdfium.PdfDocument;
import stirling.software.jpdfium.PdfMerge;
import stirling.software.jpdfium.doc.Bookmark;
import stirling.software.jpdfium.doc.PdfBookmarkEditor;
import stirling.software.jpdfium.doc.PdfBookmarkEditor.BookmarkTree;

/**
 * Merges PDFs with JPDFium, keeping source bookmarks; tocTitles (or null) adds one per input. Every
 * PDFium call for a merge happens here so a worker process can take it whole.
 */
@Slf4j
public record MergeJob(
        List<Path> inputs, Path output, List<String> tocTitles, boolean checkSignatures)
        implements PdfWorkerJob<MergeJob.Result> {

    public static final String TYPE = "merge";
    private static final int MAX_BOOKMARK_NODES = 100_000;

    /** signatureCheckFailed means the output couldn't be checked, so assume signatures. */
    public record Result(int[] pageCounts, boolean hasSignatures, boolean signatureCheckFailed) {}

    @Override
    public String type() {
        return TYPE;
    }

    @Override
    public void writeRequest(DataOutputStream out) throws IOException {
        out.writeInt(inputs.size());
        for (Path input : inputs) {
            PdfWorkerProtocol.writeString(out, input.toString());
        }
        PdfWorkerProtocol.writeString(out, output.toString());
        out.writeBoolean(tocTitles != null);
        if (tocTitles != null) {
            out.writeInt(tocTitles.size());
            for (String title : tocTitles) {
                PdfWorkerProtocol.writeString(out, title);
            }
        }
        out.writeBoolean(checkSignatures);
    }

    static MergeJob readRequest(DataInputStream in) throws IOException {
        int count = PdfWorkerProtocol.readCount(in);
        List<Path> inputs = new ArrayList<>(count);
        for (int i = 0; i < count; i++) {
            inputs.add(Path.of(PdfWorkerProtocol.readString(in)));
        }
        Path output = Path.of(PdfWorkerProtocol.readString(in));
        List<String> titles = null;
        if (in.readBoolean()) {
            int titleCount = PdfWorkerProtocol.readCount(in);
            titles = new ArrayList<>(titleCount);
            for (int i = 0; i < titleCount; i++) {
                titles.add(PdfWorkerProtocol.readString(in));
            }
        }
        return new MergeJob(inputs, output, titles, in.readBoolean());
    }

    static void writeResult(DataOutputStream out, Result result) throws IOException {
        out.writeInt(result.pageCounts().length);
        for (int pages : result.pageCounts()) {
            out.writeInt(pages);
        }
        out.writeBoolean(result.hasSignatures());
        out.writeBoolean(result.signatureCheckFailed());
    }

    @Override
    public Result readResult(DataInputStream in) throws IOException {
        int[] pageCounts = new int[PdfWorkerProtocol.readCount(in)];
        for (int i = 0; i < pageCounts.length; i++) {
            pageCounts[i] = in.readInt();
        }
        return new Result(pageCounts, in.readBoolean(), in.readBoolean());
    }

    @Override
    public Result run() throws IOException {
        int[] pageCounts = merge();
        if (!checkSignatures) {
            return new Result(pageCounts, false, false);
        }
        try (PdfDocument check = PdfDocument.open(output)) {
            return new Result(pageCounts, !check.signatures().isEmpty(), false);
        } catch (Exception e) {
            log.debug("JPDFium signature pre-check failed: {}", e.getMessage());
            return new Result(pageCounts, false, true);
        }
    }

    private int[] merge() throws IOException {
        if (inputs.isEmpty()) {
            try (PdfDocument empty = PdfDocument.open(new byte[0])) {
                empty.save(output);
            } catch (Exception ignored) {
                Files.write(output, new byte[0]);
            }
            return new int[0];
        }

        List<PdfDocument> docs = new ArrayList<>(inputs.size());
        int[] pageCounts = new int[inputs.size()];
        int[] pageOffsets = new int[inputs.size()];
        List<List<Bookmark>> sourceBookmarks = new ArrayList<>(inputs.size());
        int runningOffset = 0;
        try {
            for (int i = 0; i < inputs.size(); i++) {
                PdfDocument doc = PdfDocument.open(inputs.get(i));
                docs.add(doc);
                pageCounts[i] = doc.pageCount();
                pageOffsets[i] = runningOffset;
                sourceBookmarks.add(doc.bookmarks());
                runningOffset += pageCounts[i];
            }

            BookmarkTree combinedTree = buildCombinedBookmarkTree(pageOffsets, sourceBookmarks);
            try (PdfDocument merged = PdfMerge.merge(docs)) {
                if (combinedTree.entries().isEmpty()) {
                    merged.save(output);
                } else {
                    PdfBookmarkEditor.setBookmarks(merged, combinedTree, output);
                }
            }
        } catch (RuntimeException e) {
            throw new IOException("JPDFium merge failed", e);
        } finally {
            for (PdfDocument doc : docs) {
                try {
                    doc.close();
                } catch (Exception ignored) {
                }
            }
        }
        return pageCounts;
    }

    private BookmarkTree buildCombinedBookmarkTree(
            int[] pageOffsets, List<List<Bookmark>> sourceBookmarks) {
        BookmarkTree.Builder builder = BookmarkTree.builder();
        if (tocTitles != null) {
            for (int i = 0; i < tocTitles.size() && i < pageOffsets.length; i++) {
                builder.add(tocTitles.get(i), pageOffsets[i]);
            }
        }
        for (int i = 0; i < sourceBookmarks.size(); i++) {
            int offset = pageOffsets[i];
            for (Bookmark bm : sourceBookmarks.get(i)) {
                addBookmarkFlat(builder, bm, offset);
            }
        }
        return builder.build();
    }

    private static void addBookmarkFlat(BookmarkTree.Builder builder, Bookmark root, int offset) {
        Deque<Bookmark> stack = new ArrayDeque<>();
        Set<Bookmark> visited = Collections.newSetFromMap(new IdentityHashMap<>());
        stack.push(root);
        int processed = 0;
        while (!stack.isEmpty() && processed < MAX_BOOKMARK_NODES) {
            Bookmark bm = stack.pop();
            if (!visited.add(bm)) {
                continue;
            }
            processed++;
            if (bm.isInternal() && bm.title() != null) {
                builder.add(bm.title(), offset + bm.pageIndex());
            }
            if (bm.hasChildren()) {
                List<Bookmark> children = bm.children();
                for (int i = children.size() - 1; i >= 0; i--) {
                    stack.push(children.get(i));
                }
            }
        }
        if (processed >= MAX_BOOKMARK_NODES) {
            log.warn(
                    "Source bookmark traversal hit {}-node cap; remaining bookmarks dropped",
                    MAX_BOOKMARK_NODES);
        }
    }
}
