import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Sparkles, 
  Plus, 
  Trash2, 
  Search, 
  Send, 
  Download, 
  ArrowLeft, 
  Brain, 
  AlertCircle, 
  DollarSign, 
  TrendingUp, 
  FolderPlus, 
  ListFilter,
  CheckCircle,
  Clock,
  HelpCircle,
  FileText,
  Printer
} from "lucide-react";
import { CustomerFolder, Invoice, InvoiceItem } from "./types";
import { drawInvoiceReceipt, exportInvoiceToPDF } from "./canvasHelper";

// Helper to convert dataURL to Blobs for stable Chrome/Safari downloads particularly on mobile/local environments
const dataURLtoBlob = (dataurl: string): Blob => {
  try {
    const parts = dataurl.split(",");
    const mimeMatch = parts[0].match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : "image/jpeg";
    const bstr = atob(parts[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  } catch (err) {
    console.error("Failed to convert dataURL to blob", err);
    throw err;
  }
};

export default function App() {
  // State
  const [folders, setFolders] = useState<CustomerFolder[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<CustomerFolder | null>(null);
  const [activeInvoice, setActiveInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // States for reliable visual download assistance and previews
  const [downloadPreviewUrl, setDownloadPreviewUrl] = useState<string | null>(null);
  const [downloadFileType, setDownloadFileType] = useState<"jpg" | "pdf">("jpg");

  // App UI Navigation
  const [view, setView] = useState<"folders" | "invoice">("folders");

  // Search & Filtering
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [sortBy, setSortBy] = useState<"name" | "balance-desc" | "balance-asc">("balance-desc");
  const [showSortDropdown, setShowSortDropdown] = useState<boolean>(false);

  // Raw interactive payment input string (with auto minus)
  const [paymentStr, setPaymentStr] = useState<string>("");

  // Modals / AI Input state
  const [showAddFolderModal, setShowAddFolderModal] = useState<boolean>(false);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText: string;
    isDanger: boolean;
    onConfirm: () => void | Promise<void>;
  } | null>(null);

  const requestConfirm = (
    title: string,
    message: string,
    onConfirm: () => void | Promise<void>,
    isDanger: boolean = false,
    confirmText: string = "Confirm"
  ) => {
    setConfirmModal({
      isOpen: true,
      title,
      message,
      confirmText,
      isDanger,
      onConfirm
    });
  };

  const [newFolderName, setNewFolderName] = useState<string>("");
  const [newFolderOldBalance, setNewFolderOldBalance] = useState<number>(0);
  
  const [aiInputText, setAiInputText] = useState<string>("");
  const [parsingAi, setParsingAi] = useState<boolean>(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // Success Notification banner
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Retrieve folders on initial load
  useEffect(() => {
    fetchFolders();
  }, []);

  const fetchFolders = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/folders");
      if (!res.ok) {
        throw new Error("Could not retrieve business folders");
      }
      const data = await res.json();
      setFolders(data);
    } catch (err: any) {
      console.warn("Backend unavailable, using localStorage fallback", err);
      // LocalStorage Fallback
      const cached = localStorage.getItem("nora_folders");
      if (cached) {
        setFolders(JSON.parse(cached));
      } else {
        setError("Unable to connect to the Riyadh server directory.");
      }
    } finally {
      setLoading(false);
    }
  };

  // Sync to localstorage for double durability
  const syncWithCache = (updatedFolders: CustomerFolder[]) => {
    setFolders(updatedFolders);
    localStorage.setItem("nora_folders", JSON.stringify(updatedFolders));
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  // Sync the raw payment input string with activeInvoice values
  useEffect(() => {
    if (activeInvoice) {
      const payVal = activeInvoice.calculations.payment;
      const currentInputVal = parseFloat(paymentStr.replace(/[^\d.-]/g, "")) || 0;
      if (Math.abs(currentInputVal) !== Math.abs(payVal) || paymentStr === "") {
        if (payVal === 0) {
          setPaymentStr("");
        } else {
          setPaymentStr(`-${payVal}`);
        }
      }
    } else {
      setPaymentStr("");
    }
  }, [activeInvoice?.id, activeInvoice?.calculations.payment]);

  // Directory Statistics
  const totalBakiBalance = folders.reduce((sum, f) => sum + f.baki_balance, 0);
  const totalReceivedBalance = folders.reduce((sum, f) => sum + f.total_received, 0);

  // Add Folder logic
  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;

    const folderId = `cust-${Date.now()}`;
    const today = new Date();
    const formattedDate = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getFullYear()).slice(-2)}`;

    // Create a first boilerplate empty invoice if initial balance is set
    const emptyInvoice: Invoice = {
      id: `inv-${Date.now()}`,
      customer_name: newFolderName.trim(),
      date: formattedDate,
      items: [
        { id: `row-${Date.now()}-1`, item: "Box", rate: 0, size_cm: 0, qty: 1, amount: 0 }
      ],
      calculations: {
        payment: 0,
        old_balance: newFolderOldBalance,
        new_balance: 0,
        total_balance: newFolderOldBalance
      },
      savedAt: new Date().toISOString()
    };

    const newFolder: CustomerFolder = {
      id: folderId,
      name: newFolderName.trim(),
      baki_balance: newFolderOldBalance,
      total_received: 0,
      last_invoice_date: formattedDate,
      invoices: [emptyInvoice]
    };

    try {
      // POST to backend JSON database
      const res = await fetch("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newFolder)
      });
      
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Cannot create client");
      }
      
      const savedFolder = await res.json();
      const updated = [...folders, savedFolder];
      syncWithCache(updated);
      showToast(`Folder "${newFolderName}" ready successfully!`);
    } catch (err: any) {
      console.warn("Backend offline or error: ", err.message);
      // Fallback local
      const exists = folders.some(f => f.name.toLowerCase() === newFolderName.toLowerCase());
      if (exists) {
        showToast("Error: Client folder name already exists.");
        return;
      }
      const updated = [...folders, newFolder];
      syncWithCache(updated);
      showToast(`Folder "${newFolderName}" saved locally.`);
    }

    // Reset Form
    setNewFolderName("");
    setNewFolderOldBalance(0);
    setShowAddFolderModal(false);
  };

  // Delete folder logic
  const handleDeleteFolder = (id: string, name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    requestConfirm(
      "Delete Folder",
      `Are you sure you want to delete the folder for "${name}"? All transaction logs and billing history will be permanently cleared.`,
      async () => {
        try {
          const res = await fetch(`/api/folders/${id}`, { method: "DELETE" });
          if (res.ok) {
            const updated = folders.filter(f => f.id !== id);
            syncWithCache(updated);
            showToast(`Folder "${name}" deleted successfully.`);
          } else {
            throw new Error("Deletion rejected by directory");
          }
        } catch (err: any) {
          // Local fallback
          const updated = folders.filter(f => f.id !== id);
          syncWithCache(updated);
          showToast(`Folder "${name}" deleted.`);
        }
      },
      true,
      "Delete permanently"
    );
  };

  // Quick clear balance directly from customer folder list
  const handleQuickClearBalance = (folderId: string, name: string, currentBalance: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (currentBalance <= 0) {
      showToast(`"${name}" has no outstanding balance.`);
      return;
    }

    requestConfirm(
      "Clear Baki Balance",
      `Are you sure you want to clear the entire outstanding balance of ${currentBalance} sr for "${name}"? This will save an official settlement transaction log.`,
      async () => {
        // Find custom folder
        const targetFolder = folders.find(f => f.id === folderId);
        if (!targetFolder) return;

        const today = new Date();
        const formattedDate = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getFullYear()).slice(-2)}`;

        // Create a transaction invoice indicating full payment
        const settlementInvoice: Invoice = {
          id: `inv-settle-${Date.now()}`,
          customer_name: name,
          date: formattedDate,
          items: [
            { id: `row-settle-${Date.now()}`, item: "Prior Outstanding Settled", rate: 0, size_cm: 0, qty: 1, amount: 0 }
          ],
          calculations: {
            payment: currentBalance,
            old_balance: currentBalance,
            new_balance: 0,
            total_balance: 0
          },
          savedAt: new Date().toISOString()
        };

        let updatedInvoices = [...(targetFolder.invoices || [])];
        updatedInvoices.push(settlementInvoice);

        const accumPayments = updatedInvoices.reduce((acc, inv) => acc + (inv.calculations.payment || 0), 0);

        const updatedFolder: CustomerFolder = {
          ...targetFolder,
          baki_balance: 0,
          total_received: accumPayments,
          last_invoice_date: formattedDate,
          invoices: updatedInvoices
        };

        try {
          const res = await fetch("/api/folders/update-balance", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              folderId: folderId,
              baki_balance: 0,
              total_received: updatedFolder.total_received,
              last_invoice_date: updatedFolder.last_invoice_date,
              invoices: updatedFolder.invoices
            })
          });

          if (!res.ok) {
            throw new Error("Server transmission failed");
          }

          const verifiedFolder = await res.json();
          const nextFolders = folders.map(f => f.id === folderId ? verifiedFolder : f);
          syncWithCache(nextFolders);
          if (selectedFolder && selectedFolder.id === folderId) {
            setSelectedFolder(verifiedFolder);
            const today = new Date();
            const formattedDate = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getFullYear()).slice(-2)}`;
            const freshCleanInvoice: Invoice = {
              id: `inv-${Date.now()}`,
              customer_name: name,
              date: formattedDate,
              items: [
                { id: `row-default-1`, item: "Acrylic horop", rate: 0, size_cm: 0, qty: 1, amount: 0 }
              ],
              calculations: {
                payment: 0,
                old_balance: 0,
                new_balance: 0,
                total_balance: 0
              },
              savedAt: new Date().toISOString()
            };
            setActiveInvoice(freshCleanInvoice);
          }
          showToast(`Outstanding balance for "${name}" has been cleared.`);
        } catch (err: any) {
          console.warn("Saving settlement offline fallback: ", err.message);
          // fallback local
          const nextFolders = folders.map(f => f.id === folderId ? updatedFolder : f);
          syncWithCache(nextFolders);
          if (selectedFolder && selectedFolder.id === folderId) {
            setSelectedFolder(updatedFolder);
            const today = new Date();
            const formattedDate = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getFullYear()).slice(-2)}`;
            const freshCleanInvoice: Invoice = {
              id: `inv-${Date.now()}`,
              customer_name: name,
              date: formattedDate,
              items: [
                { id: `row-default-1`, item: "Acrylic horop", rate: 0, size_cm: 0, qty: 1, amount: 0 }
              ],
              calculations: {
                payment: 0,
                old_balance: 0,
                new_balance: 0,
                total_balance: 0
              },
              savedAt: new Date().toISOString()
            };
            setActiveInvoice(freshCleanInvoice);
          }
          showToast(`Settled "${name}" balance locally.`);
        }
      },
      false,
      "Clear Balance"
    );
  };

  // View Folder details and edit invoice
  const handleOpenFolder = (folder: CustomerFolder) => {
    setSelectedFolder(folder);
    
    // Check if the outstanding balance is 0. If so, always load a fresh dry invoice with 0 old balance
    if (folder.baki_balance === 0) {
      const today = new Date();
      const formattedDate = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getFullYear()).slice(-2)}`;
      
      const defaultInv: Invoice = {
        id: `inv-${Date.now()}`,
        customer_name: folder.name,
        date: formattedDate,
        items: [
          { id: "row-default-1", item: "Acrylic horop", rate: 0, size_cm: 0, qty: 1, amount: 0 }
        ],
        calculations: {
          payment: 0,
          old_balance: 0,
          new_balance: 0,
          total_balance: 0
        },
        savedAt: new Date().toISOString()
      };
      setActiveInvoice(defaultInv);
    } else if (folder.invoices && folder.invoices.length > 0) {
      // Load latest active invoice
      const latest = folder.invoices[folder.invoices.length - 1];
      setActiveInvoice(JSON.parse(JSON.stringify(latest))); // Deep copy
    } else {
      // Default blank mockup with 0 rate
      const today = new Date();
      const formattedDate = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getFullYear()).slice(-2)}`;
      
      const defaultInv: Invoice = {
        id: `inv-${Date.now()}`,
        customer_name: folder.name,
        date: formattedDate,
        items: [
          { id: "row-default-1", item: "Acrylic horop", rate: 0, size_cm: 0, qty: 1, amount: 0 }
        ],
        calculations: {
          payment: 0,
          old_balance: folder.baki_balance,
          new_balance: 0,
          total_balance: folder.baki_balance
        },
        savedAt: new Date().toISOString()
      };
      setActiveInvoice(defaultInv);
    }
    setView("invoice");
  };

  // Start fresh blank billing invoice for folder
  const handleNewInvoice = (folder: CustomerFolder) => {
    const today = new Date();
    const formattedDate = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getFullYear()).slice(-2)}`;
    
    const newInv: Invoice = {
      id: `inv-${Date.now()}`,
      customer_name: folder.name,
      date: formattedDate,
      items: [
        { id: `row-${Date.now()}-1`, item: "Acrylic horop", rate: 0, size_cm: 0, qty: 1, amount: 0 }
      ],
      calculations: {
        payment: 0,
        old_balance: folder.baki_balance,
        new_balance: 0,
        total_balance: folder.baki_balance
      },
      savedAt: new Date().toISOString()
    };
    
    setActiveInvoice(newInv);
    showToast("Started a new blank invoice sheet for this client!");
  };

  // Delete specific invoice from client ledger
  const handleDeleteInvoice = (invoiceId: string) => {
    if (!selectedFolder) return;
    requestConfirm(
      "Delete Invoice",
      `Are you sure you want to permanently delete this billing invoice/settlement from the folder? This will recalculate the client's current balance.`,
      async () => {
        const nextInvoices = (selectedFolder.invoices || []).filter(inv => inv.id !== invoiceId);
        
        let newBaki = 0;
        if (nextInvoices.length > 0) {
          newBaki = nextInvoices[nextInvoices.length - 1].calculations.total_balance;
        } else {
          newBaki = 0;
        }
        
        const accumPayments = nextInvoices.reduce((acc, inv) => acc + (inv.calculations.payment || 0), 0);
        
        const updatedFolder: CustomerFolder = {
          ...selectedFolder,
          baki_balance: newBaki,
          total_received: accumPayments,
          invoices: nextInvoices
        };
        
        try {
          const res = await fetch("/api/folders/update-balance", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              folderId: selectedFolder.id,
              baki_balance: updatedFolder.baki_balance,
              total_received: updatedFolder.total_received,
              last_invoice_date: updatedFolder.last_invoice_date || "",
              invoices: updatedFolder.invoices
            })
          });
          
          if (!res.ok) throw new Error("Database failed");
          
          const verifiedFolder = await res.json();
          const nextFolders = folders.map(f => f.id === selectedFolder.id ? verifiedFolder : f);
          syncWithCache(nextFolders);
          setSelectedFolder(verifiedFolder);
          
          if (verifiedFolder.invoices && verifiedFolder.invoices.length > 0) {
            setActiveInvoice(JSON.parse(JSON.stringify(verifiedFolder.invoices[verifiedFolder.invoices.length - 1])));
          } else {
            setView("folders");
          }
          showToast("Invoice deleted and outstanding balance recalculated.");
        } catch (err: any) {
          console.warn("Delete invoice local fallback: ", err.message);
          const nextFolders = folders.map(f => f.id === selectedFolder.id ? updatedFolder : f);
          syncWithCache(nextFolders);
          setSelectedFolder(updatedFolder);
          
          if (updatedFolder.invoices && updatedFolder.invoices.length > 0) {
            setActiveInvoice(JSON.parse(JSON.stringify(updatedFolder.invoices[updatedFolder.invoices.length - 1])));
          } else {
            setView("folders");
          }
          showToast("Invoice deleted locally.");
        }
      },
      true,
      "Delete Invoice"
    );
  };

  // AI Parser Trigger
  const handleParseOrderText = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiInputText.trim()) return;

    setParsingAi(true);
    setAiError(null);

    try {
      const res = await fetch("/api/parse-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputText: aiInputText })
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || "Internal parsing rejection.");
      }

      const parsedResult = await res.json();
      
      // Determine if folder fits a current customer or if we create a new one!
      const matchedFolderName = parsedResult.customer_name || "New Client";
      let targetFolder = folders.find(f => f.name.toLowerCase() === matchedFolderName.toLowerCase());

      if (!targetFolder) {
        // Automatically make a new folder dynamically
        const newFolderId = `cust-${Date.now()}`;
        const todayStr = parsedResult.date || "05/06/26";
        
        const newFold: CustomerFolder = {
          id: newFolderId,
          name: matchedFolderName,
          baki_balance: parsedResult.calculations.total_balance,
          total_received: parsedResult.calculations.payment,
          last_invoice_date: todayStr,
          invoices: []
        };
        
        targetFolder = newFold;
        // Post new fold
        await fetch("/api/folders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newFold)
        });

        // Add to active folders state
        setFolders(prev => [...prev, newFold]);
      }

      // Prepare active invoice structure from AI
      const aiItemsWithIds = parsedResult.items.map((it: any, index: number) => ({
        ...it,
        id: `row-ai-${Date.now()}-${index}`
      }));

      const finalInvoice: Invoice = {
        id: `inv-ai-${Date.now()}`,
        customer_name: matchedFolderName,
        date: parsedResult.date || "05/06/26",
        items: aiItemsWithIds,
        calculations: {
          payment: parsedResult.calculations.payment || 0,
          old_balance: parsedResult.calculations.old_balance || targetFolder.baki_balance,
          new_balance: parsedResult.calculations.new_balance,
          total_balance: parsedResult.calculations.total_balance
        },
        savedAt: new Date().toISOString()
      };

      // Set states and navigate
      setSelectedFolder(targetFolder);
      setActiveInvoice(finalInvoice);
      setAiInputText("");
      setView("invoice");
      showToast(`AI successfully parsed the chat layout for ${matchedFolderName}!`);
    } catch (err: any) {
      console.error(err);
      setAiError(err.message || "Failed to parse. Please check if your GEMINI_API_KEY is configured in Settings > Secrets.");
    } finally {
      setParsingAi(false);
    }
  };

  // Calculations loop inside the client UI
  const calculateLiveValues = (invoice: Invoice): Invoice => {
    let new_balance = 0;
    
    const updatedItems = invoice.items.map(row => {
      const isHorop = row.item.toLowerCase().includes("horop");
      let amount = 0;
      const rate = Number(row.rate) || 0;
      const size_cm = Number(row.size_cm) || 0;
      const qty = Number(row.qty) || 0;

      if (isHorop) {
        // Rule 1: Amount = Rate * Size_cm * Qty
        amount = rate * (size_cm > 0 ? size_cm : 1) * qty;
      } else {
        // Rule 2: Ordinary amount = Rate * Qty
        amount = rate * qty;
      }
      new_balance += amount;
      return { ...row, rate, size_cm, qty, amount };
    });

    const payment = Math.abs(Number(invoice.calculations.payment) || 0);
    const old_balance = Number(invoice.calculations.old_balance) || 0;
    // Rule 4: Total = New + Old - Payment
    const total_balance = new_balance + old_balance - payment;

    return {
      ...invoice,
      items: updatedItems,
      calculations: {
        payment,
        old_balance,
        new_balance,
        total_balance
      }
    };
  };

  // Handlers for modifying the active invoice cells
  const handleItemCellChange = (itemId: string, field: keyof InvoiceItem, value: any) => {
    if (!activeInvoice) return;

    const modifiedItems = activeInvoice.items.map(row => {
      if (row.id === itemId) {
        const typedVal = typeof row[field] === "number" ? (parseFloat(value) || 0) : value;
        return { ...row, [field]: typedVal };
      }
      return row;
    });

    const nextInvoice = {
      ...activeInvoice,
      items: modifiedItems
    };

    setActiveInvoice(calculateLiveValues(nextInvoice));
  };

  // Preset rows loader
  const handlePresetRowAdd = (presetName: string) => {
    if (!activeInvoice) return;

    let defaultRate = 0;
    let defaultSize = 0;

    if (presetName.toLowerCase().includes("horop")) {
      defaultRate = 100;
      defaultSize = 2.5;
    } else if (presetName === "Box") {
      defaultRate = 20;
    } else {
      defaultRate = 10;
    }

    const newRow: InvoiceItem = {
      id: `row-${Date.now()}-${Math.random().toString(36).slice(2,5)}`,
      item: presetName,
      rate: defaultRate,
      size_cm: defaultSize,
      qty: 1,
      amount: defaultRate * (defaultSize > 0 ? defaultSize : 1)
    };

    const nextInvoice = {
      ...activeInvoice,
      items: [...activeInvoice.items, newRow]
    };

    setActiveInvoice(calculateLiveValues(nextInvoice));
  };

  // Custom empty row add
  const handleAddCustomRow = () => {
    if (!activeInvoice) return;
    const newRow: InvoiceItem = {
      id: `row-${Date.now()}-${Math.random().toString(36).slice(2,5)}`,
      item: "New Item",
      rate: 0,
      size_cm: 0,
      qty: 1,
      amount: 0
    };
    setActiveInvoice({
      ...activeInvoice,
      items: [...activeInvoice.items, newRow]
    });
  };

  // Row removal
  const handleRemoveRow = (itemId: string) => {
    if (!activeInvoice) return;
    const filtered = activeInvoice.items.filter(row => row.id !== itemId);
    const nextInvoice = { ...activeInvoice, items: filtered };
    setActiveInvoice(calculateLiveValues(nextInvoice));
  };

  // Handle payments / old_balance inputs in the bottom summary card
  const handleSummaryChange = (field: "payment" | "old_balance", val: number) => {
    if (!activeInvoice) return;

    const nextInvoice = {
      ...activeInvoice,
      calculations: {
        ...activeInvoice.calculations,
        [field]: val
      }
    };

    setActiveInvoice(calculateLiveValues(nextInvoice));
  };

  // Save State back to API Server & client-side database
  const handleSaveInvoice = async () => {
    if (!selectedFolder || !activeInvoice) return;

    // Filter out rows that are empty or have invalid values
    const cleanItems = activeInvoice.items.filter(it => it.item.trim() !== "");
    if (cleanItems.length === 0) {
      showToast("Error: Please add at least one item transaction before saving.");
      return;
    }

    const updatedInvoice: Invoice = {
      ...activeInvoice,
      items: cleanItems,
      savedAt: new Date().toISOString()
    };

    // Calculate overall received payment across history
    // Find customer and replace/update history
    const targetFolder = folders.find(f => f.id === selectedFolder.id);
    if (!targetFolder) return;

    // Generate new invoice lists
    let matchingAndUpdatedInvolist = [...(targetFolder.invoices || [])];
    const matchIdx = matchingAndUpdatedInvolist.findIndex(inv => inv.id === activeInvoice.id);
    if (matchIdx !== -1) {
      matchingAndUpdatedInvolist[matchIdx] = updatedInvoice;
    } else {
      matchingAndUpdatedInvolist.push(updatedInvoice);
    }

    const accumPayments = matchingAndUpdatedInvolist.reduce((acc, inv) => acc + (inv.calculations.payment || 0), 0);

    const updatedFolder: CustomerFolder = {
      ...targetFolder,
      baki_balance: updatedInvoice.calculations.total_balance,
      total_received: accumPayments,
      last_invoice_date: updatedInvoice.date,
      invoices: matchingAndUpdatedInvolist
    };

    try {
      const res = await fetch("/api/folders/update-balance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          folderId: selectedFolder.id,
          baki_balance: updatedFolder.baki_balance,
          total_received: updatedFolder.total_received,
          last_invoice_date: updatedFolder.last_invoice_date,
          invoices: updatedFolder.invoices
        })
      });

      if (!res.ok) {
        throw new Error("Local cache saved, but server DB transmission failed");
      }

      const verifiedFolder = await res.json();
      const nextFolders = folders.map(f => f.id === selectedFolder.id ? verifiedFolder : f);
      syncWithCache(nextFolders);
      setSelectedFolder(verifiedFolder);
      showToast(`Invoice calculations saved securely inside Saudi Arabia DB!`);
    } catch (err: any) {
      console.warn("Saving offline: ", err.message);
      // fallback local
      const nextFolders = folders.map(f => f.id === selectedFolder.id ? updatedFolder : f);
      syncWithCache(nextFolders);
      setSelectedFolder(updatedFolder);
      showToast(`Database synced to local cache offline.`);
    }
  };

  // Send Whatsapp Receipt with Invoice Photo
  const handleSendWhatsApp = async () => {
    if (!activeInvoice) return;
    
    // Construct beautifully aligned English notification breakdown
    const customer = activeInvoice.customer_name;
    const date = activeInvoice.date;
    const itemsText = activeInvoice.items.map(it => {
      const isHorop = it.item.toLowerCase().includes("horop");
      return `• ${it.item} - Rate: ${it.rate}sr ${isHorop ? `Size: ${it.size_cm}cm` : ""} x ${it.qty} = ${it.amount}sr`;
    }).join("\n");

    const message = `Nora Invoice Riyadh 📜\n` +
      `---------------------------------------------\n` +
      `Customer: *${customer}*\n` +
      `Date: *${date}*\n\n` +
      `*Item Details:*\n${itemsText}\n\n` +
      `---------------------------------------------\n` +
      `Today's Bill: *${activeInvoice.calculations.new_balance} sr*\n` +
      `Payment Received: *-${activeInvoice.calculations.payment} sr*\n` +
      `Old Stable Balance: *${activeInvoice.calculations.old_balance} sr*\n` +
      `---------------------------------------------\n` +
      `🔴 *Total Outstanding Balance (Baki): ${activeInvoice.calculations.total_balance} sr*\n\n` +
      `Thank you / Shokran. Riyadh, Saudi Arabia.`;

    const filename = `NoraInvoice_${customer.replace(/\s+/g, "_")}_${date.replace(/\//g, "-")}.jpg`;
    let dataUrl = "";
    try {
      dataUrl = drawInvoiceReceipt(activeInvoice, activeInvoice.calculations.total_balance);
    } catch (err) {
      console.error("Error drawing receipt photo:", err);
    }

    let sharedSuccessfully = false;

    // 1. Try modern Web Share API (perfect for mobile browsers to share actual files with WhatsApp)
    if (dataUrl && typeof navigator !== "undefined" && navigator.canShare && navigator.share) {
      try {
        const arr = dataUrl.split(',');
        const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) {
          u8arr[n] = bstr.charCodeAt(n);
        }
        const file = new File([u8arr], filename, { type: mime });

        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            text: message,
            title: `Nora Invoice - ${customer}`
          });
          sharedSuccessfully = true;
          showToast("বিলের ফটো এবং হিসাব ওয়াটসঅ্যাপে শেয়ার করা হয়েছে!");
        }
      } catch (shareErr) {
        console.warn("Native file sharing was canceled or failed:", shareErr);
      }
    }

    // 2. Fallback: Download JPG automatically + copy text to clipboard + open WhatsApp
    if (!sharedSuccessfully) {
      try {
        if (dataUrl) {
          const link = document.createElement("a");
          link.href = dataUrl;
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }

        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(message);
          showToast("বিলের ফটো ডাউনলোড হয়েছে এবং হিসাব কপি করা হয়েছে!");
        } else {
          showToast("বিলের ফটো ডাউনলোড হয়েছে!");
        }

        // Delay slightly for direct open
        setTimeout(() => {
          const encoded = encodeURIComponent(message);
          window.open(`https://wa.me/?text=${encoded}`, "_blank");
        }, 850);
      } catch (fallbackErr) {
        console.error("Fallback route failed:", fallbackErr);
        const encoded = encodeURIComponent(message);
        window.open(`https://wa.me/?text=${encoded}`, "_blank");
      }
    }
  };

  // Download high-resolution JPG
  const handleDownloadJPG = () => {
    if (!activeInvoice) return;
    try {
      const dataUrl = drawInvoiceReceipt(activeInvoice, activeInvoice.calculations.total_balance);
      
      // Open the visual support preview modal
      setDownloadPreviewUrl(dataUrl);
      setDownloadFileType("jpg");

      // Try file-saver download via Blob (maximizes compatibility across modern web layouts)
      try {
        const blob = dataURLtoBlob(dataUrl);
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = blobUrl;
        link.download = `NoraInvoice_${activeInvoice.customer_name.replace(/\s+/g, "_")}_${activeInvoice.date.replace(/\//g, "-")}.jpg`;
        document.body.appendChild(link);
        link.click();
        setTimeout(() => {
          document.body.removeChild(link);
          URL.revokeObjectURL(blobUrl);
        }, 300);
        showToast("রসিদের ছবি তৈরি হয়েছে এবং ডাউনলোড শুরু হয়েছে!");
      } catch (e) {
        console.warn("Direct blob download failed, showing visual fallback", e);
        showToast("রসিদের ছবি প্রিভিউতে প্রস্তুত আছে! অনুগ্রহ করে চেপে ধরে সেভ করুন।");
      }
    } catch (err) {
      console.error(err);
      showToast("Error: Failed to render invoice snapshot card.");
    }
  };

  // Download high-fidelity PDF 
  const handleDownloadPDF = () => {
    if (!activeInvoice) return;
    try {
      const imgDataUrl = drawInvoiceReceipt(activeInvoice, activeInvoice.calculations.total_balance);
      
      // Show support modal so mobile/webview users have an alternative save/share method
      setDownloadPreviewUrl(imgDataUrl);
      setDownloadFileType("pdf");

      // Trigger standard PDF generator download
      exportInvoiceToPDF(activeInvoice, activeInvoice.calculations.total_balance);
      showToast("PDF ফাইল প্রস্তুত করা হয়েছে!");
    } catch (err) {
      console.error(err);
      showToast("Error: Failed to render official PDF Invoice.");
    }
  };

  // Trigger standard browser print dialog specifically styled to print the invoice ledger
  const handlePrintInvoice = () => {
    if (!activeInvoice) return;
    window.print();
  };

  // Folder Sorting & Filtering logic
  const filteredFolders = folders.filter(folder => 
    folder.name.toLowerCase().includes(searchQuery.toLowerCase())
  ).sort((a, b) => {
    if (sortBy === "name") {
      return a.name.localeCompare(b.name);
    } else if (sortBy === "balance-desc") {
      return b.baki_balance - a.baki_balance;
    } else if (sortBy === "balance-asc") {
      return a.baki_balance - b.baki_balance;
    }
    return 0;
  });

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans selection:bg-rose-500 selection:text-white pb-12">
      
      {/* Toast notifications */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div 
            initial={{ opacity: 0, y: -40, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="fixed top-6 left-12 right-12 md:left-auto md:right-6 md:w-96 z-[999] bg-emerald-600 text-white font-medium p-4 rounded-xl shadow-2xl flex items-center gap-3 border border-emerald-400"
          >
            <CheckCircle className="w-5 h-5 flex-shrink-0 animate-bounce" />
            <div className="text-sm">{toastMessage}</div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Saudi Header Layout */}
      <header className="bg-blue-800 text-white shadow-xl relative overflow-hidden border-b border-blue-700">
        <div className="absolute right-0 top-0 w-64 h-32 bg-gradient-to-l from-green-500/20 to-transparent blur-2xl pointer-events-none" />
        <div className="max-w-6xl mx-auto px-4 py-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="relative w-14 h-14 flex items-center justify-center bg-gradient-to-br from-slate-900 via-blue-950 to-slate-950 rounded-2xl border-2 border-emerald-500/40 hover:border-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.25)] transition-all duration-300 group overflow-hidden">
              {/* Subtle background decorative pulse grid */}
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(52,211,153,0.15)_0,transparent_100%)] pointer-events-none" />
              {/* Outer soft glowing neon ring */}
              <div className="absolute -inset-1 bg-gradient-to-r from-emerald-500 to-blue-500 rounded-2xl blur opacity-25 group-hover:opacity-50 transition duration-500 pointer-events-none" />
              
              {/* Calligraphic letter "ن" (Noon) with polished shadow and gold glowing center */}
              <span className="relative font-bold text-3xl text-emerald-400 filter drop-shadow-[0_2px_8px_rgba(52,211,153,0.7)] group-hover:scale-115 transition-transform duration-300 select-none block leading-none">ن</span>
              
              {/* Elegant golden active indicator dot matching the Calligraphy theme */}
              <span className="absolute top-2 right-2 w-1.5 h-1.5 bg-yellow-400 rounded-full shadow-[0_0_8px_#facc15]" />
            </div>
            <div>
              <h1 className="font-display font-bold text-2xl tracking-tight text-white leading-none">Nora Invoice Pro</h1>
              <p className="text-xs text-blue-200 font-mono mt-1">Riyadh • Saudi Arabia</p>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono">
            <div className="flex items-center gap-1.5 px-3 py-1 bg-white/10 rounded-full border border-white/20">
              <span className="w-2 h-2 bg-emerald-400 rounded-full animate-ping" />
              <span>Riyadh Time: 2026-06-05</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 mt-8">
        
        {view === "folders" && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-8"
          >
            {/* Folder stats cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-slate-800/80 backdrop-blur border border-slate-700/60 p-6 rounded-2xl flex items-center justify-between shadow-md">
                <div className="space-y-2">
                  <span className="text-xs text-slate-400 font-medium tracking-wide uppercase block">Total remaining baki balance</span>
                  <div className="text-3xl font-mono text-rose-500 font-bold">{totalBakiBalance.toLocaleString()} <span className="text-lg">sr</span></div>
                  <span className="text-[11px] font-mono text-slate-500 block">Outstanding debt across Riyadh registry</span>
                </div>
                <div className="p-4 bg-rose-500/10 text-rose-400 rounded-xl">
                  <TrendingUp className="w-8 h-8" />
                </div>
              </div>

              <div className="bg-slate-800/80 backdrop-blur border border-slate-700/60 p-6 rounded-2xl flex items-center justify-between shadow-md">
                <div className="space-y-2">
                  <span className="text-xs text-slate-400 font-medium tracking-wide uppercase block">Total balance received</span>
                  <div className="text-3xl font-mono text-emerald-400 font-bold">{totalReceivedBalance.toLocaleString()} <span className="text-lg">sr</span></div>
                  <span className="text-[11px] font-mono text-slate-500 block">Total paid received up to date</span>
                </div>
                <div className="p-4 bg-emerald-500/10 text-emerald-400 rounded-xl">
                  <DollarSign className="w-8 h-8" />
                </div>
              </div>
            </div>

            {/* AI Parsing Core Console */}
            <div className="bg-gradient-to-br from-indigo-950 to-slate-900 border border-indigo-500/40 p-6 rounded-2xl shadow-xl space-y-4">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-indigo-500/20 text-indigo-400 rounded-lg">
                  <Brain className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <h3 className="font-display font-semibold text-white text-base">Gemini Instant Order Parser (English / Arabic)</h3>
                  <p className="text-xs text-indigo-200/70">Paste raw text or voice transcript to automatically extract client, items, rates, sizes, and compute accurate Saudi baki!</p>
                </div>
              </div>

              <form onSubmit={handleParseOrderText} className="space-y-3">
                <textarea
                  value={aiInputText}
                  onChange={(e) => setAiInputText(e.target.value)}
                  placeholder={`Example voice transcript / customer note:
"Kafil Abu Ahmad: 1 horop, rate 120, size 3.5, and 3 boxes rate 30. Old outstanding balance 150, dynamic payment made 100."`}
                  className="w-full bg-slate-950/80 border border-indigo-800/60 rounded-xl p-3.5 text-xs text-slate-100 placeholder-indigo-300/40 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none font-mono min-h-[90px]"
                />
                
                {aiError && (
                  <div className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/30 p-3 rounded-lg flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{aiError}</span>
                  </div>
                )}

                <div className="flex items-center justify-between gap-3">
                  <div className="text-[10px] text-indigo-300/60 font-mono flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5" /> Powered by Gemini-3.5-Flash
                  </div>
                  <button
                    type="submit"
                    disabled={parsingAi || !aiInputText.trim()}
                    className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-xs font-semibold px-5 py-2.5 rounded-lg transition text-white flex items-center gap-2 shadow-lg shadow-indigo-600/20 cursor-pointer"
                  >
                    {parsingAi ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Parsing raw content...</span>
                      </>
                    ) : (
                      <>
                        <Brain className="w-4 h-4" />
                        <span>Parse order into Form</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>

            {/* Folder Explorer section */}
            <div className="bg-slate-800/50 backdrop-blur border border-slate-700/60 rounded-2xl overflow-hidden shadow-2xl">
              
              {/* Directory Filter controller */}
              <div className="p-4 bg-slate-800/90 border-b border-slate-700 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="relative w-full sm:w-72">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search customer folders..."
                    className="w-full bg-slate-900 border border-slate-750 rounded-xl py-2 pl-9 pr-4 text-xs text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                  <div className="relative">
                    <button 
                      onClick={() => setShowSortDropdown(!showSortDropdown)}
                      className="bg-slate-900 hover:bg-slate-750 px-3 py-2 border border-slate-750 rounded-xl text-xs font-medium text-slate-300 flex items-center gap-2 transition"
                    >
                      <ListFilter className="w-3.5 h-3.5" />
                      <span>Sorting</span>
                      <span className="text-[9px] text-blue-400 ml-1">▼</span>
                    </button>
                    {showSortDropdown && (
                      <div className="absolute right-0 mt-2 w-48 bg-slate-950 border border-slate-800 rounded-lg shadow-2xl p-1 z-20 text-xs text-slate-300">
                        <button 
                          onClick={() => { setSortBy("balance-desc"); setShowSortDropdown(false); }}
                          className={`w-full text-left px-3 py-2 rounded-md hover:bg-slate-800 ${sortBy === "balance-desc" ? "text-blue-400 font-semibold bg-slate-900" : ""}`}
                        >
                          Outstanding balance high ➔ low
                        </button>
                        <button 
                          onClick={() => { setSortBy("balance-asc"); setShowSortDropdown(false); }}
                          className={`w-full text-left px-3 py-2 rounded-md hover:bg-slate-800 ${sortBy === "balance-asc" ? "text-blue-400 font-semibold bg-slate-900" : ""}`}
                        >
                          Outstanding balance low ➔ high
                        </button>
                        <button 
                          onClick={() => { setSortBy("name"); setShowSortDropdown(false); }}
                          className={`w-full text-left px-3 py-2 rounded-md hover:bg-slate-800 ${sortBy === "name" ? "text-blue-400 font-semibold bg-slate-900" : ""}`}
                        >
                          Alphabetical customer names
                        </button>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => setShowAddFolderModal(true)}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs px-4 py-2 rounded-xl transition flex items-center gap-2 cursor-pointer"
                  >
                    <FolderPlus className="w-4 h-4" />
                    <span>ADD new folder</span>
                  </button>
                </div>
              </div>

              {/* Folders List Container - Mobile optimized Card List */}
              <div className="block sm:hidden divide-y divide-slate-800">
                {loading ? (
                  <div className="p-12 text-center text-slate-400 text-xs">
                    <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                    Reading Saudi accounts directory...
                  </div>
                ) : filteredFolders.length === 0 ? (
                  <div className="p-12 text-center text-slate-400 text-xs">
                    No folders found. Click "ADD new folder" or paste user raw data above!
                  </div>
                ) : (
                  filteredFolders.map((folder) => (
                    <div 
                      key={folder.id}
                      onClick={() => handleOpenFolder(folder)}
                      className="p-4 hover:bg-slate-750/35 active:bg-slate-850 transition cursor-pointer flex flex-col gap-3 relative last:border-b-0"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-blue-900/60 text-blue-400 flex items-center justify-center font-black tracking-tight text-sm border border-blue-800">
                            {folder.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <span className="font-display font-semibold text-sm text-slate-100">{folder.name}</span>
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              History: {folder.invoices?.length || 0} invoice records
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={(e) => handleDeleteFolder(folder.id, folder.name, e)}
                          className="p-2 text-slate-500 hover:text-rose-450 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                          title="Delete folder"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-slate-800/60 font-mono text-xs">
                        <span className="text-slate-400 flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          {folder.last_invoice_date || "05/06/26"}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-rose-500 font-bold block">
                            baki : {folder.baki_balance.toLocaleString()}sr
                          </span>
                          {folder.baki_balance > 0 && (
                            <button
                              onClick={(e) => handleQuickClearBalance(folder.id, folder.name, folder.baki_balance, e)}
                              className="bg-emerald-600 hover:bg-emerald-505 text-white text-[10px] font-bold px-2 py-0.5 rounded cursor-pointer transition active:scale-95"
                              title="Clear outstanding balance"
                            >
                              Clear
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Folders List container */}
              <div className="hidden sm:block overflow-x-auto">
                {loading ? (
                  <div className="p-12 text-center text-slate-400 text-xs">
                    <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                    Reading Saudi accounts directory...
                  </div>
                ) : filteredFolders.length === 0 ? (
                  <div className="p-12 text-center text-slate-400 text-xs">
                    No folders found. Click "ADD new folder" or paste user raw data above!
                  </div>
                ) : (
                  <table className="w-full text-left text-xs divide-y divide-slate-800">
                    <thead className="bg-slate-800/40 text-[10px] text-slate-400 font-mono tracking-wider uppercase">
                      <tr>
                        <th className="px-6 py-4">Folder Client</th>
                        <th className="px-6 py-4">Last transaction date</th>
                        <th className="px-6 py-4 text-right">baki balance</th>
                        <th className="px-6 py-4 text-center">Settings</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 text-slate-200">
                      {filteredFolders.map((folder) => (
                        <tr 
                          key={folder.id}
                          onClick={() => handleOpenFolder(folder)}
                          className="hover:bg-slate-750/50 cursor-pointer transition-colors group"
                        >
                          <td className="px-6 py-4 font-display font-semibold text-sm text-slate-100 flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-blue-900/40 text-blue-400 flex items-center justify-center font-bold tracking-tight text-xs border border-blue-850">
                              {folder.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <span>{folder.name}</span>
                              <div className="text-[10px] text-slate-400 mt-0.5 font-normal">
                                History: {folder.invoices?.length || 0} invoice records
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 font-mono text-slate-350">
                            <span className="flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5 text-slate-400" />
                              {folder.last_invoice_date || "05/06/26"}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right font-mono font-bold text-sm text-rose-500">
                            <div className="flex items-center justify-end gap-2 text-right">
                              <span>baki balance : {folder.baki_balance.toLocaleString()}sr</span>
                              {folder.baki_balance > 0 && (
                                <button
                                  onClick={(e) => handleQuickClearBalance(folder.id, folder.name, folder.baki_balance, e)}
                                  className="bg-emerald-600 hover:bg-emerald-505 text-white text-[10px] uppercase font-bold px-2 py-0.5 rounded cursor-pointer transition active:scale-95 inline-block shrink-0"
                                  title="Clear balance"
                                >
                                  Clear
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <button
                              onClick={(e) => handleDeleteFolder(folder.id, folder.name, e)}
                              className="p-2 text-slate-500 hover:text-rose-450 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                              title="Delete folder"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* Invoice Generator Page View */}
        {view === "invoice" && activeInvoice && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="space-y-6"
          >
            {/* Quick Navigation actions */}
            <div className="flex items-center justify-between gap-4">
              <button
                onClick={() => { setView("folders"); fetchFolders(); }}
                className="bg-slate-805 hover:bg-slate-750 px-4 py-2 border border-slate-750 rounded-xl text-xs font-semibold text-slate-200 flex items-center gap-2 transition cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Return to folders</span>
              </button>

              <div className="text-xs font-mono text-slate-450">
                Editing database voucher: <span className="text-blue-400">INV-{activeInvoice.id.slice(0, 8).toUpperCase()}</span>
              </div>
            </div>

            {/* Folder Header Panel with Quick Stats / Switcher & Creator */}
            {selectedFolder && (
              <div className="bg-slate-850 border border-slate-750 rounded-2xl p-5 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 max-w-2xl mx-auto shadow-2xl">
                <div className="space-y-1">
                  <div className="text-[10px] font-bold text-slate-400 font-mono uppercase tracking-wider">Client Folder Profile</div>
                  <h3 className="text-sm font-display font-black text-white">{selectedFolder.name}</h3>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-mono text-slate-350 mt-1">
                    <div>
                      Live Balance: <span className="text-rose-400 font-bold">{selectedFolder.baki_balance} sr</span>
                    </div>
                    <div className="text-slate-600">|</div>
                    <div>
                      Paid History: <span className="text-emerald-400 font-bold">{selectedFolder.total_received} sr</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-end gap-3">
                  {selectedFolder.invoices && selectedFolder.invoices.length > 0 && (
                    <div className="flex flex-col gap-1 flex-1 min-w-[150px]">
                      <label className="text-[9px] font-mono font-bold text-slate-400 uppercase">Voucher Ledger</label>
                      <select
                        value={activeInvoice.id}
                        onChange={(e) => {
                          const found = selectedFolder.invoices?.find(inv => inv.id === e.target.value);
                          if (found) {
                            setActiveInvoice(JSON.parse(JSON.stringify(found)));
                            showToast("Loaded historical record from directory.");
                          }
                        }}
                        className="bg-slate-800 border border-slate-700 text-slate-200 py-1.5 px-3 rounded-xl font-mono focus:ring-1 focus:ring-blue-600 outline-none text-xs w-full cursor-pointer"
                      >
                        {selectedFolder.invoices.map((inv, idx) => (
                          <option key={inv.id} value={inv.id}>
                            {inv.date} - INV-{inv.id.slice(-5).toUpperCase()} ({inv.calculations.total_balance} sr)
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleNewInvoice(selectedFolder)}
                      className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-3.5 py-2.5 rounded-xl transition cursor-pointer flex items-center gap-1.5 shadow-md hover:shadow-blue-500/20 active:scale-95"
                      title="Start a brand new invoice of transactions"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>New Invoice (নতুন বিল)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDeleteInvoice(activeInvoice.id)}
                      className="bg-rose-950/40 hover:bg-rose-900/65 border border-rose-800 text-rose-400 font-semibold p-2.5 rounded-xl transition cursor-pointer active:scale-95"
                      title="Delete this active invoice permanently"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Simulated Desktop Invoice Voucher sheet */}
            <div id="printable-invoice-ledger" className="bg-white text-slate-900 rounded-2xl shadow-2xl overflow-hidden border-2 border-slate-300 max-w-2xl mx-auto">
              
              {/* Receipt Header matching Image 2 perfectly */}
              <div className="bg-blue-800 text-white p-5 flex justify-between items-center relative">
                <div>
                  <h2 className="text-2xl font-display font-bold leading-none">Nora invoice</h2>
                  <div className="text-[10px] text-blue-200 font-mono mt-1">Riyadh, Saudi Arabia</div>
                </div>
                <div className="text-right text-xs font-mono font-semibold">
                  Riyadh<br />Saudi Arabia
                </div>
              </div>

              <div className="p-6 space-y-6">
                
                {/* Meta details */}
                <div className="flex justify-between items-center font-display border-b border-dashed border-slate-300 pb-4">
                  <div className="space-y-1.5">
                    <div className="text-sm font-bold text-blue-900 block uppercase tracking-wide">Client Folder</div>
                    <div className="text-lg font-bold text-slate-900">{activeInvoice.customer_name}</div>
                  </div>

                  <div className="text-right space-y-1.5">
                    <span className="text-sm font-bold text-blue-900 block uppercase tracking-wide">Invoice Date</span>
                    <input
                      type="text"
                      value={activeInvoice.date}
                      onChange={(e) => setActiveInvoice({ ...activeInvoice, date: e.target.value })}
                      className="bg-slate-100 border border-slate-300 rounded-lg py-1 px-2.5 font-mono text-xs font-semibold text-right outline-none focus:ring-1 focus:ring-blue-600 focus:bg-white w-28"
                    />
                  </div>
                </div>

                {/* Items List - Mobile optimized Card Layout (visible only on mobile) */}
                <div className="block sm:hidden space-y-4">
                  {activeInvoice.items.map((row, idx) => {
                    const isHorop = row.item.toLowerCase().includes("horop");
                    return (
                      <div key={row.id} className="bg-slate-50 border border-slate-300 p-4 rounded-xl space-y-3 relative">
                        <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                          <span className="text-xs font-bold text-blue-900 font-mono uppercase">Item #{idx + 1}</span>
                          <button
                            onClick={() => handleRemoveRow(row.id)}
                            className="text-slate-400 hover:text-rose-600 p-1.5 hover:bg-rose-50 rounded-lg transition"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        
                        <div className="space-y-2.5">
                          <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Item Title / Details</label>
                            <input
                              type="text"
                              value={row.item}
                              onChange={(e) => handleItemCellChange(row.id, "item", e.target.value)}
                              className="w-full bg-white border border-slate-300 rounded-lg py-2 px-3 text-xs font-semibold focus:ring-1 focus:ring-blue-500 focus:bg-white outline-none"
                            />
                          </div>

                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Rate (sr)</label>
                              <input
                                type="number"
                                value={row.rate || ""}
                                onChange={(e) => handleItemCellChange(row.id, "rate", e.target.value)}
                                className="w-full text-center bg-white border border-slate-300 rounded-lg py-2 px-1 text-xs font-mono font-semibold focus:ring-1 focus:ring-blue-500 outline-none"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Size (cm)</label>
                              <input
                                type="number"
                                value={isHorop ? (row.size_cm || "") : ""}
                                disabled={!isHorop}
                                placeholder={isHorop ? "Size" : "-"}
                                onChange={(e) => handleItemCellChange(row.id, "size_cm", e.target.value)}
                                className="w-full text-center bg-white disabled:bg-slate-100 disabled:opacity-55 border border-slate-300 rounded-lg py-2 px-1 text-xs font-mono font-semibold focus:ring-1 focus:ring-blue-500 outline-none"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Qty</label>
                              <input
                                type="number"
                                value={row.qty || ""}
                                onChange={(e) => handleItemCellChange(row.id, "qty", e.target.value)}
                                className="w-full text-center bg-white border border-slate-300 rounded-lg py-2 px-1 text-xs font-mono font-semibold focus:ring-1 focus:ring-blue-500 outline-none"
                              />
                            </div>
                          </div>

                          <div className="flex items-center justify-between pt-2 border-t border-dashed border-slate-250">
                            <span className="text-xs text-slate-550 font-bold">Subtotal Amount</span>
                            <span className="text-sm font-mono font-black text-slate-900">{row.amount}sr</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* Add action row on mobile view */}
                  <div className="bg-slate-100 border border-slate-300 rounded-xl p-3.5 space-y-3.5">
                    <button
                      onClick={handleAddCustomRow}
                      className="w-full text-xs bg-white hover:bg-slate-50 border border-slate-300 font-bold py-2.5 rounded-lg text-slate-800 flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Add Custom Item</span>
                    </button>
                    
                    <div className="space-y-1.5">
                      <span className="text-[10px] text-slate-500 font-bold uppercase block text-center">Quick-Add Presets</span>
                      <div className="grid grid-cols-3 gap-2">
                        <button 
                          onClick={() => handlePresetRowAdd("Horop")}
                          className="text-[11px] bg-blue-100 hover:bg-blue-150 text-blue-800 font-bold py-2 rounded-lg text-center cursor-pointer"
                        >
                          + Horop
                        </button>
                        <button 
                          onClick={() => handlePresetRowAdd("Acrylic horop")}
                          className="text-[11px] bg-blue-100 hover:bg-blue-150 text-blue-800 font-bold py-2 rounded-lg text-center cursor-pointer"
                        >
                          + Acrylic
                        </button>
                        <button 
                          onClick={() => handlePresetRowAdd("Box")}
                          className="text-[11px] bg-amber-100 hover:bg-amber-150 text-amber-900 font-bold py-2 rounded-lg text-center cursor-pointer"
                        >
                          + Box
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Items Editable Table (visible on Tablets/Desktop) */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full border-collapse border border-slate-300">
                    <thead>
                      <tr className="bg-slate-200 text-slate-700 text-[11px] font-mono tracking-wider uppercase border border-slate-300">
                        <th className="border border-slate-300 p-2.5 text-left">Item</th>
                        <th className="border border-slate-300 p-2.5 text-center w-18">Rate</th>
                        <th className="border border-slate-300 p-2.5 text-center w-20">size (cm)</th>
                        <th className="border border-slate-300 p-2.5 text-center w-14">Qty</th>
                        <th className="border border-slate-300 p-2.5 text-right w-24">Amount</th>
                        <th className="border border-slate-300 p-2.5 text-center w-10 no-print"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-250 text-xs">
                      {activeInvoice.items.map((row) => {
                        const isHorop = row.item.toLowerCase().includes("horop");
                        return (
                          <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                            <td className="border border-slate-300 p-1.5 text-left font-semibold">
                              <input
                                type="text"
                                value={row.item}
                                onChange={(e) => handleItemCellChange(row.id, "item", e.target.value)}
                                className="w-full bg-transparent focus:ring-1 focus:ring-blue-500 rounded px-1 py-1 font-semibold outline-none"
                              />
                            </td>
                            <td className="border border-slate-300 p-1.5 text-center font-mono">
                              <input
                                type="number"
                                value={row.rate || ""}
                                onChange={(e) => handleItemCellChange(row.id, "rate", e.target.value)}
                                className="w-full text-center bg-transparent focus:ring-1 focus:ring-blue-500 rounded px-0.5 py-1 font-semibold outline-none"
                              />
                            </td>
                            <td className="border border-slate-300 p-1.5 text-center font-mono">
                              <input
                                type="number"
                                value={isHorop ? (row.size_cm || "") : ""}
                                disabled={!isHorop}
                                placeholder={isHorop ? "Size" : "-"}
                                onChange={(e) => handleItemCellChange(row.id, "size_cm", e.target.value)}
                                className="w-full text-center bg-transparent focus:ring-1 focus:ring-blue-500 disabled:opacity-40 rounded px-0.5 py-1 font-semibold outline-none"
                              />
                            </td>
                            <td className="border border-slate-300 p-1.5 text-center font-mono">
                              <input
                                type="number"
                                value={row.qty || ""}
                                onChange={(e) => handleItemCellChange(row.id, "qty", e.target.value)}
                                className="w-full text-center bg-transparent focus:ring-1 focus:ring-blue-500 rounded px-0.5 py-1 font-semibold outline-none"
                              />
                            </td>
                            <td className="border border-slate-300 p-2.5 text-right font-mono font-bold text-slate-800">
                              {row.amount}sr
                            </td>
                            <td className="border border-slate-300 p-1 text-center no-print">
                              <button
                                onClick={() => handleRemoveRow(row.id)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 rounded transition"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      
                      {/* Blank row add controller */}
                      <tr className="no-print">
                        <td colSpan={6} className="border border-slate-300 bg-slate-50 p-2 font-mono">
                          <div className="flex flex-wrap items-center justify-between gap-2.5">
                            <button
                              onClick={handleAddCustomRow}
                              className="text-xs bg-slate-200 hover:bg-slate-300 font-semibold px-3 py-1.5 rounded text-slate-850 flex items-center gap-1 cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>Add Custom Item</span>
                            </button>

                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-slate-500">Presets Quick-Add:</span>
                              <button 
                                onClick={() => handlePresetRowAdd("Horop")}
                                className="text-[10px] bg-blue-100 hover:bg-blue-200 text-blue-800 font-bold px-2 py-1 rounded"
                              >
                                + Horop
                              </button>
                              <button 
                                onClick={() => handlePresetRowAdd("Acrylic horop")}
                                className="text-[10px] bg-blue-100 hover:bg-blue-200 text-blue-800 font-bold px-2 py-1 rounded"
                              >
                                + Acrylic horop
                              </button>
                              <button 
                                onClick={() => handlePresetRowAdd("Box")}
                                className="text-[10px] bg-amber-150 hover:bg-amber-200 text-amber-900 font-bold px-2 py-1 rounded"
                              >
                                + Box
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Calculations summary aligned on the right of sheet */}
                <div className="flex justify-end">
                  <div className="w-full sm:w-64 border border-slate-300">
                    <table className="w-full border-collapse">
                      <tbody>
                        <tr className="border-b border-slate-300">
                          <td className="bg-slate-200 font-bold text-slate-700 p-2 text-center text-xs w-28">New balance</td>
                          <td className="p-2 font-mono font-bold text-right text-xs">
                            {activeInvoice.calculations.new_balance}sr
                          </td>
                        </tr>
                        <tr className="border-b border-slate-300">
                          <td className="bg-slate-200 font-bold text-slate-700 p-2 text-center text-xs">Old balance</td>
                          <td className="p-1 font-mono">
                            <input
                              type="number"
                              value={activeInvoice.calculations.old_balance || ""}
                              onChange={(e) => handleSummaryChange("old_balance", parseFloat(e.target.value) || 0)}
                              className="w-full text-right font-bold focus:ring-1 focus:ring-blue-500 rounded px-1.5 py-1 text-xs outline-none"
                            />
                          </td>
                        </tr>
                        <tr className="border-b border-slate-300">
                          <td className="bg-slate-200 font-bold text-slate-700 p-2 text-center text-xs">Receive Payment</td>
                          <td className="p-1 font-mono">
                            <div className="flex gap-1 items-center">
                              <input
                                type="text"
                                value={paymentStr}
                                placeholder="0"
                                onChange={(e) => {
                                  let val = e.target.value;
                                  
                                  // Strip all characters except numbers and dots
                                  let clean = val.replace(/[^\d.]/g, "");
                                  
                                  // Keep only one decimal point
                                  const parts = clean.split(".");
                                  if (parts.length > 2) {
                                    clean = parts[0] + "." + parts.slice(1).join("");
                                  }
                                  
                                  // Prepend a minus sign only if there is a number entered
                                  const formatted = clean !== "" ? `-${clean}` : "";
                                  setPaymentStr(formatted);
                                  
                                  const numVal = parseFloat(clean) || 0;
                                  handleSummaryChange("payment", numVal);
                                }}
                                className="w-full text-right font-bold focus:ring-1 focus:ring-blue-500 rounded px-1.5 py-1 text-xs outline-none bg-slate-50 border border-slate-200"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const fillAmount = activeInvoice.calculations.new_balance + activeInvoice.calculations.old_balance;
                                  handleSummaryChange("payment", fillAmount);
                                  showToast(`Auto-set receive payment to ${fillAmount} sr. Balance is cleared!`);
                                }}
                                className="text-[10px] bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold py-1 px-1.5 rounded shrink-0 transition no-print"
                                title="Set Receive Payment to match total due to clear balance"
                              >
                                Clear
                              </button>
                            </div>
                          </td>
                        </tr>
                        <tr style={{ color: "#dc2626" }} className="font-bold">
                          <td className="bg-slate-200 font-bold text-slate-800 p-2 text-center text-xs">Total balance</td>
                          <td className="p-2 font-mono text-right text-xs">
                            {activeInvoice.calculations.total_balance}sr
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Big Green Save button */}
                <div className="flex justify-end pt-2 no-print">
                  <button
                    onClick={handleSaveInvoice}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-8 py-2.5 rounded-xl transition shadow-lg shadow-emerald-600/10 cursor-pointer text-base uppercase"
                  >
                    Save
                  </button>
                </div>

                {/* Baki display banner */}
                <div className="border hover:shadow border-slate-350 text-center rounded-xl p-5 block no-print">
                  <div className="font-display font-black text-slate-900 text-2xl uppercase tracking-tight">
                    Baki balance <span className="text-rose-600 font-black">{activeInvoice.calculations.total_balance}sr</span>
                  </div>
                </div>

                {/* Bottom Whatsapp, JPG & PDF buttons group */}
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 no-print">
                  <button
                    onClick={handleSendWhatsApp}
                    className="bg-green-600 hover:bg-green-700 text-white text-sm font-bold py-3 px-4 rounded-xl shadow-lg transition flex items-center justify-center gap-2 cursor-pointer w-full"
                  >
                    <Send className="w-4 h-4" />
                    <span>Send WhatsApp</span>
                  </button>
                  
                  <button
                    onClick={handleDownloadJPG}
                    className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold py-3 px-4 rounded-xl shadow-lg transition flex items-center justify-center gap-2 cursor-pointer w-full"
                  >
                    <Download className="w-4 h-4" />
                    <span>JPG option</span>
                  </button>

                  <button
                    onClick={handleDownloadPDF}
                    className="bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold py-3 px-4 rounded-xl shadow-lg transition flex items-center justify-center gap-2 cursor-pointer w-full"
                  >
                    <FileText className="w-4 h-4" />
                    <span>Download PDF</span>
                  </button>

                  <button
                    onClick={handlePrintInvoice}
                    className="bg-slate-700 hover:bg-slate-800 text-white text-sm font-bold py-3 px-4 rounded-xl shadow-lg transition flex items-center justify-center gap-2 cursor-pointer w-full"
                  >
                    <Printer className="w-4 h-4" />
                    <span>Print Invoice</span>
                  </button>
                </div>

              </div>
            </div>
          </motion.div>
        )}

      </main>

      {/* Add Client Folder Dialog Modal */}
      <AnimatePresence>
        {showAddFolderModal && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-800 border border-slate-700 rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between">
                <h4 className="font-display font-medium text-lg text-white">Create New Client Folder</h4>
                <button 
                  onClick={() => setShowAddFolderModal(false)}
                  className="text-slate-400 hover:text-slate-200 transition"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleCreateFolder} className="space-y-4 text-xs font-mono">
                <div className="space-y-1.5">
                  <label className="text-slate-400 font-medium">Customer Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Abu ahmad, Sakib, etc."
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-slate-100 outline-none focus:ring-1 focus:ring-blue-500 text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-slate-400 font-medium">Old Outstanding Balance (sr)</label>
                  <input
                    type="number"
                    placeholder="e.g. 50"
                    value={newFolderOldBalance || ""}
                    onChange={(e) => setNewFolderOldBalance(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-slate-100 outline-none focus:ring-1 focus:ring-blue-500 text-xs"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold p-3 rounded-xl transition text-xs cursor-pointer"
                >
                  Confirm & Put in Directory
                </button>
              </form>
            </motion.div>
          </div>
        )}

        {confirmModal?.isOpen && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-850 border border-slate-700 rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4"
            >
              <h4 className="font-display font-semibold text-base text-white">{confirmModal.title}</h4>
              <p className="text-xs text-slate-300 font-sans leading-relaxed">{confirmModal.message}</p>
              
              <div className="flex items-center justify-end gap-3 pt-2 font-mono text-xs">
                <button
                  type="button"
                  onClick={() => setConfirmModal(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-750 border border-slate-700 rounded-xl text-slate-300 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await confirmModal.onConfirm();
                    setConfirmModal(null);
                  }}
                  className={`px-4 py-2 rounded-xl text-white font-bold transition cursor-pointer ${
                    confirmModal.isDanger 
                      ? "bg-rose-600 hover:bg-rose-500 active:bg-rose-700" 
                      : "bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700"
                  }`}
                >
                  {confirmModal.confirmText}
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {downloadPreviewUrl && (
          <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4 z-[120] no-print overflow-y-auto">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-4 md:p-6 shadow-2xl space-y-4 my-8"
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div>
                  <h4 className="font-display font-bold text-base text-white flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-amber-400" />
                    <span>রসিদ প্রিভিউ ও ডাউনলোড সহায়তা</span>
                  </h4>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {downloadFileType === "jpg" ? "High Resolution Image format" : "Official PDF format preview"}
                  </p>
                </div>
                <button 
                  onClick={() => setDownloadPreviewUrl(null)}
                  className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-750 text-slate-400 hover:text-white transition flex items-center justify-center text-sm cursor-pointer"
                  title="Close preview"
                >
                  ✕
                </button>
              </div>

              {/* Special instruction callout */}
              <div className="bg-amber-950/40 border border-amber-900/40 rounded-xl p-3.5 text-[11px] font-sans leading-relaxed text-amber-200">
                <span className="font-bold text-xs text-amber-300 block mb-1">💡 মোবাইল বা ব্রাউজারে ডাউনলোড না হলে:</span>
                নিচের রসিদটির ছবির ওপর <span className="underline font-bold text-white">চেপে ধরে রাখুন (Long Press)</span> এবং <span className="underline font-bold text-white">'Save Image' বা 'Download Image'</span> এ ক্লিক করে আপনার ফোনে সেভ করে নিন। এরপর সরাসরি হোয়াটসঅ্যাপে ক্রেতাকে পাঠাতে পারবেন।
              </div>

              {/* Renders real Image for Long Press Save */}
              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-850 flex flex-col items-center justify-center max-h-[480px] overflow-y-auto">
                <img 
                  src={downloadPreviewUrl} 
                  alt="Nora Invoice Receipt Preview" 
                  className="max-h-[440px] w-auto h-auto object-contain rounded border border-slate-700 select-all"
                  referrerPolicy="no-referrer"
                />
              </div>

              {/* Action options */}
              <div className="grid grid-cols-2 gap-3 pt-2 font-mono text-xs">
                <button
                  type="button"
                  onClick={() => {
                    // Try to trigger safe download once more
                    try {
                      const blob = dataURLtoBlob(downloadPreviewUrl);
                      const blobUrl = URL.createObjectURL(blob);
                      const link = document.createElement("a");
                      link.href = blobUrl;
                      link.download = `NoraInvoice_${activeInvoice?.customer_name.replace(/\s+/g, "_") || "File"}.jpg`;
                      document.body.appendChild(link);
                      link.click();
                      setTimeout(() => {
                        document.body.removeChild(link);
                        URL.revokeObjectURL(blobUrl);
                      }, 300);
                      showToast("ডাউনলোড পুনরায় চেষ্টা করা করা হয়েছে!");
                    } catch (e) {
                      showToast("ছবিটির ওপর চেপে ধরে সেভ করুন।");
                    }
                  }}
                  className="px-4 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Try Download</span>
                </button>

                <button
                  type="button"
                  onClick={() => setDownloadPreviewUrl(null)}
                  className="px-4 py-3 bg-slate-800 hover:bg-slate-750 border border-slate-700 rounded-xl text-slate-300 transition cursor-pointer text-center font-bold"
                >
                  Close (বন্ধ করুন)
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Responsive layout Footer bar */}
      <footer className="border-t border-slate-800 mt-20 pt-6">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <div>
            Built securely for Riyadh Signboards and Horop businesses.
          </div>
          <div>
            Nora Invoice Pro Riyadh Live System V1.5.0
          </div>
        </div>
      </footer>

    </div>
  );
}
