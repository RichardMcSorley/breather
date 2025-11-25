export interface TransactionFormData {
  amount: number;
  type: "income" | "expense";
  date: string;
  time: string;
  isBill: boolean;
  notes?: string;
  tag?: string;
  dueDate?: string;
}

export interface BillFormData {
  name: string;
  amount: number;
  dueDate: number;
  category?: string;
  notes?: string;
  isActive: boolean;
}

export interface UserSettingsFormData {
  irsMileageDeduction: number;
}

export interface FinancialSummary {
  grossTotal: number;
  variableExpenses: number;
  freeCash: number;
  breathingRoom: number; // days
}


