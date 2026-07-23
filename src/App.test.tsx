import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("application shell", () => {
  it("renders the lazy public landing route", async () => {
    window.history.replaceState({}, "", "/");
    render(<App />);
    expect(await screen.findByRole("heading", { name: "AI Sales Platform" }))
      .toBeInTheDocument();
  });
});
