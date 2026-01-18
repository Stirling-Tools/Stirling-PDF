package stirling.software.proprietary.storage.model;

import java.io.Serializable;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "stored_file_blobs")
@NoArgsConstructor
@Getter
@Setter
public class StoredFileBlob implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @Column(name = "storage_key", nullable = false, length = 128)
    private String storageKey;

    @Lob
    @Column(name = "data", nullable = false, columnDefinition = "BYTEA")
    private byte[] data;
}
