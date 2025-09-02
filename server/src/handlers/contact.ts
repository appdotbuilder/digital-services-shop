import { db } from '../db';
import { contactMessagesTable } from '../db/schema';
import { type ContactMessage, type CreateContactMessageInput } from '../schema';
import { eq, desc, and, SQL } from 'drizzle-orm';

export async function createContactMessage(input: CreateContactMessageInput): Promise<ContactMessage> {
  try {
    const result = await db.insert(contactMessagesTable)
      .values({
        name: input.name,
        email: input.email,
        subject: input.subject,
        message: input.message
      })
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('Contact message creation failed:', error);
    throw error;
  }
}

export async function getContactMessages(filters?: {
  is_read?: boolean;
  limit?: number;
  offset?: number;
}): Promise<ContactMessage[]> {
  try {
    const limit = filters?.limit || 50;
    const offset = filters?.offset || 0;

    // Build query based on filters
    if (filters?.is_read !== undefined) {
      const result = await db.select()
        .from(contactMessagesTable)
        .where(eq(contactMessagesTable.is_read, filters.is_read))
        .orderBy(desc(contactMessagesTable.created_at))
        .limit(limit)
        .offset(offset)
        .execute();
      return result;
    } else {
      const result = await db.select()
        .from(contactMessagesTable)
        .orderBy(desc(contactMessagesTable.created_at))
        .limit(limit)
        .offset(offset)
        .execute();
      return result;
    }
  } catch (error) {
    console.error('Failed to fetch contact messages:', error);
    throw error;
  }
}

export async function getContactMessageById(id: number): Promise<ContactMessage | null> {
  try {
    const result = await db.select()
      .from(contactMessagesTable)
      .where(eq(contactMessagesTable.id, id))
      .limit(1)
      .execute();

    return result.length > 0 ? result[0] : null;
  } catch (error) {
    console.error('Failed to fetch contact message:', error);
    throw error;
  }
}

export async function markMessageAsRead(id: number): Promise<ContactMessage> {
  try {
    const result = await db.update(contactMessagesTable)
      .set({ is_read: true })
      .where(eq(contactMessagesTable.id, id))
      .returning()
      .execute();

    if (result.length === 0) {
      throw new Error(`Contact message with id ${id} not found`);
    }

    return result[0];
  } catch (error) {
    console.error('Failed to mark message as read:', error);
    throw error;
  }
}

export async function markMessageAsUnread(id: number): Promise<ContactMessage> {
  try {
    const result = await db.update(contactMessagesTable)
      .set({ is_read: false })
      .where(eq(contactMessagesTable.id, id))
      .returning()
      .execute();

    if (result.length === 0) {
      throw new Error(`Contact message with id ${id} not found`);
    }

    return result[0];
  } catch (error) {
    console.error('Failed to mark message as unread:', error);
    throw error;
  }
}

export async function deleteContactMessage(id: number): Promise<{ success: boolean }> {
  try {
    const result = await db.delete(contactMessagesTable)
      .where(eq(contactMessagesTable.id, id))
      .returning()
      .execute();

    return { success: result.length > 0 };
  } catch (error) {
    console.error('Failed to delete contact message:', error);
    throw error;
  }
}

export async function getUnreadMessageCount(): Promise<{ count: number }> {
  try {
    const result = await db.select()
      .from(contactMessagesTable)
      .where(eq(contactMessagesTable.is_read, false))
      .execute();

    return { count: result.length };
  } catch (error) {
    console.error('Failed to get unread message count:', error);
    throw error;
  }
}