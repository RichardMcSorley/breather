"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

interface PrivacyModeContextType {
  isPrivacyModeEnabled: boolean;
  togglePrivacyMode: () => void;
}

const PrivacyModeContext = createContext<PrivacyModeContextType | undefined>(undefined);

export function PrivacyModeProvider({ children }: { children: ReactNode }) {
  const [isPrivacyModeEnabled, setIsPrivacyModeEnabled] = useState(false);

  // Load privacy mode state from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("privacyMode");
    if (saved === "true") {
      setIsPrivacyModeEnabled(true);
    }
  }, []);

  // Save privacy mode state to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem("privacyMode", isPrivacyModeEnabled.toString());
  }, [isPrivacyModeEnabled]);

  const togglePrivacyMode = () => {
    setIsPrivacyModeEnabled((prev) => !prev);
  };

  return (
    <PrivacyModeContext.Provider value={{ isPrivacyModeEnabled, togglePrivacyMode }}>
      {children}
    </PrivacyModeContext.Provider>
  );
}

export function usePrivacyMode() {
  const context = useContext(PrivacyModeContext);
  if (context === undefined) {
    throw new Error("usePrivacyMode must be used within a PrivacyModeProvider");
  }
  return context;
}

