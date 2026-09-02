package stirling.software.proprietary.storage.repository;

import java.util.List;

import io.quarkus.hibernate.orm.panache.PanacheRepository;
import io.quarkus.panache.common.Page;
import io.quarkus.panache.common.Sort;

import jakarta.enterprise.context.ApplicationScoped;

import stirling.software.proprietary.storage.model.StorageCleanupEntry;

@ApplicationScoped
public class StorageCleanupEntryRepository implements PanacheRepository<StorageCleanupEntry> {

    public List<StorageCleanupEntry> findTop50ByOrderByUpdatedAtAsc() {
        return find("", Sort.by("updatedAt").ascending()).page(Page.ofSize(50)).list();
    }
}
