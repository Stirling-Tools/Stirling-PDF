/** Query flag asking Usage & Billing to open the Team checkout on arrival. */
export const TEAM_CHECKOUT_PARAM = "upgrade";
const TEAM_CHECKOUT_VALUE = "team";

export const TEAM_CHECKOUT_PATH = `/settings/billing?${TEAM_CHECKOUT_PARAM}=${TEAM_CHECKOUT_VALUE}`;

export function requestsTeamCheckout(params: URLSearchParams): boolean {
  return params.get(TEAM_CHECKOUT_PARAM) === TEAM_CHECKOUT_VALUE;
}
