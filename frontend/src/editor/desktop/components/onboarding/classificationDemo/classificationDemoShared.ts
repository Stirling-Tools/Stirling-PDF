/** One sweep run, shared by the session store that owns it and the view that renders it. */

export interface ClassificationDemoViewData {
  /** Maximum documents this sweep may process. */
  limit: number;
  /** New on every run asked for, so a follow-up batch re-runs even when `limit`
   *  happens to match the last one. */
  runToken: number;
}
