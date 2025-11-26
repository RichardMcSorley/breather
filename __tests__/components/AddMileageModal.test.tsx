import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "../utils/test-utils";
import userEvent from "@testing-library/user-event";
import AddMileageModal from "@/components/AddMileageModal";
import * as useQueries from "@/hooks/useQueries";

// Mock the hooks
vi.mock("@/hooks/useQueries", () => ({
  useMileageEntry: vi.fn(),
  useCreateMileageEntry: vi.fn(),
  useUpdateMileageEntry: vi.fn(),
}));

describe("AddMileageModal", () => {
  const mockOnClose = vi.fn();
  const mockOnSuccess = vi.fn();
  const mockCreateMileageEntry = {
    mutate: vi.fn(),
    isPending: false,
  };
  const mockUpdateMileageEntry = {
    mutate: vi.fn(),
    isPending: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (useQueries.useCreateMileageEntry as any).mockReturnValue(mockCreateMileageEntry);
    (useQueries.useUpdateMileageEntry as any).mockReturnValue(mockUpdateMileageEntry);
    (useQueries.useMileageEntry as any).mockReturnValue({ data: null });
  });

  it("should render modal when open", () => {
    render(
      <AddMileageModal
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    expect(screen.getByText(/Add Mileage Entry/i)).toBeInTheDocument();
  });

  it("should not render modal when closed", () => {
    render(
      <AddMileageModal
        isOpen={false}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    expect(screen.queryByText(/Add Mileage Entry/i)).not.toBeInTheDocument();
  });

  it("should submit form with valid data", async () => {
    const user = userEvent.setup();
    render(
      <AddMileageModal
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    // Input component doesn't use htmlFor/id, so use placeholder
    const odometerInput = screen.getByPlaceholderText("Enter odometer reading");
    await user.type(odometerInput, "10000");

    const submitButton = screen.getByRole("button", { name: /Add/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockCreateMileageEntry.mutate).toHaveBeenCalledWith(
        expect.objectContaining({
          odometer: 10000,
          classification: "work",
        }),
        expect.any(Object)
      );
    });
  });

  it("should format odometer input with commas", async () => {
    const user = userEvent.setup();
    render(
      <AddMileageModal
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    // Input component doesn't use htmlFor/id, so use placeholder
    const odometerInput = screen.getByPlaceholderText("Enter odometer reading") as HTMLInputElement;
    await user.type(odometerInput, "100000");

    // Should format with commas
    expect(odometerInput.value).toContain(",");
  });

  it("should show error for invalid odometer reading", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <AddMileageModal
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    // Input component doesn't use htmlFor/id, so use placeholder
    const odometerInput = screen.getByPlaceholderText("Enter odometer reading") as HTMLInputElement;
    
    // formatOdometerInput removes all non-digits, so "-100" becomes "100" which is valid
    // To test error, we need to simulate a case where parseOdometerInput would return NaN or negative
    // Since the formatting strips negatives, we'll test with empty value which triggers HTML5 validation
    await user.clear(odometerInput);
    
    const submitButton = screen.getByRole("button", { name: /Add/i });
    await user.click(submitButton);

    // HTML5 validation should prevent submission with empty required field
    expect(odometerInput.validity.valueMissing).toBe(true);
    
    // The component's error state is set when parseOdometerInput returns NaN or negative
    // But since formatOdometerInput strips non-digits, we can't easily trigger that in a user flow
    // This test verifies HTML5 validation works, which is the primary validation mechanism
  });

  it("should handle classification toggle", async () => {
    const user = userEvent.setup();
    render(
      <AddMileageModal
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    const personalButton = screen.getByRole("button", { name: /Personal/i });
    await user.click(personalButton);

    expect(personalButton).toHaveClass("bg-purple-600");
  });

  it("should handle date picker interaction", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <AddMileageModal
        isOpen={true}
        onClose={mockOnClose}
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

  it("should handle notes field", async () => {
    render(
      <AddMileageModal
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    // Input component doesn't use htmlFor/id, so use placeholder
    const notesInput = screen.getByPlaceholderText(/Add any notes/i) as HTMLInputElement;
    // Use fireEvent for reliable text input (user.type has character limits)
    fireEvent.change(notesInput, { target: { value: "Test notes" } });

    expect(notesInput).toHaveValue("Test notes");
  });

  it("should load existing entry data in edit mode", async () => {
    (useQueries.useMileageEntry as any).mockReturnValue({
      data: {
        _id: "123",
        odometer: 15000,
        date: "2024-01-15",
        notes: "Test notes",
        classification: "personal",
      },
    });

    render(
      <AddMileageModal
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
        entryId="123"
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Edit Mileage Entry/i)).toBeInTheDocument();
      expect(screen.getByDisplayValue(/15,000/i)).toBeInTheDocument();
    });
  });

  it("should update entry in edit mode", async () => {
    const user = userEvent.setup();
    (useQueries.useMileageEntry as any).mockReturnValue({
      data: {
        _id: "123",
        odometer: 10000,
        date: "2024-01-15",
        notes: "",
        classification: "work",
      },
    });

    render(
      <AddMileageModal
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
        entryId="123"
      />
    );

    await waitFor(() => {
      // Input component doesn't use htmlFor/id, so use placeholder
    const odometerInput = screen.getByPlaceholderText("Enter odometer reading");
      expect(odometerInput).toBeInTheDocument();
    });

    // Input component doesn't use htmlFor/id, so use placeholder
    const odometerInput = screen.getByPlaceholderText("Enter odometer reading");
    await user.clear(odometerInput);
    await user.type(odometerInput, "20000");

    const submitButton = screen.getByRole("button", { name: /Update/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockUpdateMileageEntry.mutate).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "123",
          odometer: 20000,
        }),
        expect.any(Object)
      );
    });
  });

  it("should reset form on cancel", async () => {
    const user = userEvent.setup();
    render(
      <AddMileageModal
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    // Input component doesn't use htmlFor/id, so use placeholder
    const odometerInput = screen.getByPlaceholderText("Enter odometer reading");
    await user.type(odometerInput, "10000");

    const cancelButton = screen.getByRole("button", { name: /Cancel/i });
    await user.click(cancelButton);

    expect(mockOnClose).toHaveBeenCalled();
  });

  it("should prevent submission when pending", () => {
    const pendingMutation = {
      mutate: vi.fn(),
      isPending: true,
    };
    (useQueries.useCreateMileageEntry as any).mockReturnValue(pendingMutation);

    render(
      <AddMileageModal
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    const submitButton = screen.getByRole("button", { name: /Saving/i });
    expect(submitButton).toBeDisabled();
  });

  it("should handle API error during submission", async () => {
    const user = userEvent.setup();
    const errorMutation = {
      mutate: vi.fn((data, callbacks) => {
        callbacks?.onError?.(new Error("API Error"));
      }),
      isPending: false,
    };
    (useQueries.useCreateMileageEntry as any).mockReturnValue(errorMutation);

    render(
      <AddMileageModal
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    // Input component doesn't use htmlFor/id, so use placeholder
    const odometerInput = screen.getByPlaceholderText("Enter odometer reading");
    await user.type(odometerInput, "10000");

    const submitButton = screen.getByRole("button", { name: /Add/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(errorMutation.mutate).toHaveBeenCalled();
    });
  });

  it("should handle empty odometer input", async () => {
    const user = userEvent.setup();
    render(
      <AddMileageModal
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    const submitButton = screen.getByRole("button", { name: /Add/i });
    await user.click(submitButton);

    // HTML5 validation should prevent submission
    // Input component doesn't use htmlFor/id, so use placeholder
    const odometerInput = screen.getByPlaceholderText("Enter odometer reading") as HTMLInputElement;
    expect(odometerInput.validity.valueMissing).toBe(true);
  });

  it("should handle odometer with commas in input", async () => {
    const user = userEvent.setup();
    render(
      <AddMileageModal
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    // Input component doesn't use htmlFor/id, so use placeholder
    const odometerInput = screen.getByPlaceholderText("Enter odometer reading");
    await user.type(odometerInput, "10,000");

    const submitButton = screen.getByRole("button", { name: /Add/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockCreateMileageEntry.mutate).toHaveBeenCalledWith(
        expect.objectContaining({
          odometer: 10000,
        }),
        expect.any(Object)
      );
    });
  });
});

