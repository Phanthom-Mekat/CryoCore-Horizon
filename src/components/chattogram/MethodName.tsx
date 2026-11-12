"use client";

import type { CaseDetail } from "@/lib/chattogram/case-api";
import { useT } from "@/lib/i18n/useT";
import { BackendText } from "./BackendText";

/** The case's method as "name v1.2.3": the name translated when messages.ts knows it, the version as published. */
export function MethodName({ method }: { method: CaseDetail["method"] }) {
  const f = useT().finding;
  if (!method) return f.methodNone;
  return (
    <>
      <BackendText text={method.name} translated={f.methodNames[method.name]} />{" "}
      <span lang="en" translate="no">
        v{method.version}
      </span>
    </>
  );
}
