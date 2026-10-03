import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { usePanelConfirm } from "./panel-confirm";

function Harness() {
  const { confirm, modal } = usePanelConfirm();
  return (
    <>
      <button
        type="button"
        onClick={() => {
          void confirm({
            title: "Turu sil",
            message: "Bu işlem geri alınamaz.",
            confirmLabel: "Sil",
          }).then((ok) => {
            if (ok) document.body.setAttribute("data-confirmed", "1");
          });
        }}
      >
        Silmeyi dene
      </button>
      {modal}
    </>
  );
}

describe("usePanelConfirm", () => {
  afterEach(() => {
    document.body.removeAttribute("data-confirmed");
  });
  it("Vazgeç sonrası işlemi çalıştırmaz", async () => {
    render(
      <MantineProvider>
        <Harness />
      </MantineProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Silmeyi dene" }));
    fireEvent.click(await screen.findByRole("button", { name: "Vazgeç" }));
    expect(document.body.getAttribute("data-confirmed")).toBeNull();
  });

  it("onay sonrası işlemi çalıştırır", async () => {
    render(
      <MantineProvider>
        <Harness />
      </MantineProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Silmeyi dene" }));
    fireEvent.click(await screen.findByRole("button", { name: "Sil" }));
    await waitFor(() => expect(document.body.getAttribute("data-confirmed")).toBe("1"));
  });
});
