import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { qk } from "@portal/queries/keys";
import {
  fetchStarredListings,
  fetchStoreListing,
  fetchStoreListings,
  fetchTeamStoreListings,
  publishPipeline,
  removeStoreListing,
  republishPipeline,
  setStoreStar,
  type StoreListPage,
  type StoreListParams,
  type StoreListingDetail,
  type StoreListingSummary,
  type StorePublishRequest,
} from "@portal/api/store";

/** Every store list page, whatever its filters: the prefix of qk.storeList(). */
const STORE_LIST_PREFIX = ["portal", "store", "list"] as const;

/** Cursor-paged browse. `fetchNextPage` drives the Load more button. */
export function useStoreList(params: StoreListParams) {
  return useInfiniteQuery({
    queryKey: qk.storeList(params),
    queryFn: ({ pageParam }) => fetchStoreListings(params, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
}

export function useStoreListing(storeId: string | undefined) {
  return useQuery({
    queryKey: qk.storeListing(storeId ?? ""),
    queryFn: () => fetchStoreListing(storeId as string),
    enabled: Boolean(storeId),
  });
}

export function useStarredListings(enabled = true) {
  return useQuery({
    queryKey: qk.storeStarred(),
    queryFn: fetchStarredListings,
    enabled,
  });
}

export function useTeamListings(enabled = true) {
  return useQuery({
    queryKey: qk.storeTeam(),
    queryFn: fetchTeamStoreListings,
    enabled,
  });
}

function patchSummary(
  item: StoreListingSummary,
  storeId: string,
  starred: boolean,
  starCount?: number,
): StoreListingSummary {
  if (item.storeId !== storeId) return item;
  const delta = starred === item.starred ? 0 : starred ? 1 : -1;
  return {
    ...item,
    starred,
    starCount: starCount ?? Math.max(0, item.starCount + delta),
  };
}

/**
 * Star or unstar a listing. Every cache that shows the star (browse pages, the starred tab, the
 * detail) is patched at once so the count moves under the cursor, then settled from the server's
 * reply; a failure rolls everything back to the snapshot.
 */
export function useStarListing() {
  const queryClient = useQueryClient();

  function apply(storeId: string, starred: boolean, starCount?: number) {
    queryClient.setQueriesData<InfiniteData<StoreListPage>>(
      { queryKey: STORE_LIST_PREFIX },
      (data) =>
        data && {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            items: page.items.map((item) =>
              patchSummary(item, storeId, starred, starCount),
            ),
          })),
        },
    );
    queryClient.setQueryData<StoreListingSummary[]>(
      qk.storeStarred(),
      (items) =>
        items?.map((item) => patchSummary(item, storeId, starred, starCount)),
    );
    queryClient.setQueryData<StoreListingDetail>(
      qk.storeListing(storeId),
      (detail) =>
        detail && {
          ...detail,
          ...patchSummary(detail, storeId, starred, starCount),
          viewer: detail.viewer
            ? { ...detail.viewer, starred }
            : { starred, isTeammate: false },
        },
    );
  }

  return useMutation({
    mutationFn: ({ storeId, starred }: { storeId: string; starred: boolean }) =>
      setStoreStar(storeId, starred),
    onMutate: async ({ storeId, starred }) => {
      await queryClient.cancelQueries({ queryKey: ["portal", "store"] });
      const snapshot = {
        lists: queryClient.getQueriesData<InfiniteData<StoreListPage>>({
          queryKey: STORE_LIST_PREFIX,
        }),
        starred: queryClient.getQueryData<StoreListingSummary[]>(
          qk.storeStarred(),
        ),
        detail: queryClient.getQueryData<StoreListingDetail>(
          qk.storeListing(storeId),
        ),
      };
      apply(storeId, starred);
      return snapshot;
    },
    onError: (_error, { storeId }, snapshot) => {
      if (!snapshot) return;
      for (const [key, data] of snapshot.lists) {
        queryClient.setQueryData(key, data);
      }
      queryClient.setQueryData(qk.storeStarred(), snapshot.starred);
      queryClient.setQueryData(qk.storeListing(storeId), snapshot.detail);
    },
    onSuccess: (result, { storeId }) => {
      apply(storeId, result.starred, result.starCount);
      // The starred tab's membership changed, so refetch it rather than guess.
      void queryClient.invalidateQueries({ queryKey: qk.storeStarred() });
    },
  });
}

/** Soft-remove one of the team's listings. Republish is how it comes back. */
export function useRemoveListing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (storeId: string) => removeStoreListing(storeId),
    onSuccess: (_result, storeId) => {
      void queryClient.invalidateQueries({ queryKey: qk.storeTeam() });
      void queryClient.invalidateQueries({ queryKey: STORE_LIST_PREFIX });
      void queryClient.invalidateQueries({
        queryKey: qk.storeListing(storeId),
      });
    },
  });
}

/**
 * Publish, or republish when the preflight found an existing listing. The backend stamps the
 * store id back onto the source pipeline, so the pipeline caches are refreshed too.
 */
export function usePublishPipeline() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      body,
      existingStoreId,
    }: {
      body: StorePublishRequest;
      existingStoreId: string | null;
    }) =>
      existingStoreId
        ? republishPipeline(existingStoreId, body)
        : publishPipeline(body),
    onSuccess: (listing) => {
      queryClient.setQueryData(qk.storeListing(listing.storeId), listing);
      void queryClient.invalidateQueries({ queryKey: qk.storeTeam() });
      void queryClient.invalidateQueries({ queryKey: STORE_LIST_PREFIX });
      void queryClient.invalidateQueries({ queryKey: qk.pipelines() });
      void queryClient.invalidateQueries({ queryKey: qk.policiesList() });
    },
  });
}
