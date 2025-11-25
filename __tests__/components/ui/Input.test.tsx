import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Input from "@/components/ui/Input";

describe("Input", () => {
  it("should render input", () => {
    render(<Input />);
    const input = screen.getByRole("textbox");
    expect(input).toBeInTheDocument();
  });

  it("should render label when provided", () => {
    render(<Input label="Test Label" />);
    expect(screen.getByText("Test Label")).toBeInTheDocument();
  });

  it("should display error message when provided", () => {
    render(<Input error="This is an error" />);
    expect(screen.getByText("This is an error")).toBeInTheDocument();
  });

  it("should apply error styling when error is present", () => {
    render(<Input error="Error" />);
    const input = screen.getByRole("textbox");
    expect(input).toHaveClass("border-red-500");
  });

  it("should handle user input", async () => {
    const user = userEvent.setup();
    render(<Input />);
    const input = screen.getByRole("textbox");

    await user.type(input, "test input");
    expect(input).toHaveValue("test input");
  });

  it("should support controlled input", () => {
    const handleChange = vi.fn();
    render(<Input value="controlled" onChange={handleChange} />);
    const input = screen.getByRole("textbox");
    expect(input).toHaveValue("controlled");
  });

  it("should pass through input props", () => {
    render(
      <Input
        type="email"
        placeholder="Enter email"
        required
        data-testid="email-input"
      />
    );
    const input = screen.getByTestId("email-input");
    expect(input).toHaveAttribute("type", "email");
    expect(input).toHaveAttribute("placeholder", "Enter email");
    expect(input).toBeRequired();
  });

  it("should support ref forwarding", () => {
    const ref = vi.fn();
    render(<Input ref={ref} />);
    expect(ref).toHaveBeenCalled();
  });
});

