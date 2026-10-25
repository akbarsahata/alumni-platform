import { useEffect } from "react";
import { useNavigation } from "react-router";
import { useProgress } from "@bprogress/react";

/**
 * Shows the BProgress bar for client-side navigations and form submissions.
 */
export function NavigationProgress() {
  const navigation = useNavigation();
  const { start, stop } = useProgress();

  useEffect(() => {
    if (navigation.state === "idle") {
      stop();
      return;
    }
    start();
  }, [navigation.state, start, stop]);

  return null;
}
