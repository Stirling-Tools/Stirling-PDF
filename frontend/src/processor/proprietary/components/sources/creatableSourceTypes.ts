import {
  CREATABLE_SOURCE_TYPES,
  type CreatableSourceType,
} from "@portal/components/sources/sourceTypes";

/**
 * The source types the connect wizard offers. An extension point: deployments
 * where a type cannot work shadow this module and filter the list (e.g. hosted
 * deployments never read the server's filesystem, so folder sources are not
 * offered there).
 */
export function creatableSourceTypes(): CreatableSourceType[] {
  return CREATABLE_SOURCE_TYPES;
}
