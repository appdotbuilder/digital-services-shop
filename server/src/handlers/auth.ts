import { db } from '../db';
import { usersTable } from '../db/schema';
import { type CreateUserInput, type LoginInput, type User } from '../schema';
import { eq } from 'drizzle-orm';

// Simple password hashing using Bun's built-in crypto
const hashPassword = async (password: string): Promise<string> => {
  return await Bun.password.hash(password);
};

const verifyPassword = async (password: string, hash: string): Promise<boolean> => {
  return await Bun.password.verify(password, hash);
};

// Simple token generation using base64 encoding
const generateToken = async (user: User): Promise<string> => {
  const payload = {
    sub: user.id.toString(),
    email: user.email,
    role: user.role,
    exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours
  };
  
  // Create a simple token by encoding the payload
  const token = btoa(JSON.stringify(payload));
  return token;
};

export async function registerUser(input: CreateUserInput): Promise<User> {
  try {
    // Check if user with email already exists
    const existingUser = await db.select()
      .from(usersTable)
      .where(eq(usersTable.email, input.email))
      .limit(1)
      .execute();

    if (existingUser.length > 0) {
      throw new Error('User with this email already exists');
    }

    // Hash the password
    const passwordHash = await hashPassword(input.password);

    // Create user record
    const result = await db.insert(usersTable)
      .values({
        email: input.email,
        password_hash: passwordHash,
        first_name: input.first_name,
        last_name: input.last_name,
        role: input.role
      })
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('User registration failed:', error);
    throw error;
  }
}

export async function loginUser(input: LoginInput): Promise<{ user: User; token: string }> {
  try {
    // Find user by email
    const users = await db.select()
      .from(usersTable)
      .where(eq(usersTable.email, input.email))
      .limit(1)
      .execute();

    if (users.length === 0) {
      throw new Error('Invalid email or password');
    }

    const user = users[0];

    // Check if user is active
    if (!user.is_active) {
      throw new Error('User account is deactivated');
    }

    // Verify password
    const isPasswordValid = await verifyPassword(input.password, user.password_hash);
    if (!isPasswordValid) {
      throw new Error('Invalid email or password');
    }

    // Generate JWT token
    const token = await generateToken(user);

    return {
      user,
      token
    };
  } catch (error) {
    console.error('User login failed:', error);
    throw error;
  }
}

export async function getCurrentUser(userId: number): Promise<User | null> {
  try {
    const users = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1)
      .execute();

    return users.length > 0 ? users[0] : null;
  } catch (error) {
    console.error('Get current user failed:', error);
    throw error;
  }
}