import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;
const DB_FILE = path.join(process.cwd(), "db.json");

app.use(express.json());

// Initialize Gemini SDK with named parameters & headers as instructed
const geminiApiKey = process.env.GEMINI_API_KEY || "";
let ai: GoogleGenAI | null = null;
if (geminiApiKey) {
  ai = new GoogleGenAI({
    apiKey: geminiApiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

// Initial mockup data corresponding to UI mockups
const initialMockData = {
  folders: [
    {
      id: "cust-1",
      name: "Sakib",
      baki_balance: 10090,
      total_received: 2500,
      last_invoice_date: "04/06/26",
      invoices: [
        {
          id: "inv-sakib-1",
          customer_name: "Sakib",
          date: "04/06/26",
          items: [
            { id: "row-s1", item: "Acrylic horop", rate: 120, size_cm: 3.5, qty: 24, amount: 10080 },
            { id: "row-s2", item: "Box", rate: 10, size_cm: 0, qty: 1, amount: 10 }
          ],
          calculations: {
            payment: 0,
            old_balance: 0,
            new_balance: 10090,
            total_balance: 10090
          },
          savedAt: new Date(2026, 5, 4, 14, 30).toISOString()
        }
      ]
    },
    {
      id: "cust-2",
      name: "Imran",
      baki_balance: 900,
      total_received: 500,
      last_invoice_date: "05/06/26",
      invoices: [
        {
          id: "inv-imran-1",
          customer_name: "Imran",
          date: "05/06/26",
          items: [
            { id: "row-i1", item: "Horop", rate: 100, size_cm: 2.0, qty: 7, amount: 1400 }
          ],
          calculations: {
            payment: 500,
            old_balance: 0,
            new_balance: 1400,
            total_balance: 900
          },
          savedAt: new Date(2026, 5, 5, 10, 15).toISOString()
        }
      ]
    },
    {
      id: "cust-3",
      name: "Viki",
      baki_balance: 220,
      total_received: 1000,
      last_invoice_date: "03/06/26",
      invoices: [
        {
          id: "inv-viki-1",
          customer_name: "Viki",
          date: "03/06/26",
          items: [
            { id: "row-v1", item: "Box", rate: 15, size_cm: 0, qty: 8, amount: 120 },
            { id: "row-v2", item: "Horop", rate: 110, size_cm: 2.0, qty: 5, amount: 1100 }
          ],
          calculations: {
            payment: 1000,
            old_balance: 0,
            new_balance: 1220,
            total_balance: 220
          },
          savedAt: new Date(2026, 5, 3, 11, 20).toISOString()
        }
      ]
    },
    {
      id: "cust-4",
      name: "Haron",
      baki_balance: 606,
      total_received: 100,
      last_invoice_date: "04/06/26",
      invoices: [
        {
          id: "inv-haron-1",
          customer_name: "Haron",
          date: "04/06/26",
          items: [
            { id: "row-h1", item: "Acrylic horop", rate: 110, size_cm: 1.5, qty: 4, amount: 660 },
            { id: "row-h2", item: "Box", rate: 23, size_cm: 0, qty: 2, amount: 46 }
          ],
          calculations: {
            payment: 100,
            old_balance: 0,
            new_balance: 706,
            total_balance: 606
          },
          savedAt: new Date(2026, 5, 4, 16, 45).toISOString()
        }
      ]
    },
    {
      id: "cust-5",
      name: "Abu ahmad",
      baki_balance: 1000,
      total_received: 0,
      last_invoice_date: "05/06/26",
      invoices: [
        {
          id: "inv-abu-1",
          customer_name: "Abu ahmad",
          date: "05/06/26",
          items: [
            { id: "row-a1", item: "Horop", rate: 100, size_cm: 2.5, qty: 1, amount: 250 },
            { id: "row-a2", item: "Box", rate: 20, size_cm: 0, qty: 1, amount: 20 }
          ],
          calculations: {
            payment: 0,
            old_balance: 730,
            new_balance: 270,
            total_balance: 1000
          },
          savedAt: new Date(2026, 5, 5, 17, 25).toISOString()
        }
      ]
    }
  ]
};

// Database safety helpers
function loadDatabase() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(initialMockData, null, 2), "utf-8");
    return initialMockData;
  }
  try {
    const raw = fs.readFileSync(DB_FILE, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    console.error("Failed to parse database file, falling back to mock data", err);
    return initialMockData;
  }
}

function saveDatabase(data: any) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to write to database file", err);
  }
}

// REST Endpoints
app.get("/api/folders", (req, res) => {
  const data = loadDatabase();
  res.json(data.folders);
});

app.post("/api/folders", (req, res) => {
  const data = loadDatabase();
  const newFolder = req.body;
  if (!newFolder.id || !newFolder.name) {
    res.status(400).json({ error: "Missing folder id or name" });
    return;
  }
  // Avoid duplicates
  const existsIdx = data.folders.findIndex((f: any) => f.id === newFolder.id || f.name.toLowerCase() === newFolder.name.toLowerCase());
  if (existsIdx !== -1) {
    res.status(400).json({ error: "Folder already exists" });
    return;
  }
  data.folders.push(newFolder);
  saveDatabase(data);
  res.json(newFolder);
});

app.post("/api/folders/update-balance", (req, res) => {
  const data = loadDatabase();
  const { folderId, baki_balance, total_received, last_invoice_date, invoices } = req.body;
  const folder = data.folders.find((f: any) => f.id === folderId);
  if (folder) {
    if (typeof baki_balance === "number") folder.baki_balance = baki_balance;
    if (typeof total_received === "number") folder.total_received = total_received;
    if (last_invoice_date) folder.last_invoice_date = last_invoice_date;
    if (invoices) folder.invoices = invoices;
    saveDatabase(data);
    res.json(folder);
  } else {
    res.status(404).json({ error: "Folder not found" });
  }
});

app.delete("/api/folders/:id", (req, res) => {
  const data = loadDatabase();
  const { id } = req.params;
  const initialLength = data.folders.length;
  data.folders = data.folders.filter((f: any) => f.id !== id);
  if (data.folders.length !== initialLength) {
    saveDatabase(data);
    res.json({ success: true });
  } else {
    res.status(404).json({ error: "Folder not found" });
  }
});

// Gemini AI Invoice parser
app.post("/api/parse-invoice", async (req, res) => {
  const { inputText, customerId } = req.body;

  if (!inputText || !inputText.trim()) {
    res.status(400).json({ error: "Input text is empty" });
    return;
  }

  if (!ai) {
    res.status(503).json({
      error: "Gemini API key is not configured inside server secrets.",
    });
    return;
  }

  try {
    const today = new Date();
    const formattedDate = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getFullYear()).slice(-2)}`;

    // Instruct Gemini about calculations precisely:
    const systemPrompt = `You are a high-fidelity parsing engine for "Nora Invoice App" in Riyadh, Saudi Arabia.
Your job is to read raw order items, quantities, and rates from chat requests (which might be in English, Arabic, or a mixture of these), and extract them into a perfectly formatted JSON structure.

Strict parsing instructions:
- Detect items like "Horop", "Id horop", "Acrylic horop", "Box", "Letters", "Boards", or custom names.
- If the item is "Horop" or "Acrylic horop", extract "rate", "size_cm", and "qty". Calculate its amount: rate * size_cm * qty. Use a numeric "size_cm" (e.g. 2.5).
- For ordinary items like "Box", "rate" and "qty" are relevant. "size_cm" is 0. Its amount is: rate * qty.
- Extract or guess "customer_name" if possible from text. If not obvious or if a name is input, match closely.
- Try to parse "payment" if mentioned (e.g., "received 100", "paid 50", "payment 0").
- Try to parse "old_balance" or "old baki" if mentioned (e.g., "old balance 50", "previous balance 120", "old baki 50").
- Today's date is: ${formattedDate}. Use it if no date is specified.
- Re-calculate amounts using strict formulas:
  1. For 'Horop' or 'Acrylic horop': amount = rate * size_cm * qty.
  2. For others: amount = rate * qty.
  3. new_balance = sum of all amounts.
  4. total_balance = new_balance + old_balance - payment.

Output RAW JSON schema matching the config.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: `Raw input text to parse: "${inputText}"`,
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            customer_name: { type: Type.STRING, description: "Extracted name of the customer" },
            date: { type: Type.STRING, description: "Date in DD/MM/YY format" },
            items: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  item: { type: Type.STRING, description: "The item title, e.g. 'Horop', 'Acrylic horop', or 'Box' or custom" },
                  rate: { type: Type.NUMBER, description: "The unit rate" },
                  size_cm: { type: Type.NUMBER, description: "The size in cm. Accurate numeric representation (e.g. 2.5). 0 for non-Horop items" },
                  qty: { type: Type.NUMBER, description: "The quantity" },
                  amount: { type: Type.NUMBER, description: "Rate * Qty for Normal, or Rate * Size_cm * Qty for Horop/Acrylic" }
                },
                required: ["item", "rate", "size_cm", "qty", "amount"]
              }
            },
            calculations: {
              type: Type.OBJECT,
              properties: {
                payment: { type: Type.NUMBER, description: "Paid amount extracted, 0 if nothing mentioned" },
                new_balance: { type: Type.NUMBER, description: "Sum of all generated item amounts" },
                old_balance: { type: Type.NUMBER, description: "Previous unpaid balance extracted, 0 if nothing" },
                total_balance: { type: Type.NUMBER, description: "Calculated balance: new_balance + old_balance - payment" }
              },
              required: ["payment", "new_balance", "old_balance", "total_balance"]
            }
          },
          required: ["customer_name", "date", "items", "calculations"]
        }
      }
    });

    const parsedJsonText = response.text;
    if (!parsedJsonText) {
      throw new Error("Empty response from Gemini parser");
    }

    const parsedData = JSON.parse(parsedJsonText);

    // Double-check calculation integrity on the backend before shipping to the client
    let newBalance = 0;
    const verifiedItems = parsedData.items.map((it: any) => {
      const isHorop = it.item.toLowerCase().includes("horop");
      let amount = 0;
      if (isHorop) {
        const size = it.size_cm > 0 ? it.size_cm : 1.0;
        amount = it.rate * size * it.qty;
      } else {
        amount = it.rate * it.qty;
      }
      newBalance += amount;
      return {
        ...it,
        amount
      };
    });

    const payment = parsedData.calculations.payment || 0;
    const old_balance = parsedData.calculations.old_balance || 0;
    const total_balance = newBalance + old_balance - payment;

    res.json({
      customer_name: parsedData.customer_name || "New Client",
      date: parsedData.date || formattedDate,
      items: verifiedItems,
      calculations: {
        payment,
        new_balance: newBalance,
        old_balance,
        total_balance
      }
    });

  } catch (err: any) {
    console.error("Error invoking Gemini parser API:", err);
    res.status(500).json({ error: "Parser failed: " + err.message });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is running at http://localhost:${PORT}`);
  });
}

startServer();
