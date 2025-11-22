package stirling.software.SPDF.service.PdfToJsonService;

import com.google.gson.annotations.Expose;
import com.google.gson.annotations.SerializedName;

public class Note {
    @SerializedName("tag")
    @Expose
    public String tag;

    @SerializedName("value")
    @Expose
    public String value;

    public Note(String tag, String value) {
        this.tag = tag;
        this.value = value;
    }

    @Override
    public String toString() {
        return value;
    }
}
