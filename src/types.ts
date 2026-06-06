export interface InvoiceItem {
  id: string;
  item: string; // e.g. "Horop", "Acrylic horop", "Box", or custom names
  rate: number;
  size_cm: number; // 0 for normal items
  qty: number;
  amount: number;
}

export interface InvoiceCalculations {
  payment: number;
  old_balance: number;
  new_balance: number;
  total_balance: number;
}

export interface Invoice {
  id: string;
  customer_name: string;
  date: string; // DD/MM/YY
  items: InvoiceItem[];
  calculations: InvoiceCalculations;
  savedAt: string; // ISO string timestamps
}

export interface CustomerFolder {
  id: string;
  name: string;
  baki_balance: number; // total outstanding balance (same as the total_balance of its latest invoice)
  total_received: number; // sum of payments in all invoices
  last_invoice_date: string;
  invoices: Invoice[];
}

export interface DatabaseState {
  folders: CustomerFolder[];
}
