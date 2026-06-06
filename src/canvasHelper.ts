import { jsPDF } from "jspdf";
import { Invoice } from "./types";

export function drawInvoiceReceipt(invoice: Invoice, bakiBalance: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = 600;
  canvas.height = 800;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  // 1. Background styling
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Decorative border
  ctx.strokeStyle = "#1e40af";
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);

  // 2. Header Blueprint (Saudi styling)
  ctx.fillStyle = "#1e40af"; // Deep Saudi Blue
  ctx.fillRect(8, 8, canvas.width - 16, 90);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 26px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Nora invoice", canvas.width / 2, 45);

  ctx.fillStyle = "#e0e7ff";
  ctx.font = "italic 14px sans-serif";
  ctx.fillText("Riyadh, Saudi Arabia", canvas.width / 2, 70);

  // 3. Customer Info
  ctx.fillStyle = "#1e3a8a";
  ctx.font = "bold 20px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(`Customer: ${invoice.customer_name}`, 40, 140);

  ctx.fillStyle = "#4b5563";
  ctx.font = "15px sans-serif";
  ctx.fillText(`Date: ${invoice.date || "05/06/26"}`, 40, 170);
  ctx.fillText(`Invoice No: INV-${invoice.id.slice(0, 7).toUpperCase()}`, 40, 195);

  // Decorative green line
  ctx.fillStyle = "#22c55e";
  ctx.fillRect(40, 215, canvas.width - 80, 2);

  // 4. Items Table Headers
  const tableTop = 240;
  ctx.fillStyle = "#718096";
  ctx.fillRect(40, tableTop, canvas.width - 80, 35);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 13px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("Item Details", 50, tableTop + 22);
  ctx.textAlign = "center";
  ctx.fillText("Rate", 280, tableTop + 22);
  ctx.fillText("Size (cm)", 360, tableTop + 22);
  ctx.fillText("Qty", 440, tableTop + 22);
  ctx.textAlign = "right";
  ctx.fillText("Amount", 550, tableTop + 22);

  // 5. Drawing rows
  let currentY = tableTop + 35;
  ctx.fillStyle = "#1e293b";
  ctx.font = "14px sans-serif";

  // Draw grid helper
  const drawRowBackground = (y: number, isAlt: boolean) => {
    if (isAlt) {
      ctx.fillStyle = "#f8fafc";
      ctx.fillRect(40, y, canvas.width - 80, 30);
    }
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 1;
    ctx.strokeRect(40, y, canvas.width - 80, 30);
  };

  invoice.items.forEach((item, index) => {
    drawRowBackground(currentY, index % 2 === 1);
    
    ctx.fillStyle = "#1e293b";
    ctx.font = "bold 13px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(item.item, 50, currentY + 20);

    ctx.font = "13px monospace";
    ctx.textAlign = "center";
    ctx.fillText(`${item.rate} sr`, 280, currentY + 20);
    ctx.fillText(item.size_cm > 0 ? `${item.size_cm} cm` : "-", 360, currentY + 20);
    ctx.fillText(`${item.qty}`, 440, currentY + 20);

    ctx.textAlign = "right";
    ctx.font = "bold 13px sans-serif";
    ctx.fillText(`${item.amount} sr`, 550, currentY + 20);

    currentY += 30;
  });

  // Keep drawing spacing safe
  currentY += 20;

  // 6. Summary Block
  const summaryX = 320;
  const sRow = (label: string, valueStr: string, isBig = false) => {
    ctx.fillStyle = isBig ? "#dc2626" : "#475569";
    ctx.font = isBig ? "bold 16px sans-serif" : "bold 14px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(label, summaryX, currentY + 18);
    
    ctx.textAlign = "right";
    ctx.fillText(valueStr, 550, currentY + 18);
    currentY += 25;
  };

  sRow(`New Balance:`, `${invoice.calculations.new_balance} sr`);
  sRow(`Old Balance:`, `${invoice.calculations.old_balance} sr`);
  sRow(`Receive Payment:`, `-${invoice.calculations.payment} sr`);
  
  // Highlight boundary
  ctx.fillStyle = "#e2e8f0";
  ctx.fillRect(summaryX, currentY, 230, 2);
  currentY += 5;

  sRow(`Total Balance:`, `${invoice.calculations.total_balance} sr`, true);

  // 7. Large Baki Outline Banner
  currentY += 30;
  ctx.fillStyle = "#fef2f2";
  ctx.fillRect(40, currentY, canvas.width - 80, 70);
  ctx.strokeStyle = "#fca5a5";
  ctx.lineWidth = 2;
  ctx.strokeRect(40, currentY, canvas.width - 80, 70);

  ctx.fillStyle = "#1e293b";
  ctx.font = "bold 20px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Baki Balance", canvas.width / 2, currentY + 30);

  ctx.fillStyle = "#e11d48";
  ctx.font = "bold 25px monospace";
  ctx.fillText(`${bakiBalance} sr`, canvas.width / 2, currentY + 58);

  // 8. Footer credits
  ctx.fillStyle = "#64748b";
  ctx.font = "12px sans-serif";
  ctx.fillText("Thank you / Shokran!", canvas.width / 2, 750);
  ctx.fillText(`Printed at: ${new Date().toLocaleDateString()}`, canvas.width / 2, 770);

  return canvas.toDataURL("image/jpeg", 0.95);
}

export function exportInvoiceToPDF(invoice: Invoice, bakiBalance: number) {
  const dataUrl = drawInvoiceReceipt(invoice, bakiBalance);
  if (!dataUrl) return;

  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4"
  });

  // Calculate A4 proportions mapping canvas shape (600x800 width/height ratio)
  const imgWidth = 210; // A4 width in mm
  const imgHeight = (800 * imgWidth) / 600; // Perfect aspect ratio fit

  pdf.addImage(dataUrl, "JPEG", 0, 0, imgWidth, imgHeight, undefined, "FAST");
  pdf.save(`NoraInvoice_${invoice.customer_name.replace(/\s+/g, "_")}_${invoice.date.replace(/\//g, "-")}.pdf`);
}

