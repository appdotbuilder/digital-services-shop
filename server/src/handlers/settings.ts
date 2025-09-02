import { db } from '../db';
import { settingsTable } from '../db/schema';
import { type Setting, type UpdateSettingInput } from '../schema';
import { eq } from 'drizzle-orm';

export async function getSettings(): Promise<Setting[]> {
  try {
    const results = await db.select()
      .from(settingsTable)
      .execute();

    return results.map(setting => ({
      ...setting,
      // No numeric conversions needed for settings table
    }));
  } catch (error) {
    console.error('Failed to fetch settings:', error);
    throw error;
  }
}

export async function getSettingByKey(key: string): Promise<Setting | null> {
  try {
    const results = await db.select()
      .from(settingsTable)
      .where(eq(settingsTable.key, key))
      .execute();

    return results.length > 0 ? results[0] : null;
  } catch (error) {
    console.error('Failed to fetch setting by key:', error);
    throw error;
  }
}

export async function updateSetting(input: UpdateSettingInput): Promise<Setting> {
  try {
    // Try to update existing setting first
    const updateResult = await db.update(settingsTable)
      .set({
        value: input.value,
        updated_at: new Date()
      })
      .where(eq(settingsTable.key, input.key))
      .returning()
      .execute();

    if (updateResult.length > 0) {
      return updateResult[0];
    }

    // If no existing setting found, create new one (upsert behavior)
    const insertResult = await db.insert(settingsTable)
      .values({
        key: input.key,
        value: input.value,
        description: null
      })
      .returning()
      .execute();

    return insertResult[0];
  } catch (error) {
    console.error('Failed to update setting:', error);
    throw error;
  }
}

export async function getPublicSettings(): Promise<Record<string, string>> {
  try {
    // Define which settings are safe to expose publicly
    const publicKeys = [
      'site_name',
      'site_description', 
      'contact_email',
      'company_address',
      'phone_number',
      'business_hours',
      'social_media_facebook',
      'social_media_twitter',
      'social_media_instagram'
    ];

    const results = await db.select()
      .from(settingsTable)
      .execute();

    // Filter to only include public settings and convert to key-value object
    const publicSettings: Record<string, string> = {};
    
    results.forEach(setting => {
      if (publicKeys.includes(setting.key)) {
        publicSettings[setting.key] = setting.value;
      }
    });

    return publicSettings;
  } catch (error) {
    console.error('Failed to fetch public settings:', error);
    throw error;
  }
}

export async function initializeDefaultSettings(): Promise<{ success: boolean }> {
  try {
    const defaultSettings = [
      { key: 'site_name', value: 'Digital Store', description: 'The name of the website' },
      { key: 'site_description', value: 'Your one-stop shop for digital products', description: 'Website description for SEO' },
      { key: 'contact_email', value: 'contact@example.com', description: 'Primary contact email' },
      { key: 'company_address', value: '123 Main St, City, State 12345', description: 'Company physical address' },
      { key: 'phone_number', value: '+1 (555) 123-4567', description: 'Company phone number' },
      { key: 'business_hours', value: 'Mon-Fri 9AM-5PM EST', description: 'Business operating hours' },
      { key: 'max_file_upload_size', value: '50', description: 'Maximum file upload size in MB (admin only)' },
      { key: 'email_notifications_enabled', value: 'true', description: 'Enable email notifications (admin only)' }
    ];

    for (const setting of defaultSettings) {
      // Check if setting already exists
      const existing = await db.select()
        .from(settingsTable)
        .where(eq(settingsTable.key, setting.key))
        .execute();

      // Only create if it doesn't exist
      if (existing.length === 0) {
        await db.insert(settingsTable)
          .values({
            key: setting.key,
            value: setting.value,
            description: setting.description
          })
          .execute();
      }
    }

    return { success: true };
  } catch (error) {
    console.error('Failed to initialize default settings:', error);
    throw error;
  }
}

export async function deleteSetting(key: string): Promise<{ success: boolean }> {
  try {
    // Define critical system settings that cannot be deleted
    const criticalSettings = [
      'site_name',
      'contact_email',
      'max_file_upload_size',
      'email_notifications_enabled'
    ];

    if (criticalSettings.includes(key)) {
      throw new Error(`Cannot delete critical system setting: ${key}`);
    }

    const result = await db.delete(settingsTable)
      .where(eq(settingsTable.key, key))
      .returning()
      .execute();

    return { success: result.length > 0 };
  } catch (error) {
    console.error('Failed to delete setting:', error);
    throw error;
  }
}