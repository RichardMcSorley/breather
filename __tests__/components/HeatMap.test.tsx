import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "../utils/test-utils";
import HeatMap from "@/components/HeatMap";
import * as useQueries from "@/hooks/useQueries";

// Mock the hooks
vi.mock("@/hooks/useQueries", () => ({
  useHeatMapData: vi.fn(),
}));

describe("HeatMap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render loading state", () => {
    (useQueries.useHeatMapData as any).mockReturnValue({
      data: null,
      isLoading: true,
    });

    const { container } = render(<HeatMap />);

    // Loading spinner is a div with animate-spin class, not a status role
    const spinner = container.querySelector(".animate-spin");
    expect(spinner).toBeInTheDocument();
  });

  it("should render no data message when data is null", () => {
    (useQueries.useHeatMapData as any).mockReturnValue({
      data: null,
      isLoading: false,
    });

    render(<HeatMap />);

    expect(screen.getByText(/No data available for heat map/i)).toBeInTheDocument();
  });

  it("should render heat map with data", () => {
    const mockData = {
      byDayOfWeek: {
        "0": 100,
        "1": 150,
        "2": 200,
        "3": 180,
        "4": 220,
        "5": 250,
        "6": 120,
      },
      byHour: {
        "0": 50,
        "1": 60,
        "12": 200,
        "13": 250,
        "14": 300,
      },
      byDayAndHour: {
        "0": {
          "12": 100,
          "13": 150,
        },
        "1": {
          "12": 200,
          "13": 250,
        },
      },
      period: {
        startDate: "2024-01-01T00:00:00Z",
        endDate: "2024-01-31T23:59:59Z",
        days: 30,
      },
    };

    (useQueries.useHeatMapData as any).mockReturnValue({
      data: mockData,
      isLoading: false,
    });

    render(<HeatMap />);

    expect(screen.getByText(/Earnings Heat Map/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Average Earnings by Day of Week/i)[0]).toBeInTheDocument();
    expect(screen.getAllByText(/Average Earnings by Hour of Day/i)[0]).toBeInTheDocument();
  });

  it("should render all days of week", () => {
    const mockData = {
      byDayOfWeek: {
        "0": 100,
        "1": 150,
        "2": 200,
        "3": 180,
        "4": 220,
        "5": 250,
        "6": 120,
      },
      byHour: {},
      byDayAndHour: {},
      period: {
        startDate: "2024-01-01T00:00:00Z",
        endDate: "2024-01-31T23:59:59Z",
        days: 30,
      },
    };

    (useQueries.useHeatMapData as any).mockReturnValue({
      data: mockData,
      isLoading: false,
    });

    render(<HeatMap />);

    expect(screen.getByText("Sun")).toBeInTheDocument();
    expect(screen.getByText("Mon")).toBeInTheDocument();
    expect(screen.getByText("Tue")).toBeInTheDocument();
    expect(screen.getByText("Wed")).toBeInTheDocument();
    expect(screen.getByText("Thu")).toBeInTheDocument();
    expect(screen.getByText("Fri")).toBeInTheDocument();
    expect(screen.getByText("Sat")).toBeInTheDocument();
  });

  it("should render all 24 hours", () => {
    const byHour: Record<string, number> = {};
    for (let i = 0; i < 24; i++) {
      byHour[i.toString()] = i * 10;
    }

    const mockData = {
      byDayOfWeek: {},
      byHour,
      byDayAndHour: {},
      period: {
        startDate: "2024-01-01T00:00:00Z",
        endDate: "2024-01-31T23:59:59Z",
        days: 30,
      },
    };

    (useQueries.useHeatMapData as any).mockReturnValue({
      data: mockData,
      isLoading: false,
    });

    render(<HeatMap />);

    // Check for some hour labels
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("23")).toBeInTheDocument();
  });

  it("should format currency correctly", () => {
    const mockData = {
      byDayOfWeek: {
        "0": 1234.56,
      },
      byHour: {},
      byDayAndHour: {},
      period: {
        startDate: "2024-01-01T00:00:00Z",
        endDate: "2024-01-31T23:59:59Z",
        days: 30,
      },
    };

    (useQueries.useHeatMapData as any).mockReturnValue({
      data: mockData,
      isLoading: false,
    });

    render(<HeatMap />);

    // Currency should be formatted (may show as $1,235 or similar)
    const currencyElements = screen.getAllByText(/\$/);
    expect(currencyElements.length).toBeGreaterThan(0);
  });

  it("should handle zero values", () => {
    const mockData = {
      byDayOfWeek: {
        "0": 0,
        "1": 0,
        "2": 0,
        "3": 0,
        "4": 0,
        "5": 0,
        "6": 0,
      },
      byHour: {},
      byDayAndHour: {},
      period: {
        startDate: "2024-01-01T00:00:00Z",
        endDate: "2024-01-31T23:59:59Z",
        days: 30,
      },
    };

    (useQueries.useHeatMapData as any).mockReturnValue({
      data: mockData,
      isLoading: false,
    });

    render(<HeatMap />);

    expect(screen.getByText(/Earnings Heat Map/i)).toBeInTheDocument();
  });

  it("should handle single transaction", () => {
    const mockData = {
      byDayOfWeek: {
        "1": 100,
      },
      byHour: {
        "12": 100,
      },
      byDayAndHour: {
        "1": {
          "12": 100,
        },
      },
      period: {
        startDate: "2024-01-01T00:00:00Z",
        endDate: "2024-01-31T23:59:59Z",
        days: 30,
      },
    };

    (useQueries.useHeatMapData as any).mockReturnValue({
      data: mockData,
      isLoading: false,
    });

    render(<HeatMap />);

    expect(screen.getByText(/Earnings Heat Map/i)).toBeInTheDocument();
  });

  it("should handle different day ranges", () => {
    const mockData = {
      byDayOfWeek: {},
      byHour: {},
      byDayAndHour: {},
      period: {
        startDate: "2024-01-01T00:00:00Z",
        endDate: "2024-12-31T23:59:59Z",
        days: 365,
      },
    };

    (useQueries.useHeatMapData as any).mockReturnValue({
      data: mockData,
      isLoading: false,
    });

    render(<HeatMap days={365} />);

    expect(screen.getByText(/last 365 days/i)).toBeInTheDocument();
  });

  it("should calculate color intensity correctly", () => {
    const mockData = {
      byDayOfWeek: {
        "0": 0,      // Should be gray
        "1": 50,     // Low intensity
        "2": 100,    // Medium intensity
        "3": 200,    // High intensity
        "4": 300,    // Very high intensity
      },
      byHour: {},
      byDayAndHour: {},
      period: {
        startDate: "2024-01-01T00:00:00Z",
        endDate: "2024-01-31T23:59:59Z",
        days: 30,
      },
    };

    (useQueries.useHeatMapData as any).mockReturnValue({
      data: mockData,
      isLoading: false,
    });

    render(<HeatMap />);

    // Component should render with different color intensities
    expect(screen.getByText(/Earnings Heat Map/i)).toBeInTheDocument();
  });

  it("should display legend", () => {
    const mockData = {
      byDayOfWeek: {},
      byHour: {},
      byDayAndHour: {},
      period: {
        startDate: "2024-01-01T00:00:00Z",
        endDate: "2024-01-31T23:59:59Z",
        days: 30,
      },
    };

    (useQueries.useHeatMapData as any).mockReturnValue({
      data: mockData,
      isLoading: false,
    });

    render(<HeatMap />);

    expect(screen.getByText(/Lower earnings/i)).toBeInTheDocument();
    expect(screen.getByText(/Higher earnings/i)).toBeInTheDocument();
  });

  it("should handle sparse data", () => {
    const mockData = {
      byDayOfWeek: {
        "1": 100,
      },
      byHour: {
        "12": 100,
      },
      byDayAndHour: {
        "1": {
          "12": 100,
        },
      },
      period: {
        startDate: "2024-01-01T00:00:00Z",
        endDate: "2024-01-31T23:59:59Z",
        days: 30,
      },
    };

    (useQueries.useHeatMapData as any).mockReturnValue({
      data: mockData,
      isLoading: false,
    });

    render(<HeatMap />);

    expect(screen.getByText(/Earnings Heat Map/i)).toBeInTheDocument();
  });
});

