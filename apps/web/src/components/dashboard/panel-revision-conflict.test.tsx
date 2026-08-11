import { useState } from "react";
import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PanelRevisionConflictModal, usePanelRevision } from "./panel-revision-conflict";

function Harness({ onLoadLatest }: { onLoadLatest: () => void }) {
  const [draft, setDraft] = useState("Yerel düzenleme");
  const lock = usePanelRevision();
  return (
    <>
      <input aria-label="Taslak" value={draft} onChange={(event) => setDraft(event.target.value)} />
      <button
        onClick={() => lock.consumeResponse({
          code: "REVISION_CONFLICT",
          currentRevision: 4,
          updatedAt: "2026-08-11T00:00:00.000Z",
        })}
      >
        Çakışma üret
      </button>
      <PanelRevisionConflictModal
        conflict={lock.conflict}
        onKeepLocal={lock.keepLocalDraft}
        onLoadLatest={() => { onLoadLatest(); lock.clearConflict(); }}
      />
    </>
  );
}

function renderHarness(onLoadLatest = vi.fn()) {
  render(<MantineProvider><Harness onLoadLatest={onLoadLatest} /></MantineProvider>);
  return onLoadLatest;
}

describe("panel revision conflict UI", () => {
  it("409 sonrasında yerel formu korur", async () => {
    renderHarness();
    fireEvent.change(screen.getByLabelText("Taslak"), { target: { value: "Kaybolmamalı" } });
    fireEvent.click(screen.getByText("Çakışma üret"));
    expect(screen.getByDisplayValue("Kaybolmamalı")).toBeInTheDocument();
    fireEvent.click(await screen.findByText("Yerel taslağı koru"));
    expect(screen.getByDisplayValue("Kaybolmamalı")).toBeInTheDocument();
  });

  it("güncel veriyi yükleme kararını üst bileşene iletir", async () => {
    const onLoadLatest = renderHarness();
    fireEvent.click(screen.getByText("Çakışma üret"));
    fireEvent.click(await screen.findByText("Güncel veriyi yükle"));
    expect(onLoadLatest).toHaveBeenCalledOnce();
  });
});
