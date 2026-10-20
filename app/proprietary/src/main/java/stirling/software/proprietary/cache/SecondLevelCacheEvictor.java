package stirling.software.proprietary.cache;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;

import org.hibernate.Session;
import org.hibernate.cache.spi.access.AccessType;
import org.hibernate.cache.spi.access.CachedDomainDataAccess;
import org.hibernate.cache.spi.access.SoftLock;
import org.hibernate.engine.spi.SessionFactoryImplementor;
import org.hibernate.engine.spi.SharedSessionContractImplementor;
import org.hibernate.metamodel.mapping.NaturalIdMapping;
import org.hibernate.persister.collection.CollectionPersister;
import org.hibernate.persister.entity.EntityPersister;
import org.hibernate.type.descriptor.java.JavaType;
import org.springframework.stereotype.Component;

import jakarta.persistence.EntityManagerFactory;

import lombok.extern.slf4j.Slf4j;

/**
 * Applies {@link CacheEviction}s to this JVM's second-level cache.
 *
 * <p>A keyed eviction on a READ_WRITE region leaves Hibernate's own soft lock behind rather than an
 * empty slot: a session that opened before the eviction and is still loading the old row cannot
 * write it back, so a stale load racing an eviction stays out of the cache. Region-wide evictions
 * have no such guard and rely on the region TTL.
 *
 * <p>Unknown roles and unparseable keys are logged and skipped, so one bad entry from a peer on a
 * different build does not drop the rest of its batch.
 */
@Slf4j
@Component
public class SecondLevelCacheEvictor {

    private final EntityManagerFactory entityManagerFactory;

    public SecondLevelCacheEvictor(EntityManagerFactory entityManagerFactory) {
        this.entityManagerFactory = entityManagerFactory;
    }

    public void apply(Collection<CacheEviction> evictions) {
        if (evictions.isEmpty()) {
            return;
        }
        SessionFactoryImplementor factory = sessionFactory();
        try (Session session = factory.openSession()) {
            SharedSessionContractImplementor source = (SharedSessionContractImplementor) session;
            for (CacheEviction eviction : evictions) {
                try {
                    apply(factory, source, eviction);
                } catch (RuntimeException ex) {
                    log.warn(
                            "Skipping second-level cache eviction {}: {}", eviction, ex.toString());
                }
            }
        }
    }

    public void evictAll() {
        sessionFactory().getCache().evictAllRegions();
    }

    private void apply(
            SessionFactoryImplementor factory,
            SharedSessionContractImplementor session,
            CacheEviction eviction) {
        switch (eviction.kind()) {
            case ALL -> factory.getCache().evictAllRegions();
            case ENTITY_REGION -> evictEntityRegion(factory, eviction.role());
            case ENTITY -> evictEntity(factory, session, entity(factory, eviction), eviction.key());
            case ENTITY_WITH_COLLECTIONS -> {
                EntityPersister persister = entity(factory, eviction);
                evictEntity(factory, session, persister, eviction.key());
                for (CollectionPersister collection : ownedCollections(factory, persister)) {
                    evictCollection(factory, session, collection, eviction.key());
                }
            }
            case COLLECTION -> {
                CollectionPersister collection =
                        factory.getMappingMetamodel().getCollectionDescriptor(eviction.role());
                evictCollection(factory, session, collection, eviction.key());
            }
            case NATURAL_ID -> evictNaturalId(session, entity(factory, eviction), eviction.key());
        }
    }

    private static EntityPersister entity(
            SessionFactoryImplementor factory, CacheEviction eviction) {
        return factory.getMappingMetamodel().getEntityDescriptor(eviction.role());
    }

    private static void evictEntity(
            SessionFactoryImplementor factory,
            SharedSessionContractImplementor session,
            EntityPersister persister,
            String key) {
        if (!persister.canWriteToCache()) {
            return;
        }
        Object id = parse(persister.getIdentifierMapping().getJavaType(), key);
        var access = persister.getCacheAccessStrategy();
        guardedEvict(session, access, access.generateCacheKey(id, persister, factory, null));
    }

    private static void evictCollection(
            SessionFactoryImplementor factory,
            SharedSessionContractImplementor session,
            CollectionPersister collection,
            String ownerKey) {
        if (!collection.hasCache()) {
            return;
        }
        Object ownerId =
                parse(
                        collection.getOwnerEntityPersister().getIdentifierMapping().getJavaType(),
                        ownerKey);
        var access = collection.getCacheAccessStrategy();
        guardedEvict(session, access, access.generateCacheKey(ownerId, collection, factory, null));
    }

    private static void evictNaturalId(
            SharedSessionContractImplementor session, EntityPersister persister, String key) {
        NaturalIdMapping mapping = persister.getNaturalIdMapping();
        if (mapping == null || mapping.getCacheAccess() == null) {
            return;
        }
        if (mapping.getNaturalIdAttributes().size() != 1) {
            throw new IllegalArgumentException(
                    "Only single-attribute natural ids can be evicted by key: "
                            + persister.getEntityName());
        }
        Object value = parse(mapping.getNaturalIdAttributes().get(0).getJavaType(), key);
        var access = mapping.getCacheAccess();
        guardedEvict(session, access, access.generateCacheKey(value, persister, session));
    }

    private static void evictEntityRegion(SessionFactoryImplementor factory, String entityName) {
        EntityPersister persister = factory.getMappingMetamodel().getEntityDescriptor(entityName);
        var cache = factory.getCache();
        cache.evictEntityData(entityName);
        cache.evictNaturalIdData(entityName);
        for (CollectionPersister collection : ownedCollections(factory, persister)) {
            cache.evictCollectionData(collection.getRole());
        }
    }

    private static List<CollectionPersister> ownedCollections(
            SessionFactoryImplementor factory, EntityPersister persister) {
        String rootName = persister.getRootEntityName();
        List<CollectionPersister> owned = new ArrayList<>();
        factory.getMappingMetamodel()
                .forEachCollectionDescriptor(
                        collection -> {
                            if (collection.hasCache()
                                    && collection
                                            .getOwnerEntityPersister()
                                            .getRootEntityName()
                                            .equals(rootName)) {
                                owned.add(collection);
                            }
                        });
        return owned;
    }

    private static void guardedEvict(
            SharedSessionContractImplementor session, CachedDomainDataAccess access, Object key) {
        if (access.getAccessType() == AccessType.READ_WRITE) {
            SoftLock lock = access.lockItem(session, key, null);
            access.unlockItem(session, key, lock);
        } else {
            access.evict(key);
        }
    }

    private static Object parse(JavaType<?> type, String key) {
        if (key == null) {
            throw new IllegalArgumentException("Keyed eviction without a key");
        }
        return type.fromString(key);
    }

    static String render(JavaType<?> type, Object value) {
        return renderUnchecked(type, value);
    }

    @SuppressWarnings("unchecked")
    private static <T> String renderUnchecked(JavaType<T> type, Object value) {
        return type.toString((T) value);
    }

    private SessionFactoryImplementor sessionFactory() {
        return entityManagerFactory.unwrap(SessionFactoryImplementor.class);
    }
}
