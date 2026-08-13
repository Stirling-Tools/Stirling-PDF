import type { SuperSearchScope } from "@app/hooks/useSuperSearch";

export interface SuperSearchPrefixToken {
  scopeId: string;
  token: string;
}

export interface ParsedSuperSearchQuery {
  query: string;
  prefixTokens: SuperSearchPrefixToken[];
  prefixedScopeIds: string[];
}

function buildScopeLookup(scopes: readonly SuperSearchScope[]) {
  const lookup = new Map<string, string>();
  for (const scope of scopes) {
    lookup.set(scope.id.toLowerCase(), scope.id);
    for (const alias of scope.aliases ?? []) {
      lookup.set(alias.toLowerCase(), scope.id);
    }
  }
  return lookup;
}

/**
 * Parses leading `scope:` tokens into active scopes and returns the remaining
 * free-text query. Prefixes only count at the start so normal colon text in
 * the search term is left alone.
 */
export function parseSuperSearchQuery(
  rawQuery: string,
  scopes: readonly SuperSearchScope[],
): ParsedSuperSearchQuery {
  if (scopes.length === 0) {
    return {
      query: rawQuery.trim(),
      prefixTokens: [],
      prefixedScopeIds: [],
    };
  }

  const scopeLookup = buildScopeLookup(scopes);
  const prefixTokens: SuperSearchPrefixToken[] = [];
  let remainder = rawQuery.trimStart();

  while (remainder.length > 0) {
    const match = remainder.match(/^([^\s:]+):/);
    if (!match) break;

    const token = match[1];
    const scopeId = scopeLookup.get(token.toLowerCase());
    if (!scopeId) break;

    prefixTokens.push({ scopeId, token: `${token}:` });
    remainder = remainder.slice(match[0].length).trimStart();
  }

  return {
    query: remainder.trim(),
    prefixTokens,
    prefixedScopeIds: [...new Set(prefixTokens.map((token) => token.scopeId))],
  };
}

export function rebuildSuperSearchQuery(
  parsed: ParsedSuperSearchQuery,
  keepScopeIds: ReadonlySet<string>,
): string {
  return [
    ...parsed.prefixTokens
      .filter((token) => keepScopeIds.has(token.scopeId))
      .map((token) => token.token),
    parsed.query,
  ]
    .filter(Boolean)
    .join(" ");
}
