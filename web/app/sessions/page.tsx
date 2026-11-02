import { Suspense } from "react";
import SessionList from "@/components/SessionList";

/** Sessions home: Continue cards + All sessions; Shared/Live/Project are
 *  ?filter= / ?project= views of the same list (LSW-09). */
export default function Page() {
  return (
    <Suspense>
      <SessionList home />
    </Suspense>
  );
}
