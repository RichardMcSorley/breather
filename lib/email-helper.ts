import Imap from "imap";
import { simpleParser } from "mailparser";
import { decryptEmailPassword } from "./email-encryption";

export interface EmailMessage {
  uid: number;
  subject: string;
  from: string;
  date: Date;
  text: string;
  html: string;
}

export interface EmailConfig {
  imapHost: string;
  imapPort: number;
  username: string;
  password: string; // Plain password (from env var) or encrypted (from DB)
  tls: boolean;
  isEncrypted?: boolean; // Whether password is encrypted
}

export function getEmailConfigFromEnv(): EmailConfig | null {
  // Only access environment variables server-side (in API routes)
  // This function should never be called from client-side code
  const username = process.env.EMAIL_USERNAME;
  const token = process.env.EMAIL_TOKEN || process.env.EMAIL_PASSWORD;
  const server = process.env.EMAIL_SERVER || process.env.EMAIL_IMAP_HOST;
  const port = process.env.EMAIL_PORT || process.env.EMAIL_IMAP_PORT;

  // Return null if any required env var is missing
  if (!username || !token || !server || !port) {
    return null;
  }

  // Validate port is a number, return null if invalid
  const imapPort = parseInt(port, 10);
  if (isNaN(imapPort) || imapPort <= 0 || imapPort > 65535) {
    return null;
  }

  return {
    imapHost: server,
    imapPort,
    username,
    password: token,
    tls: imapPort === 993 || imapPort === 143,
    isEncrypted: false,
  };
}

export function createImapConnection(config: EmailConfig): Imap {
  const password = config.isEncrypted
    ? decryptEmailPassword(config.password)
    : config.password;

  // For Proton Bridge on port 1143, we need STARTTLS (not direct TLS)
  const useStartTLS = config.imapPort === 1143 || config.imapPort === 143;

  return new Imap({
    user: config.username,
    password: password,
    host: config.imapHost,
    port: config.imapPort,
    tls: config.tls && !useStartTLS, // Don't use direct TLS if using STARTTLS
    tlsOptions: config.tls && !useStartTLS ? { rejectUnauthorized: false } : undefined,
    connTimeout: 30000, // 30 second connection timeout
    authTimeout: 30000, // 30 second auth timeout
  });
}

export function connectToImap(imap: Imap, timeoutMs: number = 30000): Promise<void> {
  return new Promise((resolve, reject) => {
    let timeoutId: NodeJS.Timeout;
    let resolved = false;

    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
      resolved = true;
    };

    // Set timeout
    timeoutId = setTimeout(() => {
      if (!resolved) {
        cleanup();
        imap.end();
        reject(new Error(`IMAP connection timeout after ${timeoutMs}ms. Check EMAIL_SERVER and EMAIL_PORT settings.`));
      }
    }, timeoutMs);

    imap.once("ready", () => {
      if (!resolved) {
        cleanup();
        resolve();
      }
    });

    imap.once("error", (err: Error) => {
      if (!resolved) {
        cleanup();
        reject(err);
      }
    });

    imap.connect();
  });
}

export function openInbox(imap: Imap): Promise<Imap.Box> {
  return new Promise((resolve, reject) => {
    imap.openBox("INBOX", false, (err, box) => {
      if (err) {
        reject(err);
      } else {
        resolve(box);
      }
    });
  });
}

export function searchEmails(
  imap: Imap,
  searchCriteria: any[]
): Promise<number[]> {
  return new Promise((resolve, reject) => {
    imap.search(searchCriteria, (err, results) => {
      if (err) {
        reject(err);
      } else {
        resolve(results);
      }
    });
  });
}

export function fetchEmails(
  imap: Imap,
  uids: number[]
): Promise<EmailMessage[]> {
  return new Promise((resolve, reject) => {
    if (uids.length === 0) {
      resolve([]);
      return;
    }

    const fetch = imap.fetch(uids, {
      bodies: "",
      struct: true,
    });

    const messages: EmailMessage[] = [];
    let pendingMessages = uids.length;
    let hasError = false;

    fetch.on("message", (msg, seqno) => {
      let uid: number;
      let emailData = "";

      msg.on("body", (stream) => {
        stream.on("data", (chunk) => {
          emailData += chunk.toString("utf8");
        });
      });

      msg.once("attributes", (attrs) => {
        uid = attrs.uid;
      });

      msg.once("end", async () => {
        if (hasError) return;

        try {
          const parsed = await simpleParser(emailData);
          
          messages.push({
            uid: uid!,
            subject: parsed.subject || "",
            from: parsed.from?.text || "",
            date: parsed.date || new Date(),
            text: parsed.text || "",
            html: parsed.html || "",
          });

          pendingMessages--;
          if (pendingMessages === 0) {
            resolve(messages);
          }
        } catch (parseError) {
          pendingMessages--;
          if (pendingMessages === 0 && !hasError) {
            resolve(messages);
          }
        }
      });
    });

    fetch.once("error", (err) => {
      hasError = true;
      reject(err);
    });

    fetch.once("end", () => {
      // If all messages were processed, resolve
      if (pendingMessages === 0 && !hasError) {
        resolve(messages);
      }
    });
  });
}

export function closeImap(imap: Imap): Promise<void> {
  return new Promise((resolve) => {
    imap.end();
    imap.once("end", () => {
      resolve();
    });
  });
}
