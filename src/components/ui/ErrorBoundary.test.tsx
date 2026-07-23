import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ErrorBoundary from "./ErrorBoundary";
import Loader from "./Loader";

function BrokenComponent(): never {
  throw new Error("render failed");
}

describe("UI failure states", () => {
  it("exposes an accessible loading status", () => {
    render(<Loader />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading");
  });

  it("contains unexpected render failures", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(
      <ErrorBoundary>
        <BrokenComponent />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("heading", { name: "This page could not be displayed" }))
      .toBeInTheDocument();
  });
});
