import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Tag from "@/components/ui/Tag";

describe("Tag", () => {
  it("should render label", () => {
    render(<Tag label="Test Tag" />);
    expect(screen.getByText("Test Tag")).toBeInTheDocument();
  });

  it("should apply default variant", () => {
    render(<Tag label="Default" />);
    const tag = screen.getByText("Default");
    expect(tag).toHaveClass("bg-gray-100");
  });

  it("should apply income variant", () => {
    render(<Tag label="Income" variant="income" />);
    const tag = screen.getByText("Income");
    expect(tag).toHaveClass("bg-green-100");
  });

  it("should apply expense variant", () => {
    render(<Tag label="Expense" variant="expense" />);
    const tag = screen.getByText("Expense");
    expect(tag).toHaveClass("bg-red-100");
  });

  it("should show remove button when showRemove is true", () => {
    render(<Tag label="Removable" showRemove={true} onRemove={vi.fn()} />);
    expect(screen.getByLabelText("Remove Removable")).toBeInTheDocument();
  });

  it("should not show remove button when showRemove is false", () => {
    render(<Tag label="Not Removable" showRemove={false} />);
    expect(screen.queryByLabelText(/Remove/)).not.toBeInTheDocument();
  });

  it("should call onRemove when remove button is clicked", async () => {
    const onRemove = vi.fn();
    const user = userEvent.setup();
    render(<Tag label="Removable" showRemove={true} onRemove={onRemove} />);

    const removeButton = screen.getByLabelText("Remove Removable");
    await user.click(removeButton);
    expect(onRemove).toHaveBeenCalledTimes(1);
  });
});

