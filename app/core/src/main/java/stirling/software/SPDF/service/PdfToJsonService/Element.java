package stirling.software.SPDF.service.PdfToJsonService;

import java.util.ArrayList;
import java.util.List;

import com.google.gson.annotations.Expose;
import com.google.gson.annotations.SerializedName;

public class Element {
    @SerializedName("value")
    @Expose
    public String value;

    @SerializedName("tag")
    @Expose
    public String tag;

    @SerializedName("children")
    @Expose
    public List<Element> children;

    @SerializedName("notes")
    @Expose
    public List<Note> notes;

    // Transient fields (not serialized to JSON)
    public transient Element parent;
    public transient boolean isHeader;
    public transient int headerSize;
    public transient boolean isRootTag;
    public transient int largestHeader;
    public transient List<String> dropTagList;
    public transient boolean inList;
    public transient String rootHeader;

    public Element(String element, int maxHeader, String rootHeader) {
        Tuple<String, String> tagResult = PDFProcessor.getTag(element);
        this.tag = tagResult.first;
        this.value = tagResult.second;
        this.parent = null;
        this.children = new ArrayList<>();
        this.notes = new ArrayList<>();
        this.isHeader = tag != null && tag.contains("h");

        // Handle header size parsing safely
        if (this.isHeader && tag.length() > 1) {
            try {
                this.headerSize = Integer.parseInt(tag.substring(1));
            } catch (NumberFormatException e) {
                this.headerSize = 0;
            }
        } else {
            this.headerSize = 0;
        }

        this.rootHeader = rootHeader;
        this.isRootTag = rootHeader != null && rootHeader.equals(this.tag);
        this.largestHeader = maxHeader;
        this.dropTagList = new ArrayList<>();
        this.inList = false;
    }

    public void dropTags(List<String> tags) {
        this.dropTagList = new ArrayList<>(tags);
    }

    public void setParent(Element parent) {
        this.parent = parent;
    }

    public void addChild(Element child) {
        this.children.add(child);
    }

    public void addHeaderElement(Element element) {
        if (this.parent == null) {
            addAsChild(this, element);
            return;
        }

        if (this.headerSize < element.headerSize) {
            addAsChild(this, element);
            return;
        }

        Element current = this.parent;
        while (current.parent != null && current.headerSize < element.headerSize) {
            current = current.parent;
        }

        if (current.headerSize == element.headerSize && current.parent != null) {
            element.parent = current.parent;
            current.parent.addChild(element);
            return;
        }

        element.parent = current;
        current.children.add(element);
    }

    private Element addAsChild(Element parent, Element element) {
        element.setParent(parent);
        parent.addChild(element);
        return element;
    }

    public boolean isRootInList() {
        return getRoot().inList;
    }

    public void setRootInList() {
        getRoot().inList = true;
    }

    public Element getRoot() {
        Element iter = this;
        while (iter.parent != null) {
            iter = iter.parent;
        }
        return iter;
    }

    public void addNote(String note, String tag) {
        if (dropTagList.stream().anyMatch(tag::contains)) {
            System.out.println("Dropping: " + tag + " - " + note);
            return;
        }
        this.notes.add(new Note(tag, note));
    }

    public boolean includeTag() {
        if ("h1".equals(tag)) return false;
        return tag.contains("h") || isParagraph();
    }

    public boolean isParagraph() {
        if (isHeader) {
            return headerSize > largestHeader;
        }
        return tag.contains("p") || tag.contains("s");
    }

    public boolean excludeTag() {
        return !includeTag();
    }

    @Override
    public String toString() {
        return value;
    }
}
