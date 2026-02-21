import { useSession } from "next-auth/react";

import { useFlagMap } from "@calcom/features/flags/context/provider";
import { isKeyInObject } from "@calcom/lib/isKeyInObject";

import type { NavigationItemType } from "./NavigationItem";

export function useShouldDisplayNavigationItem(item: NavigationItemType) {
  const flags = useFlagMap();
  const { data: session } = useSession();
  if (isKeyInObject(item.name, flags)) return flags[item.name];
  if (item.onlyAdmin && session?.user?.role !== "ADMIN" && session?.user?.role !== "INACTIVE_ADMIN")
    return false;
  return true;
}
