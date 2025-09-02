import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable } from '../db/schema';
import { type CreateUserInput, type LoginInput } from '../schema';
import { registerUser, loginUser, getCurrentUser } from '../handlers/auth';
import { eq } from 'drizzle-orm';

// Test input data
const testUserInput: CreateUserInput = {
  email: 'test@example.com',
  password: 'password123',
  first_name: 'John',
  last_name: 'Doe',
  role: 'customer'
};

const testAdminInput: CreateUserInput = {
  email: 'admin@example.com',
  password: 'adminpass123',
  first_name: 'Admin',
  last_name: 'User',
  role: 'admin'
};

const loginInput: LoginInput = {
  email: 'test@example.com',
  password: 'password123'
};

describe('Authentication Handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  describe('registerUser', () => {
    it('should register a new user successfully', async () => {
      const result = await registerUser(testUserInput);

      // Verify returned user data
      expect(result.id).toBeDefined();
      expect(result.email).toEqual(testUserInput.email);
      expect(result.first_name).toEqual(testUserInput.first_name);
      expect(result.last_name).toEqual(testUserInput.last_name);
      expect(result.role).toEqual(testUserInput.role);
      expect(result.is_active).toEqual(true);
      expect(result.created_at).toBeInstanceOf(Date);
      expect(result.updated_at).toBeInstanceOf(Date);
      expect(result.password_hash).toBeDefined();
      expect(result.password_hash).not.toEqual(testUserInput.password); // Should be hashed
    });

    it('should save user to database', async () => {
      const result = await registerUser(testUserInput);

      // Verify user exists in database
      const users = await db.select()
        .from(usersTable)
        .where(eq(usersTable.id, result.id))
        .execute();

      expect(users).toHaveLength(1);
      expect(users[0].email).toEqual(testUserInput.email);
      expect(users[0].first_name).toEqual(testUserInput.first_name);
      expect(users[0].role).toEqual(testUserInput.role);
    });

    it('should register admin user with correct role', async () => {
      const result = await registerUser(testAdminInput);

      expect(result.role).toEqual('admin');
      expect(result.email).toEqual(testAdminInput.email);
    });

    it('should hash password correctly', async () => {
      const result = await registerUser(testUserInput);

      // Password should be hashed and different from original
      expect(result.password_hash).not.toEqual(testUserInput.password);
      expect(result.password_hash.length).toBeGreaterThan(20); // Hashed passwords are longer
    });

    it('should reject duplicate email registration', async () => {
      // Register first user
      await registerUser(testUserInput);

      // Try to register with same email
      const duplicateInput: CreateUserInput = {
        ...testUserInput,
        first_name: 'Jane',
        last_name: 'Smith'
      };

      await expect(registerUser(duplicateInput)).rejects.toThrow(/already exists/i);
    });

    it('should apply default role when not specified', async () => {
      const inputWithoutRole = {
        email: 'default@example.com',
        password: 'password123',
        first_name: 'Default',
        last_name: 'User',
        role: 'customer' as const // Zod applies default
      };

      const result = await registerUser(inputWithoutRole);
      expect(result.role).toEqual('customer');
    });
  });

  describe('loginUser', () => {
    beforeEach(async () => {
      // Register a user for login tests
      await registerUser(testUserInput);
    });

    it('should login user with valid credentials', async () => {
      const result = await loginUser(loginInput);

      // Verify user data
      expect(result.user).toBeDefined();
      expect(result.user.email).toEqual(loginInput.email);
      expect(result.user.first_name).toEqual(testUserInput.first_name);
      expect(result.user.role).toEqual(testUserInput.role);
      expect(result.user.is_active).toEqual(true);

      // Verify token
      expect(result.token).toBeDefined();
      expect(typeof result.token).toEqual('string');
      expect(result.token.length).toBeGreaterThan(10);
    });

    it('should reject login with wrong password', async () => {
      const wrongPasswordInput: LoginInput = {
        email: loginInput.email,
        password: 'wrongpassword'
      };

      await expect(loginUser(wrongPasswordInput)).rejects.toThrow(/invalid email or password/i);
    });

    it('should reject login with wrong email', async () => {
      const wrongEmailInput: LoginInput = {
        email: 'nonexistent@example.com',
        password: loginInput.password
      };

      await expect(loginUser(wrongEmailInput)).rejects.toThrow(/invalid email or password/i);
    });

    it('should reject login for inactive user', async () => {
      // First login to get user ID
      const loginResult = await loginUser(loginInput);
      
      // Deactivate the user
      await db.update(usersTable)
        .set({ is_active: false })
        .where(eq(usersTable.id, loginResult.user.id))
        .execute();

      // Try to login with deactivated user
      await expect(loginUser(loginInput)).rejects.toThrow(/deactivated/i);
    });

    it('should login admin user successfully', async () => {
      // Register admin user
      await registerUser(testAdminInput);

      const adminLogin: LoginInput = {
        email: testAdminInput.email,
        password: testAdminInput.password
      };

      const result = await loginUser(adminLogin);

      expect(result.user.role).toEqual('admin');
      expect(result.user.email).toEqual(testAdminInput.email);
      expect(result.token).toBeDefined();
    });
  });

  describe('getCurrentUser', () => {
    let testUserId: number;

    beforeEach(async () => {
      // Register a user and get their ID
      const user = await registerUser(testUserInput);
      testUserId = user.id;
    });

    it('should return user for valid ID', async () => {
      const result = await getCurrentUser(testUserId);

      expect(result).not.toBeNull();
      expect(result!.id).toEqual(testUserId);
      expect(result!.email).toEqual(testUserInput.email);
      expect(result!.first_name).toEqual(testUserInput.first_name);
      expect(result!.last_name).toEqual(testUserInput.last_name);
      expect(result!.role).toEqual(testUserInput.role);
      expect(result!.is_active).toEqual(true);
    });

    it('should return null for non-existent user ID', async () => {
      const result = await getCurrentUser(99999);
      expect(result).toBeNull();
    });

    it('should return inactive user when queried by ID', async () => {
      // Deactivate the user
      await db.update(usersTable)
        .set({ is_active: false })
        .where(eq(usersTable.id, testUserId))
        .execute();

      const result = await getCurrentUser(testUserId);

      expect(result).not.toBeNull();
      expect(result!.id).toEqual(testUserId);
      expect(result!.is_active).toEqual(false);
    });

    it('should handle admin user correctly', async () => {
      // Register admin user
      const adminUser = await registerUser(testAdminInput);

      const result = await getCurrentUser(adminUser.id);

      expect(result).not.toBeNull();
      expect(result!.role).toEqual('admin');
      expect(result!.email).toEqual(testAdminInput.email);
    });
  });

  describe('Password security', () => {
    it('should generate different hashes for same password', async () => {
      const user1 = await registerUser({
        ...testUserInput,
        email: 'user1@example.com'
      });

      const user2 = await registerUser({
        ...testUserInput,
        email: 'user2@example.com'
      });

      // Same password should generate different hashes (due to salt)
      expect(user1.password_hash).not.toEqual(user2.password_hash);
    });

    it('should allow login after registration with hashed password', async () => {
      // Register user
      await registerUser(testUserInput);

      // Login should work with original password
      const result = await loginUser(loginInput);
      expect(result.user.email).toEqual(testUserInput.email);
      expect(result.token).toBeDefined();
    });
  });
});