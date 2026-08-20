import type { RecruitingEvent } from "@/types";

const BAY_AREA_LOCATION = /\b(?:berkeley|oakland|emeryville|alameda|san leandro|walnut creek|pleasanton|fremont|san francisco|south san francisco|san mateo|redwood city|menlo park|palo alto|stanford|mountain view|sunnyvale|santa clara|san jose|cupertino|milpitas|san rafael|marin)\b/i;
const AMBIGUOUS_BAY_CITY_WITH_CA = /\b(?:richmond|concord|dublin|hayward),?\s+(?:ca|california)\b/i;

export function isEventInLocationScope(event: Pick<RecruitingEvent, "format" | "location">) {
  return event.format === "virtual" || BAY_AREA_LOCATION.test(event.location) || AMBIGUOUS_BAY_CITY_WITH_CA.test(event.location);
}
