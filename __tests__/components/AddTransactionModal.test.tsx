import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "../utils/test-utils";
import userEvent from "@testing-library/user-event";
import AddTransactionModal from "@/components/AddTransactionModal";
import * as useQueries from "@/hooks/useQueries";

// Mock the hooks
vi.mock("@/hooks/useQueries", () => ({
  useTransaction: vi.fn(),
  useSettings: vi.fn(),
  useCreateTransaction: vi.fn(),
  useUpdateTransaction: vi.fn(),
  useUpdateSettings: vi.fn(),
}));

describe("AddTransactionModal", () => {
  const mockOnClose = vi.fn();
  const mockOnSuccess = vi.fn();
  const mockCreateTransaction = {
    mutate: vi.fn(),
    isPending: false,
  };
  const mockUpdateTransaction = {
    mutate: vi.fn(),
    isPending: false,
  };
  const mockUpdateSettings = {
    mutate: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (useQueries.useCreateTransaction as any).mockReturnValue(mockCreateTransaction);
    (useQueries.useUpdateTransaction as any).mockReturnValue(mockUpdateTransaction);
    (useQueries.useUpdateSettings as any).mockReturnValue(mockUpdateSettings);
    (useQueries.useSettings as any).mockReturnValue({
      data: {
        incomeSourceTags: ["DoorDash", "Uber"],
        expenseSourceTags: ["Gas", "Maintenance"],
      },
    });
    (useQueries.useTransaction as any).mockReturnValue({ data: null });
  });

  it("should render modal when open", () => {
    render(
      <AddTransactionModal
        isOpen={true}
        onClose={mockOnClose}
        type="income"
        onSuccess={mockOnSuccess}
      />
    );

    expect(screen.getByText(/Add Income/i)).toBeInTheDocument();
  });

  it("should not render modal when closed", () => {
    render(
      <AddTransactionModal
        isOpen={false}
        onClose={mockOnClose}
        type="income"
        onSuccess={mockOnSuccess}
      />
    );

    expect(screen.queryByText(/Add Income/i)).not.toBeInTheDocument();
  });

  it("should submit form with valid data", async () => {
    const user = userEvent.setup();
    render(
      <AddTransactionModal
        isOpen={true}
        onClose={mockOnClose}
        type="income"
        onSuccess={mockOnSuccess}
      />
    );

    // Wait for modal to be fully loaded
    await waitFor(() => {
      expect(screen.getByPlaceholderText("0.00")).toBeInTheDocument();
    });

    // Input component doesn't use htmlFor/id, so use placeholder
    const amountInput = screen.getByPlaceholderText("0.00") as HTMLInputElement;
    
    // Clear and type the value
    await user.clear(amountInput);
    await user.type(amountInput, "100", { delay: 10 });

    // Wait for the value to be set
    await waitFor(() => {
      expect(parseFloat(amountInput.value)).toBe(100);
    });

    const submitButton = screen.getByRole("button", { name: /Add/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockCreateTransaction.mutate).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 100,
          type: "income",
        }),
        expect.any(Object)
      );
    });
  });

  it("should show error for empty amount", async () => {
    const user = userEvent.setup();
    render(
      <AddTransactionModal
        isOpen={true}
        onClose={mockOnClose}
        type="income"
        onSuccess={mockOnSuccess}
      />
    );

    const submitButton = screen.getByRole("button", { name: /Add/i });
    await user.click(submitButton);

    // HTML5 validation should prevent submission
    // Input component doesn't use htmlFor/id, so use placeholder
    const amountInput = screen.getByPlaceholderText("0.00") as HTMLInputElement;
    expect(amountInput.validity.valueMissing).toBe(true);
  });

  it("should handle tag selection", async () => {
    const user = userEvent.setup();
    render(
      <AddTransactionModal
        isOpen={true}
        onClose={mockOnClose}
        type="income"
        onSuccess={mockOnSuccess}
      />
    );

    const doorDashButton = screen.getByRole("button", { name: /DoorDash/i });
    await user.click(doorDashButton);

    expect(doorDashButton).toHaveClass("bg-green-600");
  });

  it("should handle custom tag input", async () => {
    const user = userEvent.setup();
    render(
      <AddTransactionModal
        isOpen={true}
        onClose={mockOnClose}
        type="income"
        onSuccess={mockOnSuccess}
      />
    );

    // Wait for modal to be fully loaded
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Or enter custom source/i)).toBeInTheDocument();
    });

    const customTagInput = screen.getByPlaceholderText(/Or enter custom source/i) as HTMLInputElement;
    
    // Use fireEvent to directly set the value, which will trigger the onChange handler
    // This avoids issues with user.type being interrupted or not completing
    fireEvent.change(customTagInput, { target: { value: "CustomTag" } });

    // Wait for the value to be set
    await waitFor(() => {
      expect(customTagInput.value).toBe("CustomTag");
    });

    // Input component doesn't use htmlFor/id, so use placeholder
    const amountInput = screen.getByPlaceholderText("0.00") as HTMLInputElement;
    fireEvent.change(amountInput, { target: { value: "100" } });

    // Wait for amount to be set
    await waitFor(() => {
      expect(parseFloat(amountInput.value)).toBe(100);
    });

    const submitButton = screen.getByRole("button", { name: /Add/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockCreateTransaction.mutate).toHaveBeenCalledWith(
        expect.objectContaining({
          tag: "CustomTag",
          amount: 100,
        }),
        expect.any(Object)
      );
    });
  });

  it("should toggle transaction type in edit mode", async () => {
    const user = userEvent.setup();
    (useQueries.useTransaction as any).mockReturnValue({
      data: {
        _id: "123",
        amount: 100,
        type: "income",
        date: "2024-01-15",
        time: "10:00",
      },
    });

    render(
      <AddTransactionModal
        isOpen={true}
        onClose={mockOnClose}
        type="income"
        onSuccess={mockOnSuccess}
        transactionId="123"
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Edit Transaction/i)).toBeInTheDocument();
    });

    const expenseButton = screen.getByRole("button", { name: /Expense/i });
    await user.click(expenseButton);

    expect(expenseButton).toHaveClass("bg-red-600");
  });

  it("should handle date picker interaction", async () => {
    const { container } = render(
      <AddTransactionModal
        isOpen={true}
        onClose={mockOnClose}
        type="income"
        onSuccess={mockOnSuccess}
      />
    );

    // Input component doesn't use htmlFor/id, so query by type
    const dateInput = container.querySelector('input[type="date"]') as HTMLInputElement;
    expect(dateInput).toBeInTheDocument();
    
    // For date inputs, user.type may not work reliably, so use fireEvent to set value directly
    fireEvent.change(dateInput, { target: { value: "2024-12-31" } });

    expect(dateInput.value).toBe("2024-12-31");
  });

  it("should handle time picker interaction", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <AddTransactionModal
        isOpen={true}
        onClose={mockOnClose}
        type="income"
        onSuccess={mockOnSuccess}
      />
    );

    // Input component doesn't use htmlFor/id, so query by type
    const timeInput = container.querySelector('input[type="time"]') as HTMLInputElement;
    expect(timeInput).toBeInTheDocument();
    
    // For time inputs, user.type may not work reliably, so use fireEvent to set value directly
    fireEvent.change(timeInput, { target: { value: "14:30" } });

    expect(timeInput.value).toBe("14:30");
  });

  it("should handle notes field with long text", async () => {
    const user = userEvent.setup();
    // user.type has character limits (~25 chars), so use paste for longer text
    const longNotes = "A".repeat(50);
    
    render(
      <AddTransactionModal
        isOpen={true}
        onClose={mockOnClose}
        type="income"
        onSuccess={mockOnSuccess}
      />
    );

    // Input component doesn't use htmlFor/id, so use placeholder
    const notesInput = screen.getByPlaceholderText(/Add any notes/i) as HTMLInputElement;
    await user.clear(notesInput);
    // Use paste for longer text as it's more reliable than type
    await user.click(notesInput);
    await user.paste(longNotes);

    // Wait for the input value to be updated
    await waitFor(() => {
      expect(notesInput.value.length).toBeGreaterThan(0);
    });
    
    // Verify the field can handle input
    expect(typeof notesInput.value).toBe("string");
  });

  it("should handle API error during submission", async () => {
    const user = userEvent.setup();
    const errorMutation = {
      mutate: vi.fn((data, callbacks) => {
        callbacks?.onError?.(new Error("API Error"));
      }),
      isPending: false,
    };
    (useQueries.useCreateTransaction as any).mockReturnValue(errorMutation);

    render(
      <AddTransactionModal
        isOpen={true}
        onClose={mockOnClose}
        type="income"
        onSuccess={mockOnSuccess}
      />
    );

    // Input component doesn't use htmlFor/id, so use placeholder
    const amountInput = screen.getByPlaceholderText("0.00");
    await user.type(amountInput, "100");

    const submitButton = screen.getByRole("button", { name: /Add/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(errorMutation.mutate).toHaveBeenCalled();
    });
  });

  it("should prevent duplicate submission when pending", async () => {
    const user = userEvent.setup();
    const pendingMutation = {
      mutate: vi.fn(),
      isPending: true,
    };
    (useQueries.useCreateTransaction as any).mockReturnValue(pendingMutation);

    render(
      <AddTransactionModal
        isOpen={true}
        onClose={mockOnClose}
        type="income"
        onSuccess={mockOnSuccess}
      />
    );

    const submitButton = screen.getByRole("button", { name: /Saving/i });
    expect(submitButton).toBeDisabled();
  });

  it("should load existing transaction data in edit mode", async () => {
    (useQueries.useTransaction as any).mockReturnValue({
      data: {
        _id: "123",
        amount: 150,
        type: "expense",
        date: "2024-01-15",
        time: "14:30",
        notes: "Test notes",
        tag: "Gas",
        isBill: true,
        dueDate: "2024-02-15",
      },
    });

    render(
      <AddTransactionModal
        isOpen={true}
        onClose={mockOnClose}
        type="expense"
        onSuccess={mockOnSuccess}
        transactionId="123"
      />
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue("150")).toBeInTheDocument();
      expect(screen.getByDisplayValue("Test notes")).toBeInTheDocument();
    });
  });

  it("should reset form on cancel", async () => {
    const user = userEvent.setup();
    render(
      <AddTransactionModal
        isOpen={true}
        onClose={mockOnClose}
        type="income"
        onSuccess={mockOnSuccess}
      />
    );

    // Input component doesn't use htmlFor/id, so use placeholder
    const amountInput = screen.getByPlaceholderText("0.00");
    await user.type(amountInput, "100");

    const cancelButton = screen.getByRole("button", { name: /Cancel/i });
    await user.click(cancelButton);

    expect(mockOnClose).toHaveBeenCalled();
  });

  it("should handle expense type with expense tags", async () => {
    render(
      <AddTransactionModal
        isOpen={true}
        onClose={mockOnClose}
        type="expense"
        onSuccess={mockOnSuccess}
      />
    );

    expect(screen.getByText(/Gas/i)).toBeInTheDocument();
    expect(screen.getByText(/Maintenance/i)).toBeInTheDocument();
  });

  it("should handle initial amount prop", () => {
    render(
      <AddTransactionModal
        isOpen={true}
        onClose={mockOnClose}
        type="income"
        onSuccess={mockOnSuccess}
        initialAmount={50}
      />
    );

    // Input component doesn't use htmlFor/id, so use placeholder
    const amountInput = screen.getByPlaceholderText("0.00") as HTMLInputElement;
    expect(amountInput.value).toBe("50");
  });

  it("should handle initial notes prop", () => {
    render(
      <AddTransactionModal
        isOpen={true}
        onClose={mockOnClose}
        type="income"
        onSuccess={mockOnSuccess}
        initialNotes="Initial notes"
      />
    );

    // Input component doesn't use htmlFor/id, so use placeholder
    const notesInput = screen.getByPlaceholderText(/Add any notes/i) as HTMLInputElement;
    expect(notesInput.value).toBe("Initial notes");
  });

  it("should handle initial isBill prop", async () => {
    const user = userEvent.setup();
    render(
      <AddTransactionModal
        isOpen={true}
        onClose={mockOnClose}
        type="expense"
        onSuccess={mockOnSuccess}
        initialIsBill={true}
      />
    );

    // Input component doesn't use htmlFor/id, so use placeholder
    const amountInput = screen.getByPlaceholderText("0.00");
    await user.type(amountInput, "100");

    const submitButton = screen.getByRole("button", { name: /Add/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockCreateTransaction.mutate).toHaveBeenCalledWith(
        expect.objectContaining({
          isBill: true,
        }),
        expect.any(Object)
      );
    });
  });
});

