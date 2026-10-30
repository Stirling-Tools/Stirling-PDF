package stirling.software.proprietary.cache;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.WeakHashMap;
import java.util.stream.Collectors;

import org.hibernate.engine.spi.SessionFactoryImplementor;
import org.hibernate.engine.spi.SharedSessionContractImplementor;
import org.hibernate.engine.spi.TransactionCompletionCallbacks.AfterCompletionCallback;
import org.hibernate.event.spi.AbstractCollectionEvent;
import org.hibernate.event.spi.EventType;
import org.hibernate.event.spi.PostCollectionRecreateEvent;
import org.hibernate.event.spi.PostCollectionRecreateEventListener;
import org.hibernate.event.spi.PostCollectionRemoveEvent;
import org.hibernate.event.spi.PostCollectionRemoveEventListener;
import org.hibernate.event.spi.PostCollectionUpdateEvent;
import org.hibernate.event.spi.PostCollectionUpdateEventListener;
import org.hibernate.event.spi.PostDeleteEvent;
import org.hibernate.event.spi.PostDeleteEventListener;
import org.hibernate.event.spi.PostInsertEvent;
import org.hibernate.event.spi.PostInsertEventListener;
import org.hibernate.event.spi.PostUpdateEvent;
import org.hibernate.event.spi.PostUpdateEventListener;
import org.hibernate.metamodel.mapping.AttributeMapping;
import org.hibernate.metamodel.mapping.NaturalIdMapping;
import org.hibernate.persister.collection.CollectionPersister;
import org.hibernate.persister.entity.EntityPersister;
import org.hibernate.proxy.HibernateProxy;
import org.springframework.stereotype.Component;

import jakarta.annotation.PostConstruct;
import jakarta.persistence.EntityManagerFactory;

@Component
public class SecondLevelCacheEvictionListener
        implements PostInsertEventListener,
                PostUpdateEventListener,
                PostDeleteEventListener,
                PostCollectionRecreateEventListener,
                PostCollectionUpdateEventListener,
                PostCollectionRemoveEventListener {

    private record InverseCollection(CollectionPersister collection, int ownerStatePosition) {}

    private static final class Pending {
        private final Set<CacheEviction> peers = new LinkedHashSet<>();
        private final Set<CacheEviction> everywhere = new LinkedHashSet<>();
    }

    private final EntityManagerFactory entityManagerFactory;
    private final CacheEvictionBroadcaster broadcaster;
    private final Map<SharedSessionContractImplementor, Pending> pending =
            Collections.synchronizedMap(new WeakHashMap<>());
    private Map<String, List<InverseCollection>> inverseCollectionsByElement = Map.of();

    public SecondLevelCacheEvictionListener(
            EntityManagerFactory entityManagerFactory, CacheEvictionBroadcaster broadcaster) {
        this.entityManagerFactory = entityManagerFactory;
        this.broadcaster = broadcaster;
    }

    @PostConstruct
    void register() {
        SessionFactoryImplementor factory =
                entityManagerFactory.unwrap(SessionFactoryImplementor.class);
        inverseCollectionsByElement = indexInverseCollections(factory);
        var registry = factory.getEventListenerRegistry();
        registry.appendListeners(EventType.POST_INSERT, this);
        registry.appendListeners(EventType.POST_UPDATE, this);
        registry.appendListeners(EventType.POST_DELETE, this);
        registry.appendListeners(EventType.POST_COLLECTION_RECREATE, this);
        registry.appendListeners(EventType.POST_COLLECTION_UPDATE, this);
        registry.appendListeners(EventType.POST_COLLECTION_REMOVE, this);
    }

    private static Map<String, List<InverseCollection>> indexInverseCollections(
            SessionFactoryImplementor factory) {
        List<InverseCollection> found = new ArrayList<>();
        factory.getMappingMetamodel()
                .forEachCollectionDescriptor(
                        collection -> {
                            if (!collection.hasCache()
                                    || !collection.isInverse()
                                    || !collection.isOneToMany()
                                    || collection.getMappedByProperty() == null) {
                                return;
                            }
                            AttributeMapping backReference =
                                    collection
                                            .getElementPersister()
                                            .findAttributeMapping(collection.getMappedByProperty());
                            if (backReference != null) {
                                found.add(
                                        new InverseCollection(
                                                collection, backReference.getStateArrayPosition()));
                            }
                        });
        return found.stream()
                .collect(
                        Collectors.groupingBy(
                                inverse ->
                                        inverse.collection()
                                                .getElementPersister()
                                                .getEntityName()));
    }

    @Override
    public void onPostInsert(PostInsertEvent event) {
        queueInverseCollections(event.getSession(), event.getPersister(), event.getState());
    }

    @Override
    public void onPostUpdate(PostUpdateEvent event) {
        EntityPersister persister = event.getPersister();
        SharedSessionContractImplementor session = event.getSession();
        if (persister.canWriteToCache()) {
            Pending batch = pendingFor(session);
            batch.peers.add(entityEviction(persister, event.getId()));
            naturalIdEviction(persister, event.getOldState(), event.getState())
                    .ifPresent(batch.peers::add);
        }
        queueInverseCollections(session, persister, event.getOldState());
        queueInverseCollections(session, persister, event.getState());
    }

    @Override
    public void onPostDelete(PostDeleteEvent event) {
        EntityPersister persister = event.getPersister();
        SharedSessionContractImplementor session = event.getSession();
        if (persister.canWriteToCache()) {
            Pending batch = pendingFor(session);
            batch.peers.add(entityEviction(persister, event.getId()));
            naturalIdEviction(persister, event.getDeletedState(), null).ifPresent(batch.peers::add);
        }
        queueInverseCollections(session, persister, event.getDeletedState());
    }

    @Override
    public void onPostRecreateCollection(PostCollectionRecreateEvent event) {
        queueCollection(event);
    }

    @Override
    public void onPostUpdateCollection(PostCollectionUpdateEvent event) {
        queueCollection(event);
    }

    @Override
    public void onPostRemoveCollection(PostCollectionRemoveEvent event) {
        queueCollection(event);
    }

    private void queueCollection(AbstractCollectionEvent event) {
        CollectionPersister collection = event.getCollectionPersister();
        Object ownerId = event.getAffectedOwnerIdOrNull();
        if (collection == null || !collection.hasCache() || ownerId == null) {
            return;
        }
        pendingFor(event.getSession()).peers.add(collectionEviction(collection, ownerId));
    }

    private void queueInverseCollections(
            SharedSessionContractImplementor session, EntityPersister element, Object[] state) {
        if (state == null) {
            return;
        }
        for (InverseCollection inverse :
                inverseCollectionsByElement.getOrDefault(element.getEntityName(), List.of())) {
            Object owner = state[inverse.ownerStatePosition()];
            Object ownerId =
                    ownerId(inverse.collection().getOwnerEntityPersister(), owner, session);
            if (ownerId != null) {
                pendingFor(session)
                        .everywhere
                        .add(collectionEviction(inverse.collection(), ownerId));
            }
        }
    }

    private static Object ownerId(
            EntityPersister ownerPersister,
            Object owner,
            SharedSessionContractImplementor session) {
        if (owner == null) {
            return null;
        }
        if (owner instanceof HibernateProxy proxy) {
            return proxy.getHibernateLazyInitializer().getIdentifier();
        }
        return ownerPersister.getIdentifier(owner, session);
    }

    private static CacheEviction entityEviction(EntityPersister persister, Object id) {
        return CacheEviction.entity(
                persister.getEntityName(),
                SecondLevelCacheEvictor.render(persister.getIdentifierMapping().getJavaType(), id));
    }

    private static CacheEviction collectionEviction(
            CollectionPersister collection, Object ownerId) {
        return CacheEviction.collection(
                collection.getRole(),
                SecondLevelCacheEvictor.render(
                        collection.getOwnerEntityPersister().getIdentifierMapping().getJavaType(),
                        ownerId));
    }

    private static Optional<CacheEviction> naturalIdEviction(
            EntityPersister persister, Object[] oldState, Object[] newState) {
        NaturalIdMapping mapping = persister.getNaturalIdMapping();
        if (oldState == null
                || mapping == null
                || mapping.getCacheAccess() == null
                || mapping.getNaturalIdAttributes().size() != 1) {
            return Optional.empty();
        }
        Object before = mapping.extractNaturalIdFromEntityState(oldState);
        if (before == null
                || (newState != null
                        && Objects.equals(
                                before, mapping.extractNaturalIdFromEntityState(newState)))) {
            return Optional.empty();
        }
        return Optional.of(
                CacheEviction.naturalId(
                        persister.getEntityName(),
                        SecondLevelCacheEvictor.render(
                                mapping.getNaturalIdAttributes().get(0).getJavaType(), before)));
    }

    private Pending pendingFor(SharedSessionContractImplementor session) {
        synchronized (pending) {
            Pending existing = pending.get(session);
            if (existing != null) {
                return existing;
            }
            Pending created = new Pending();
            pending.put(session, created);
            session.getTransactionCompletionCallbacks()
                    .registerCallback((AfterCompletionCallback) this::afterCompletion);
            return created;
        }
    }

    private void afterCompletion(boolean success, SharedSessionContractImplementor session) {
        Pending batch = pending.remove(session);
        if (batch == null || !success) {
            return;
        }
        broadcaster.broadcastToPeers(batch.peers);
        broadcaster.broadcast(batch.everywhere);
    }
}
