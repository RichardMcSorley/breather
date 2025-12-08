import { EmailMessage } from "./email-helper";
import { parseDateAsUTC } from "./date-utils";

export interface ParsedCashAppTransaction {
  amount: number;
  type: "income" | "expense";
  date: Date;
  time: string;
  notes?: string;
  transactionId?: string;
  emailUid: number;
}

export function parseCashAppEmail(email: EmailMessage): ParsedCashAppTransaction | null {
  try {
    // Try to extract transaction details from email
    const text = email.text || email.html || "";
    const html = email.html || "";

    // Extract amount - Cash App emails typically show amounts like "$50.00" or "$50"
    const amountMatch = text.match(/\$(\d+\.?\d*)/);
    if (!amountMatch) {
      return null;
    }

    const amount = parseFloat(amountMatch[1]);
    if (isNaN(amount) || amount <= 0) {
      return null;
    }

    // Determine transaction type based on email content
    // Cash App sends different emails for received vs sent payments
    const isReceived = 
      text.toLowerCase().includes("received") ||
      text.toLowerCase().includes("you received") ||
      text.toLowerCase().includes("paid you") ||
      email.subject.toLowerCase().includes("received") ||
      email.subject.toLowerCase().includes("payment received");
    
    const isSent =
      text.toLowerCase().includes("sent") ||
      text.toLowerCase().includes("you sent") ||
      text.toLowerCase().includes("paid") && !text.toLowerCase().includes("paid you") ||
      email.subject.toLowerCase().includes("sent") ||
      email.subject.toLowerCase().includes("payment sent");

    let type: "income" | "expense";
    if (isReceived) {
      type = "income";
    } else if (isSent) {
      type = "expense";
    } else {
      // Default to income if unclear (most Cash App transactions are income for gig workers)
      type = "income";
    }

    // Extract date from email
    const emailDate = email.date || new Date();
    
    // Format date and time in UTC
    const dateStr = emailDate.toISOString().split("T")[0]; // YYYY-MM-DD
    const hours = String(emailDate.getUTCHours()).padStart(2, "0");
    const minutes = String(emailDate.getUTCMinutes()).padStart(2, "0");
    const timeStr = `${hours}:${minutes}`; // HH:MM in UTC

    // Extract transaction ID if available
    // Cash App emails sometimes include transaction IDs
    const transactionIdMatch = text.match(/(?:transaction|id|ref)[\s#:]*([A-Z0-9]{8,})/i);
    const transactionId = transactionIdMatch ? transactionIdMatch[1] : undefined;

    // Extract notes/description
    // Try to find description in email body
    let notes: string | undefined;
    
    // First priority: Extract "On statement as" from transaction details section
    // Cash App emails have a "Transaction details" section with "On statement as" field
    const onStatementPatterns = [
      /On\s+statement\s+as[:\s]+(.+?)(?:\n|$|Transaction|Payment|Pending)/i,
      /On\s+statement\s+as[:\s]+(.+?)(?:\n|$)/i,
      /statement\s+as[:\s]+(.+?)(?:\n|$|Transaction|Payment|Pending)/i,
    ];

    // Try both text and HTML content
    const contentToSearch = [text, html].filter(Boolean);
    
    for (const content of contentToSearch) {
      for (const pattern of onStatementPatterns) {
        const match = content.match(pattern);
        if (match && match[1] && match[1].trim().length > 0) {
          notes = match[1].trim()
            .replace(/\s*\.$/, '')
            .trim();
          if (notes.length > 0 && notes.length < 200) { // Reasonable length check
            break;
          }
        }
      }
      if (notes) break;
    }
    
    // Second priority: Try to extract note after "On" statement in email body
    // Cash App emails often have format: "On [date], you received/sent $X from/to [note]"
    if (!notes) {
      const onPatterns = [
        /On\s+[^,]+,?\s+you\s+(?:received|sent)\s+\$[\d.]+(?:\s+from|\s+to)?\s+(.+?)(?:\n|$|\.|,)/i,
        /On\s+[^,]+,?\s+you\s+(?:received|sent)\s+\$[\d.]+\s+(?:from|to)\s+(.+?)(?:\n|$|\.|,)/i,
        /On\s+[^,]+,?\s+(?:received|sent)\s+\$[\d.]+(?:\s+from|\s+to)?\s+(.+?)(?:\n|$|\.|,)/i,
      ];

      for (const content of contentToSearch) {
        for (const pattern of onPatterns) {
          const match = content.match(pattern);
          if (match && match[1] && match[1].trim().length > 0) {
            // Clean up the note - remove common trailing phrases
            notes = match[1].trim()
              .replace(/\s*using\s+Cash\s+App.*$/i, '')
              .replace(/\s*\.$/, '')
              .trim();
            if (notes.length > 0 && notes.length < 200) {
              break;
            }
          }
        }
        if (notes) break;
      }
    }
    
    // Third priority: Look for other common patterns in Cash App emails
    if (!notes) {
      const descriptionPatterns = [
        /(?:for|note|memo|description)[\s:]+(.+?)(?:\n|$)/i,
        /"([^"]+)"/, // Text in quotes
        /from\s+(.+?)(?:\n|$)/i,
        /to\s+(.+?)(?:\n|$)/i,
      ];

      for (const content of contentToSearch) {
        for (const pattern of descriptionPatterns) {
          const match = content.match(pattern);
          if (match && match[1] && match[1].trim().length > 0) {
            notes = match[1].trim();
            if (notes.length > 0 && notes.length < 200) {
              break;
            }
          }
        }
        if (notes) break;
      }
    }

    // If no notes found, use a default
    if (!notes) {
      notes = type === "income" ? "Cash App payment received" : "Cash App payment sent";
    }

    return {
      amount,
      type,
      date: parseDateAsUTC(dateStr, timeStr),
      time: timeStr,
      notes,
      transactionId,
      emailUid: email.uid,
    };
  } catch (error) {
    return null;
  }
}

export function parseCashAppEmails(emails: EmailMessage[]): ParsedCashAppTransaction[] {
  const transactions: ParsedCashAppTransaction[] = [];

  for (const email of emails) {
    const transaction = parseCashAppEmail(email);
    if (transaction) {
      transactions.push(transaction);
    }
  }

  return transactions;
}
