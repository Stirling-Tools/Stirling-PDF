import {
  indexedDBManager,
  DATABASE_CONFIGS,
} from "@app/services/indexedDBManager";
import type {
  EmailAccountRecord,
  EmailAttachmentRecord,
  EmailMessageRecord,
} from "@app/types/email";

class EmailStorageService {
  private readonly config = DATABASE_CONFIGS.EMAIL;

  private async getDatabase(): Promise<IDBDatabase> {
    return indexedDBManager.openDatabase(this.config);
  }

  async getAccounts(): Promise<EmailAccountRecord[]> {
    const db = await this.getDatabase();
    return this.getAll<EmailAccountRecord>(db, "accounts");
  }

  async getMessages(accountId: string): Promise<EmailMessageRecord[]> {
    const db = await this.getDatabase();
    return this.getByIndex<EmailMessageRecord>(
      db,
      "messages",
      "accountId",
      accountId,
    );
  }

  async getAttachments(messageId: string): Promise<EmailAttachmentRecord[]> {
    const db = await this.getDatabase();
    return this.getByIndex<EmailAttachmentRecord>(
      db,
      "attachments",
      "messageId",
      messageId,
    );
  }

  async upsertAccount(account: EmailAccountRecord): Promise<void> {
    const db = await this.getDatabase();
    await this.put(db, "accounts", account);
  }

  async upsertMessages(
    messages: EmailMessageRecord[],
    attachments: EmailAttachmentRecord[] = [],
  ): Promise<void> {
    const db = await this.getDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(
        ["messages", "attachments"],
        "readwrite",
      );
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      for (const message of messages)
        transaction.objectStore("messages").put(message);
      for (const attachment of attachments) {
        transaction.objectStore("attachments").put(attachment);
      }
    });
  }

  async clearAccount(accountId: string): Promise<void> {
    const db = await this.getDatabase();
    const stores = ["accounts", "messages", "attachments"];
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(stores, "readwrite");
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.objectStore("accounts").delete(accountId);
      for (const storeName of ["messages", "attachments"] as const) {
        const store = transaction.objectStore(storeName);
        const request = store
          .index("accountId")
          .openCursor(IDBKeyRange.only(accountId));
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) return;
          cursor.delete();
          cursor.continue();
        };
      }
    });
  }

  private getAll<T>(db: IDBDatabase, storeName: string): Promise<T[]> {
    return new Promise((resolve, reject) => {
      const request = db
        .transaction(storeName, "readonly")
        .objectStore(storeName)
        .getAll();
      request.onsuccess = () => resolve((request.result as T[]) ?? []);
      request.onerror = () => reject(request.error);
    });
  }

  private getByIndex<T>(
    db: IDBDatabase,
    storeName: string,
    indexName: string,
    value: IDBValidKey,
  ): Promise<T[]> {
    return new Promise((resolve, reject) => {
      const request = db
        .transaction(storeName, "readonly")
        .objectStore(storeName)
        .index(indexName)
        .getAll(IDBKeyRange.only(value));
      request.onsuccess = () => resolve((request.result as T[]) ?? []);
      request.onerror = () => reject(request.error);
    });
  }

  private put<T extends object>(
    db: IDBDatabase,
    storeName: string,
    value: T,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = db
        .transaction(storeName, "readwrite")
        .objectStore(storeName)
        .put(value);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

export const emailStorage = new EmailStorageService();
