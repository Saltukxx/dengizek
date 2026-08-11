import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const captureExceptionMock = vi.hoisted(() => vi.fn());

vi.mock("@sentry/nextjs", () => ({
  captureException: (...args: unknown[]) => captureExceptionMock(...args),
}));

import GlobalError from "./global-error";

const originalDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

afterEach(() => {
  captureExceptionMock.mockReset();
  if (originalDsn === undefined) delete process.env.NEXT_PUBLIC_SENTRY_DSN;
  else process.env.NEXT_PUBLIC_SENTRY_DSN = originalDsn;
});

describe("GlobalError", () => {
  it("tarayıcı DSN'i varken kontrollü React hatasını Sentry'ye iletir", async () => {
    process.env.NEXT_PUBLIC_SENTRY_DSN = "https://public@example.ingest.sentry.io/1";
    const error = new Error("kontrollü tarayıcı hatası");
    render(<GlobalError error={error} reset={vi.fn()} />);
    await waitFor(() => expect(captureExceptionMock).toHaveBeenCalledWith(error));
  });

  it("DSN yokken istemci yakalaması yapmaz", async () => {
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;
    render(<GlobalError error={new Error("hata")} reset={vi.fn()} />);
    await waitFor(() => expect(captureExceptionMock).not.toHaveBeenCalled());
  });
});
