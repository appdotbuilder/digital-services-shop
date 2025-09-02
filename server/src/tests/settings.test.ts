import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { settingsTable } from '../db/schema';
import { type UpdateSettingInput } from '../schema';
import { 
  getSettings, 
  getSettingByKey, 
  updateSetting, 
  getPublicSettings, 
  initializeDefaultSettings, 
  deleteSetting 
} from '../handlers/settings';
import { eq } from 'drizzle-orm';

describe('Settings Handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  describe('getSettings', () => {
    it('should return all settings', async () => {
      // Create test settings
      await db.insert(settingsTable)
        .values([
          { key: 'site_name', value: 'Test Store', description: 'Site name' },
          { key: 'contact_email', value: 'test@example.com', description: 'Contact email' }
        ])
        .execute();

      const result = await getSettings();

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        key: 'site_name',
        value: 'Test Store',
        description: 'Site name'
      });
      expect(result[0].id).toBeDefined();
      expect(result[0].created_at).toBeInstanceOf(Date);
      expect(result[0].updated_at).toBeInstanceOf(Date);
    });

    it('should return empty array when no settings exist', async () => {
      const result = await getSettings();
      expect(result).toHaveLength(0);
    });
  });

  describe('getSettingByKey', () => {
    beforeEach(async () => {
      await db.insert(settingsTable)
        .values({ key: 'test_setting', value: 'test_value', description: 'Test description' })
        .execute();
    });

    it('should return setting by key', async () => {
      const result = await getSettingByKey('test_setting');

      expect(result).not.toBeNull();
      expect(result?.key).toBe('test_setting');
      expect(result?.value).toBe('test_value');
      expect(result?.description).toBe('Test description');
      expect(result?.id).toBeDefined();
      expect(result?.created_at).toBeInstanceOf(Date);
    });

    it('should return null when setting does not exist', async () => {
      const result = await getSettingByKey('nonexistent_key');
      expect(result).toBeNull();
    });
  });

  describe('updateSetting', () => {
    const updateInput: UpdateSettingInput = {
      key: 'test_setting',
      value: 'updated_value'
    };

    it('should update existing setting', async () => {
      // Create initial setting
      await db.insert(settingsTable)
        .values({ key: 'test_setting', value: 'original_value', description: 'Test' })
        .execute();

      const result = await updateSetting(updateInput);

      expect(result.key).toBe('test_setting');
      expect(result.value).toBe('updated_value');
      expect(result.updated_at).toBeInstanceOf(Date);

      // Verify in database
      const dbSetting = await db.select()
        .from(settingsTable)
        .where(eq(settingsTable.key, 'test_setting'))
        .execute();

      expect(dbSetting).toHaveLength(1);
      expect(dbSetting[0].value).toBe('updated_value');
    });

    it('should create new setting when key does not exist (upsert)', async () => {
      const result = await updateSetting(updateInput);

      expect(result.key).toBe('test_setting');
      expect(result.value).toBe('updated_value');
      expect(result.description).toBeNull();
      expect(result.id).toBeDefined();
      expect(result.created_at).toBeInstanceOf(Date);

      // Verify in database
      const dbSettings = await db.select()
        .from(settingsTable)
        .where(eq(settingsTable.key, 'test_setting'))
        .execute();

      expect(dbSettings).toHaveLength(1);
      expect(dbSettings[0].value).toBe('updated_value');
    });
  });

  describe('getPublicSettings', () => {
    beforeEach(async () => {
      await db.insert(settingsTable)
        .values([
          { key: 'site_name', value: 'Public Store', description: 'Public setting' },
          { key: 'contact_email', value: 'public@example.com', description: 'Public setting' },
          { key: 'admin_password_hash', value: 'secret_hash', description: 'Private setting' },
          { key: 'api_key', value: 'secret_key', description: 'Private setting' }
        ])
        .execute();
    });

    it('should return only public settings', async () => {
      const result = await getPublicSettings();

      expect(result).toEqual({
        site_name: 'Public Store',
        contact_email: 'public@example.com'
      });

      // Should not include private settings
      expect(result['admin_password_hash']).toBeUndefined();
      expect(result['api_key']).toBeUndefined();
    });

    it('should return empty object when no public settings exist', async () => {
      // Clear all settings
      await db.delete(settingsTable).execute();

      const result = await getPublicSettings();
      expect(result).toEqual({});
    });

    it('should include all defined public setting keys when they exist', async () => {
      // Add more public settings
      await db.insert(settingsTable)
        .values([
          { key: 'company_address', value: '123 Main St', description: 'Address' },
          { key: 'phone_number', value: '555-1234', description: 'Phone' },
          { key: 'social_media_facebook', value: 'https://facebook.com/store', description: 'Facebook' }
        ])
        .execute();

      const result = await getPublicSettings();

      expect(result['site_name']).toBe('Public Store');
      expect(result['contact_email']).toBe('public@example.com');
      expect(result['company_address']).toBe('123 Main St');
      expect(result['phone_number']).toBe('555-1234');
      expect(result['social_media_facebook']).toBe('https://facebook.com/store');
    });
  });

  describe('initializeDefaultSettings', () => {
    it('should create default settings', async () => {
      const result = await initializeDefaultSettings();

      expect(result.success).toBe(true);

      // Verify default settings were created
      const settings = await db.select().from(settingsTable).execute();
      
      expect(settings.length).toBeGreaterThan(0);

      const siteNameSetting = settings.find(s => s.key === 'site_name');
      expect(siteNameSetting).toBeDefined();
      expect(siteNameSetting?.value).toBe('Digital Store');

      const contactEmailSetting = settings.find(s => s.key === 'contact_email');
      expect(contactEmailSetting).toBeDefined();
      expect(contactEmailSetting?.value).toBe('contact@example.com');
    });

    it('should not duplicate existing settings', async () => {
      // Create existing setting
      await db.insert(settingsTable)
        .values({ key: 'site_name', value: 'Existing Store', description: 'Existing' })
        .execute();

      const result = await initializeDefaultSettings();

      expect(result.success).toBe(true);

      // Verify existing setting was not overwritten
      const siteNameSettings = await db.select()
        .from(settingsTable)
        .where(eq(settingsTable.key, 'site_name'))
        .execute();

      expect(siteNameSettings).toHaveLength(1);
      expect(siteNameSettings[0].value).toBe('Existing Store');
    });

    it('should create all expected default settings', async () => {
      await initializeDefaultSettings();

      const settings = await db.select().from(settingsTable).execute();
      const settingKeys = settings.map(s => s.key);

      const expectedKeys = [
        'site_name',
        'site_description',
        'contact_email',
        'company_address',
        'phone_number',
        'business_hours',
        'max_file_upload_size',
        'email_notifications_enabled'
      ];

      expectedKeys.forEach(key => {
        expect(settingKeys).toContain(key);
      });
    });
  });

  describe('deleteSetting', () => {
    beforeEach(async () => {
      await db.insert(settingsTable)
        .values([
          { key: 'deletable_setting', value: 'can_delete', description: 'Safe to delete' },
          { key: 'site_name', value: 'Critical Store', description: 'Critical setting' }
        ])
        .execute();
    });

    it('should delete non-critical setting', async () => {
      const result = await deleteSetting('deletable_setting');

      expect(result.success).toBe(true);

      // Verify setting was deleted
      const deletedSetting = await db.select()
        .from(settingsTable)
        .where(eq(settingsTable.key, 'deletable_setting'))
        .execute();

      expect(deletedSetting).toHaveLength(0);
    });

    it('should prevent deletion of critical system settings', async () => {
      await expect(deleteSetting('site_name')).rejects.toThrow(/cannot delete critical system setting/i);

      // Verify setting still exists
      const setting = await db.select()
        .from(settingsTable)
        .where(eq(settingsTable.key, 'site_name'))
        .execute();

      expect(setting).toHaveLength(1);
      expect(setting[0].value).toBe('Critical Store');
    });

    it('should return success false when setting does not exist', async () => {
      const result = await deleteSetting('nonexistent_setting');

      expect(result.success).toBe(false);
    });

    it('should prevent deletion of all critical settings', async () => {
      const criticalSettings = [
        'site_name',
        'contact_email',
        'max_file_upload_size',
        'email_notifications_enabled'
      ];

      for (const key of criticalSettings) {
        await expect(deleteSetting(key)).rejects.toThrow(/cannot delete critical system setting/i);
      }
    });
  });
});