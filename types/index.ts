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
  liquidCash: number;
  monthlyBurnRate: number;
  fixedExpenses: number;
  estimatedTaxRate: number;
}

export interface FinancialSummary {
  grossTotal: number;
  variableExpenses: number;
  taxShield: number;
  fixedExpenses: number;
  freeCash: number;
  breathingRoom: number; // days
}


