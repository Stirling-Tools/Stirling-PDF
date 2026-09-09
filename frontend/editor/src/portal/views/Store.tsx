import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useDebouncedValue } from "@mantine/hooks";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import {
  Banner,
  Button,
  EmptyState,
  Input,
  SegmentedControl,
  Select,
  Skeleton,
  Tabs,
} from "@app/ui";
import { errorMessage } from "@portal/api/http";
import {
  STORE_CATEGORIES,
  type StoreListingSummary,
  type StoreSort,
} from "@portal/api/store";
import { StoreIcon } from "@portal/components/icons";
import { StoreCard } from "@portal/components/store/StoreCard";
import { PublishedTable } from "@portal/components/store/PublishedTable";
import { usePipelines } from "@portal/queries/pipelines";
import {
  useStarredListings,
  useStoreList,
  useTeamListings,
} from "@portal/queries/store";
import "@portal/views/Store.css";

type TabKey = "browse" | "starred" | "published";

const TABS: TabKey[] = ["browse", "starred", "published"];
const SORTS: StoreSort[] = ["stars", "newest", "installs"];

function isTab(value: string | null): value is TabKey {
  return TABS.includes(value as TabKey);
}

function isSort(value: string | null): value is StoreSort {
  return SORTS.includes(value as StoreSort);
}

/**
 * The public Pipeline store: browse (search, category, sort, cursor-paged grid), the viewer's
 * starred listings, and the team's own published listings. Filters live in the URL so a search
 * can be shared and survives a reload.
 */
export function Store() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();

  const tab: TabKey = isTab(searchParams.get("tab"))
    ? (searchParams.get("tab") as TabKey)
    : "browse";
  const sort: StoreSort = isSort(searchParams.get("sort"))
    ? (searchParams.get("sort") as StoreSort)
    : "stars";
  const category = searchParams.get("category") ?? "";
  const urlQuery = searchParams.get("q") ?? "";

  // The input is local so typing is instant; the URL (and the query) follow after the debounce.
  const [search, setSearch] = useState(urlQuery);
  const [debouncedSearch] = useDebouncedValue(search, 300);

  function patchParams(patch: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setSearchParams(next, { replace: true });
  }

  useEffect(() => {
    const trimmed = debouncedSearch.trim();
    setSearchParams(
      (prev) => {
        if ((prev.get("q") ?? "") === trimmed) return prev;
        const next = new URLSearchParams(prev);
        if (trimmed) next.set("q", trimmed);
        else next.delete("q");
        return next;
      },
      { replace: true },
    );
  }, [debouncedSearch, setSearchParams]);

  const listParams = useMemo(
    () => ({
      q: urlQuery || undefined,
      sort,
      category: category || undefined,
    }),
    [urlQuery, sort, category],
  );

  const list = useStoreList(listParams);
  const starred = useStarredListings(tab === "starred");
  const team = useTeamListings(tab === "published");
  const pipelines = usePipelines();

  const items: StoreListingSummary[] =
    list.data?.pages.flatMap((page) => page.items) ?? [];
  const total = list.data?.pages[0]?.total ?? items.length;
  const hasFilters = Boolean(urlQuery || category || sort !== "stars");

  const localPipelineByStoreId = useMemo(() => {
    const map = new Map<string, string>();
    for (const view of pipelines.data?.pipelines ?? []) {
      if (view.storeId) map.set(view.storeId, view.id);
    }
    return map;
  }, [pipelines.data]);

  function clearFilters() {
    setSearch("");
    patchParams({ q: null, category: null, sort: null });
  }

  const categoryOptions = [
    { value: "", label: t("portal.store.filters.category.all") },
    ...STORE_CATEGORIES.map((id) => ({
      value: id,
      label: t(`portal.store.filters.category.${id}`),
    })),
  ];

  function renderGrid(
    listings: StoreListingSummary[],
    loading: boolean,
    empty: { title: string; description: string; action?: boolean },
  ) {
    if (loading) {
      return (
        <div className="portal-store__grid" aria-hidden>
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} height="14rem" shape="rect" />
          ))}
        </div>
      );
    }
    if (listings.length === 0) {
      return (
        <EmptyState
          icon={<StoreIcon size={28} />}
          title={empty.title}
          description={empty.description}
          actions={
            empty.action ? (
              <Button variant="secondary" onClick={clearFilters}>
                {t("portal.store.filters.clear")}
              </Button>
            ) : undefined
          }
        />
      );
    }
    return (
      <div className="portal-store__grid">
        {listings.map((listing) => (
          <StoreCard key={listing.storeId} listing={listing} />
        ))}
      </div>
    );
  }

  return (
    <div className="portal-store">
      <header className="portal-store__head">
        <div>
          <h1 className="portal-store__title">{t("portal.store.title")}</h1>
          <p className="portal-store__sub">{t("portal.store.subtitle")}</p>
        </div>
      </header>

      <Tabs<TabKey>
        variant="pill"
        ariaLabel={t("portal.store.title")}
        activeKey={tab}
        onChange={(key) => patchParams({ tab: key === "browse" ? null : key })}
        items={[
          { key: "browse", label: t("portal.store.tabs.browse") },
          { key: "starred", label: t("portal.store.tabs.starred") },
          { key: "published", label: t("portal.store.tabs.published") },
        ]}
      />

      {tab === "browse" && (
        <section className="portal-store__browse">
          <div className="portal-store__toolbar">
            <Input
              className="portal-store__search"
              value={search}
              placeholder={t("portal.store.filters.search")}
              aria-label={t("portal.store.filters.search")}
              leadingIcon={
                <SearchRoundedIcon style={{ fontSize: "1.125rem" }} />
              }
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="portal-store__toolbar-right">
              <Select
                aria-label={t("portal.store.filters.categoryLabel")}
                options={categoryOptions}
                value={category}
                onChange={(value) => patchParams({ category: value || null })}
                inputSize="sm"
              />
              <SegmentedControl<StoreSort>
                size="sm"
                ariaLabel={t("portal.store.filters.sortLabel")}
                value={sort}
                onChange={(value) =>
                  patchParams({ sort: value === "stars" ? null : value })
                }
                options={SORTS.map((value) => ({
                  value,
                  label: t(`portal.store.filters.sort.${value}`),
                }))}
              />
            </div>
          </div>

          {list.isError && (
            <Banner
              tone="danger"
              title={t("portal.store.loadError")}
              description={errorMessage(list.error)}
            />
          )}

          {!list.isPending && !list.isError && (
            <p className="portal-store__count">
              {t("portal.store.results", { count: total })}
            </p>
          )}

          {renderGrid(items, list.isPending, {
            title: t("portal.store.empty.title"),
            description: t("portal.store.empty.description"),
            action: hasFilters,
          })}

          {list.hasNextPage && (
            <div className="portal-store__more">
              <Button
                variant="secondary"
                loading={list.isFetchingNextPage}
                onClick={() => void list.fetchNextPage()}
              >
                {t("portal.store.loadMore")}
              </Button>
            </div>
          )}
        </section>
      )}

      {tab === "starred" && (
        <section className="portal-store__browse">
          {starred.isError && (
            <Banner
              tone="danger"
              title={t("portal.store.loadError")}
              description={errorMessage(starred.error)}
            />
          )}
          {renderGrid(starred.data ?? [], starred.isPending, {
            title: t("portal.store.empty.starredTitle"),
            description: t("portal.store.empty.starredDescription"),
          })}
        </section>
      )}

      {tab === "published" && (
        <section className="portal-store__published">
          <Banner
            tone="info"
            description={t("portal.store.published.banner")}
          />
          {team.isError && (
            <Banner
              tone="danger"
              title={t("portal.store.published.loadError")}
              description={errorMessage(team.error)}
            />
          )}
          {team.isPending && (
            <div className="portal-store__table-skeleton" aria-hidden>
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} height="3rem" />
              ))}
            </div>
          )}
          {team.data && team.data.length === 0 && (
            <EmptyState
              icon={<StoreIcon size={28} />}
              title={t("portal.store.empty.publishedTitle")}
              description={t("portal.store.empty.publishedDescription")}
            />
          )}
          {team.data && team.data.length > 0 && (
            <PublishedTable
              rows={team.data}
              localPipelineByStoreId={localPipelineByStoreId}
            />
          )}
        </section>
      )}
    </div>
  );
}
