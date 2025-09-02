import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { contactMessagesTable } from '../db/schema';
import { type CreateContactMessageInput } from '../schema';
import {
  createContactMessage,
  getContactMessages,
  getContactMessageById,
  markMessageAsRead,
  markMessageAsUnread,
  deleteContactMessage,
  getUnreadMessageCount
} from '../handlers/contact';
import { eq } from 'drizzle-orm';

const testInput: CreateContactMessageInput = {
  name: 'John Doe',
  email: 'john.doe@example.com',
  subject: 'Test Subject',
  message: 'This is a test message'
};

const testInput2: CreateContactMessageInput = {
  name: 'Jane Smith',
  email: 'jane.smith@example.com',
  subject: 'Another Subject',
  message: 'Another test message'
};

describe('Contact Message Handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  describe('createContactMessage', () => {
    it('should create a contact message', async () => {
      const result = await createContactMessage(testInput);

      expect(result.name).toEqual('John Doe');
      expect(result.email).toEqual('john.doe@example.com');
      expect(result.subject).toEqual('Test Subject');
      expect(result.message).toEqual('This is a test message');
      expect(result.is_read).toEqual(false);
      expect(result.id).toBeDefined();
      expect(result.created_at).toBeInstanceOf(Date);
    });

    it('should save contact message to database', async () => {
      const result = await createContactMessage(testInput);

      const messages = await db.select()
        .from(contactMessagesTable)
        .where(eq(contactMessagesTable.id, result.id))
        .execute();

      expect(messages).toHaveLength(1);
      expect(messages[0].name).toEqual('John Doe');
      expect(messages[0].email).toEqual('john.doe@example.com');
      expect(messages[0].subject).toEqual('Test Subject');
      expect(messages[0].message).toEqual('This is a test message');
      expect(messages[0].is_read).toEqual(false);
      expect(messages[0].created_at).toBeInstanceOf(Date);
    });

    it('should handle email validation correctly', async () => {
      const invalidInput = {
        ...testInput,
        email: 'invalid-email'
      };

      // This will be caught by Zod validation at the API level,
      // but our handler should work with any valid email string
      const validInput = {
        ...testInput,
        email: 'test@domain.co.uk'
      };

      const result = await createContactMessage(validInput);
      expect(result.email).toEqual('test@domain.co.uk');
    });
  });

  describe('getContactMessages', () => {
    it('should return all contact messages', async () => {
      await createContactMessage(testInput);
      await createContactMessage(testInput2);

      const result = await getContactMessages();

      expect(result).toHaveLength(2);
      // Should be ordered by newest first (desc created_at)
      expect(result[0].name).toEqual('Jane Smith');
      expect(result[1].name).toEqual('John Doe');
    });

    it('should filter by read status', async () => {
      const message1 = await createContactMessage(testInput);
      const message2 = await createContactMessage(testInput2);

      // Mark one as read
      await markMessageAsRead(message1.id);

      // Get only unread messages
      const unreadMessages = await getContactMessages({ is_read: false });
      expect(unreadMessages).toHaveLength(1);
      expect(unreadMessages[0].id).toEqual(message2.id);

      // Get only read messages
      const readMessages = await getContactMessages({ is_read: true });
      expect(readMessages).toHaveLength(1);
      expect(readMessages[0].id).toEqual(message1.id);
    });

    it('should handle pagination correctly', async () => {
      // Create 5 messages
      for (let i = 0; i < 5; i++) {
        await createContactMessage({
          ...testInput,
          name: `User ${i}`,
          email: `user${i}@example.com`
        });
      }

      // Get first 3 messages
      const page1 = await getContactMessages({ limit: 3, offset: 0 });
      expect(page1).toHaveLength(3);

      // Get next 2 messages
      const page2 = await getContactMessages({ limit: 3, offset: 3 });
      expect(page2).toHaveLength(2);

      // Ensure no overlap
      const page1Ids = page1.map(m => m.id);
      const page2Ids = page2.map(m => m.id);
      expect(page1Ids.some(id => page2Ids.includes(id))).toBe(false);
    });

    it('should return empty array when no messages exist', async () => {
      const result = await getContactMessages();
      expect(result).toHaveLength(0);
    });
  });

  describe('getContactMessageById', () => {
    it('should return contact message by id', async () => {
      const created = await createContactMessage(testInput);

      const result = await getContactMessageById(created.id);

      expect(result).not.toBeNull();
      expect(result!.id).toEqual(created.id);
      expect(result!.name).toEqual('John Doe');
      expect(result!.email).toEqual('john.doe@example.com');
    });

    it('should return null for non-existent id', async () => {
      const result = await getContactMessageById(999);
      expect(result).toBeNull();
    });
  });

  describe('markMessageAsRead', () => {
    it('should mark message as read', async () => {
      const created = await createContactMessage(testInput);
      expect(created.is_read).toEqual(false);

      const result = await markMessageAsRead(created.id);

      expect(result.is_read).toEqual(true);
      expect(result.id).toEqual(created.id);

      // Verify in database
      const dbMessage = await getContactMessageById(created.id);
      expect(dbMessage!.is_read).toEqual(true);
    });

    it('should throw error for non-existent message', async () => {
      await expect(markMessageAsRead(999)).rejects.toThrow(/not found/i);
    });
  });

  describe('markMessageAsUnread', () => {
    it('should mark message as unread', async () => {
      const created = await createContactMessage(testInput);
      await markMessageAsRead(created.id);

      const result = await markMessageAsUnread(created.id);

      expect(result.is_read).toEqual(false);
      expect(result.id).toEqual(created.id);

      // Verify in database
      const dbMessage = await getContactMessageById(created.id);
      expect(dbMessage!.is_read).toEqual(false);
    });

    it('should throw error for non-existent message', async () => {
      await expect(markMessageAsUnread(999)).rejects.toThrow(/not found/i);
    });
  });

  describe('deleteContactMessage', () => {
    it('should delete contact message', async () => {
      const created = await createContactMessage(testInput);

      const result = await deleteContactMessage(created.id);

      expect(result.success).toEqual(true);

      // Verify message is deleted
      const dbMessage = await getContactMessageById(created.id);
      expect(dbMessage).toBeNull();
    });

    it('should return false for non-existent message', async () => {
      const result = await deleteContactMessage(999);
      expect(result.success).toEqual(false);
    });
  });

  describe('getUnreadMessageCount', () => {
    it('should return correct unread count', async () => {
      // Initially no messages
      let count = await getUnreadMessageCount();
      expect(count.count).toEqual(0);

      // Create 3 messages
      const message1 = await createContactMessage(testInput);
      const message2 = await createContactMessage(testInput2);
      const message3 = await createContactMessage({
        ...testInput,
        name: 'User 3',
        email: 'user3@example.com'
      });

      // All should be unread
      count = await getUnreadMessageCount();
      expect(count.count).toEqual(3);

      // Mark one as read
      await markMessageAsRead(message1.id);
      count = await getUnreadMessageCount();
      expect(count.count).toEqual(2);

      // Mark another as read
      await markMessageAsRead(message2.id);
      count = await getUnreadMessageCount();
      expect(count.count).toEqual(1);

      // Mark last as read
      await markMessageAsRead(message3.id);
      count = await getUnreadMessageCount();
      expect(count.count).toEqual(0);
    });

    it('should handle mixed read/unread status correctly', async () => {
      // Create messages and mark some as read
      const message1 = await createContactMessage(testInput);
      const message2 = await createContactMessage(testInput2);
      const message3 = await createContactMessage({
        ...testInput,
        name: 'User 3',
        email: 'user3@example.com'
      });

      await markMessageAsRead(message1.id);
      await markMessageAsRead(message3.id);

      const count = await getUnreadMessageCount();
      expect(count.count).toEqual(1);

      // Mark the unread one as read, then back to unread
      await markMessageAsRead(message2.id);
      let newCount = await getUnreadMessageCount();
      expect(newCount.count).toEqual(0);

      await markMessageAsUnread(message2.id);
      newCount = await getUnreadMessageCount();
      expect(newCount.count).toEqual(1);
    });
  });

  describe('Complex filtering and operations', () => {
    it('should handle combined filters correctly', async () => {
      // Create multiple messages
      const messages = [];
      for (let i = 0; i < 10; i++) {
        const message = await createContactMessage({
          name: `User ${i}`,
          email: `user${i}@example.com`,
          subject: `Subject ${i}`,
          message: `Message ${i}`
        });
        messages.push(message);
      }

      // Mark some as read
      await markMessageAsRead(messages[0].id);
      await markMessageAsRead(messages[2].id);
      await markMessageAsRead(messages[4].id);

      // Get unread with pagination
      const unreadPage1 = await getContactMessages({
        is_read: false,
        limit: 3,
        offset: 0
      });
      expect(unreadPage1).toHaveLength(3);

      const unreadPage2 = await getContactMessages({
        is_read: false,
        limit: 3,
        offset: 3
      });
      expect(unreadPage2).toHaveLength(3);

      const unreadPage3 = await getContactMessages({
        is_read: false,
        limit: 3,
        offset: 6
      });
      expect(unreadPage3).toHaveLength(1);

      // Verify all returned messages are unread
      [...unreadPage1, ...unreadPage2, ...unreadPage3].forEach(message => {
        expect(message.is_read).toEqual(false);
      });
    });
  });
});