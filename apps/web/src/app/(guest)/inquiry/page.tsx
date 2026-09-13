import { Suspense } from "react";
import { InquiryForm } from "./inquiry-form";

export function InquiryPage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            padding: "clamp(32px, 5vw, 64px) clamp(24px, 5vw, 48px)",
            color: "var(--er-text-muted)",
            fontFamily: "var(--er-font-sans)",
          }}
        >
          Form yükleniyor…
        </div>
      }
    >
      <InquiryForm />
    </Suspense>
  );
}

export default InquiryPage;
