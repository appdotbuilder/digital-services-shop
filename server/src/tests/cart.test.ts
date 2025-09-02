import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, categoriesTable, productsTable, cartItemsTable } from '../db/schema';
import { type AddToCartInput, type UpdateCartItemInput } from '../schema';
import { 
  addToCart, 
  getCartItems, 
  updateCartItem, 
  removeFromCart, 
  clearCart, 
  getCartSummary 
} from '../handlers/cart';
import { eq, and } from 'drizzle-orm';

// Test data setup
let testUserId: number;
let testUser2Id: number;
let testCategoryId: number;
let testProductId: number;
let testProduct2Id: number;

describe('Cart Handlers', () => {
  beforeEach(async () => {
    await createDB();

    // Create test user
    const userResult = await db.insert(usersTable)
      .values({
        email: 'test@example.com',
        password_hash: 'hashedpassword',
        first_name: 'Test',
        last_name: 'User',
        role: 'customer'
      })
      .returning()
      .execute();
    testUserId = userResult[0].id;

    // Create second test user
    const user2Result = await db.insert(usersTable)
      .values({
        email: 'test2@example.com',
        password_hash: 'hashedpassword2',
        first_name: 'Test2',
        last_name: 'User2',
        role: 'customer'
      })
      .returning()
      .execute();
    testUser2Id = user2Result[0].id;

    // Create test category
    const categoryResult = await db.insert(categoriesTable)
      .values({
        name: 'Test Category',
        description: 'A test category',
        slug: 'test-category'
      })
      .returning()
      .execute();
    testCategoryId = categoryResult[0].id;

    // Create test products
    const productResult = await db.insert(productsTable)
      .values({
        name: 'Test Product',
        description: 'A test product',
        price: '29.99',
        type: 'digital_product',
        category_id: testCategoryId,
        image_url: 'https://example.com/image.jpg',
        stock_quantity: 10
      })
      .returning()
      .execute();
    testProductId = productResult[0].id;

    const product2Result = await db.insert(productsTable)
      .values({
        name: 'Test Service',
        description: 'A test service',
        price: '49.99',
        type: 'service',
        category_id: testCategoryId,
        stock_quantity: null
      })
      .returning()
      .execute();
    testProduct2Id = product2Result[0].id;
  });

  afterEach(resetDB);

  describe('addToCart', () => {
    it('should add new item to cart', async () => {
      const input: AddToCartInput = {
        user_id: testUserId,
        product_id: testProductId,
        quantity: 2
      };

      const result = await addToCart(input);

      expect(result.user_id).toBe(testUserId);
      expect(result.product_id).toBe(testProductId);
      expect(result.quantity).toBe(2);
      expect(result.id).toBeDefined();
      expect(result.created_at).toBeInstanceOf(Date);
      expect(result.updated_at).toBeInstanceOf(Date);
    });

    it('should update quantity if item already exists in cart', async () => {
      // Add item first time
      const input: AddToCartInput = {
        user_id: testUserId,
        product_id: testProductId,
        quantity: 2
      };
      await addToCart(input);

      // Add same item again
      const input2: AddToCartInput = {
        user_id: testUserId,
        product_id: testProductId,
        quantity: 3
      };
      const result = await addToCart(input2);

      expect(result.quantity).toBe(5); // 2 + 3
    });

    it('should save item to database', async () => {
      const input: AddToCartInput = {
        user_id: testUserId,
        product_id: testProductId,
        quantity: 1
      };

      const result = await addToCart(input);

      const cartItems = await db.select()
        .from(cartItemsTable)
        .where(eq(cartItemsTable.id, result.id))
        .execute();

      expect(cartItems).toHaveLength(1);
      expect(cartItems[0].user_id).toBe(testUserId);
      expect(cartItems[0].product_id).toBe(testProductId);
      expect(cartItems[0].quantity).toBe(1);
    });

    it('should throw error for non-existent user', async () => {
      const input: AddToCartInput = {
        user_id: 99999,
        product_id: testProductId,
        quantity: 1
      };

      await expect(addToCart(input)).rejects.toThrow(/User with id 99999 not found/i);
    });

    it('should throw error for non-existent product', async () => {
      const input: AddToCartInput = {
        user_id: testUserId,
        product_id: 99999,
        quantity: 1
      };

      await expect(addToCart(input)).rejects.toThrow(/Product with id 99999 not found/i);
    });
  });

  describe('getCartItems', () => {
    it('should return empty array for user with no cart items', async () => {
      const result = await getCartItems(testUserId);
      expect(result).toHaveLength(0);
    });

    it('should return cart items with product details', async () => {
      // Add items to cart
      await addToCart({
        user_id: testUserId,
        product_id: testProductId,
        quantity: 2
      });
      await addToCart({
        user_id: testUserId,
        product_id: testProduct2Id,
        quantity: 1
      });

      const result = await getCartItems(testUserId);

      expect(result).toHaveLength(2);
      
      const item1 = result.find(item => item.product_id === testProductId);
      expect(item1).toBeDefined();
      expect(item1!.quantity).toBe(2);
      expect(item1!.product.name).toBe('Test Product');
      expect(item1!.product.price).toBe(29.99);
      expect(typeof item1!.product.price).toBe('number');
      expect(item1!.product.type).toBe('digital_product');

      const item2 = result.find(item => item.product_id === testProduct2Id);
      expect(item2).toBeDefined();
      expect(item2!.quantity).toBe(1);
      expect(item2!.product.name).toBe('Test Service');
      expect(item2!.product.price).toBe(49.99);
    });

    it('should only return items for specified user', async () => {
      // Add items for both users
      await addToCart({
        user_id: testUserId,
        product_id: testProductId,
        quantity: 1
      });
      await addToCart({
        user_id: testUser2Id,
        product_id: testProduct2Id,
        quantity: 1
      });

      const user1Items = await getCartItems(testUserId);
      const user2Items = await getCartItems(testUser2Id);

      expect(user1Items).toHaveLength(1);
      expect(user1Items[0].product_id).toBe(testProductId);

      expect(user2Items).toHaveLength(1);
      expect(user2Items[0].product_id).toBe(testProduct2Id);
    });
  });

  describe('updateCartItem', () => {
    it('should update cart item quantity', async () => {
      // Add item to cart first
      const cartItem = await addToCart({
        user_id: testUserId,
        product_id: testProductId,
        quantity: 2
      });

      const input: UpdateCartItemInput = {
        id: cartItem.id,
        quantity: 5
      };

      const result = await updateCartItem(input);

      expect(result.id).toBe(cartItem.id);
      expect(result.quantity).toBe(5);
      expect(result.updated_at).toBeInstanceOf(Date);
    });

    it('should save updated quantity to database', async () => {
      const cartItem = await addToCart({
        user_id: testUserId,
        product_id: testProductId,
        quantity: 1
      });

      await updateCartItem({
        id: cartItem.id,
        quantity: 3
      });

      const updatedItem = await db.select()
        .from(cartItemsTable)
        .where(eq(cartItemsTable.id, cartItem.id))
        .execute();

      expect(updatedItem[0].quantity).toBe(3);
    });

    it('should throw error for non-existent cart item', async () => {
      const input: UpdateCartItemInput = {
        id: 99999,
        quantity: 1
      };

      await expect(updateCartItem(input)).rejects.toThrow(/Cart item with id 99999 not found/i);
    });
  });

  describe('removeFromCart', () => {
    it('should remove cart item successfully', async () => {
      const cartItem = await addToCart({
        user_id: testUserId,
        product_id: testProductId,
        quantity: 1
      });

      const result = await removeFromCart(cartItem.id, testUserId);

      expect(result.success).toBe(true);

      // Verify item is deleted from database
      const deletedItem = await db.select()
        .from(cartItemsTable)
        .where(eq(cartItemsTable.id, cartItem.id))
        .execute();

      expect(deletedItem).toHaveLength(0);
    });

    it('should throw error if item does not belong to user', async () => {
      const cartItem = await addToCart({
        user_id: testUserId,
        product_id: testProductId,
        quantity: 1
      });

      await expect(removeFromCart(cartItem.id, testUser2Id)).rejects.toThrow(/not found or does not belong to user/i);
    });

    it('should throw error for non-existent item', async () => {
      await expect(removeFromCart(99999, testUserId)).rejects.toThrow(/not found or does not belong to user/i);
    });
  });

  describe('clearCart', () => {
    it('should remove all items from user cart', async () => {
      // Add multiple items
      await addToCart({
        user_id: testUserId,
        product_id: testProductId,
        quantity: 1
      });
      await addToCart({
        user_id: testUserId,
        product_id: testProduct2Id,
        quantity: 2
      });

      const result = await clearCart(testUserId);

      expect(result.success).toBe(true);

      // Verify all items are deleted
      const remainingItems = await db.select()
        .from(cartItemsTable)
        .where(eq(cartItemsTable.user_id, testUserId))
        .execute();

      expect(remainingItems).toHaveLength(0);
    });

    it('should only clear items for specified user', async () => {
      // Add items for both users
      await addToCart({
        user_id: testUserId,
        product_id: testProductId,
        quantity: 1
      });
      await addToCart({
        user_id: testUser2Id,
        product_id: testProduct2Id,
        quantity: 1
      });

      await clearCart(testUserId);

      // User 1 should have no items
      const user1Items = await db.select()
        .from(cartItemsTable)
        .where(eq(cartItemsTable.user_id, testUserId))
        .execute();
      expect(user1Items).toHaveLength(0);

      // User 2 should still have items
      const user2Items = await db.select()
        .from(cartItemsTable)
        .where(eq(cartItemsTable.user_id, testUser2Id))
        .execute();
      expect(user2Items).toHaveLength(1);
    });

    it('should succeed even if cart is already empty', async () => {
      const result = await clearCart(testUserId);
      expect(result.success).toBe(true);
    });
  });

  describe('getCartSummary', () => {
    it('should return empty summary for empty cart', async () => {
      const result = await getCartSummary(testUserId);

      expect(result.totalItems).toBe(0);
      expect(result.totalAmount).toBe(0);
      expect(result.items).toHaveLength(0);
    });

    it('should calculate correct totals and item details', async () => {
      // Add items to cart
      await addToCart({
        user_id: testUserId,
        product_id: testProductId,  // $29.99
        quantity: 2
      });
      await addToCart({
        user_id: testUserId,
        product_id: testProduct2Id, // $49.99
        quantity: 1
      });

      const result = await getCartSummary(testUserId);

      expect(result.totalItems).toBe(3); // 2 + 1
      expect(result.totalAmount).toBeCloseTo(109.97, 2); // (29.99 * 2) + (49.99 * 1)
      expect(result.items).toHaveLength(2);

      const item1 = result.items.find(item => item.name === 'Test Product');
      expect(item1).toBeDefined();
      expect(item1!.quantity).toBe(2);
      expect(item1!.price).toBe(29.99);
      expect(item1!.total).toBeCloseTo(59.98, 2);

      const item2 = result.items.find(item => item.name === 'Test Service');
      expect(item2).toBeDefined();
      expect(item2!.quantity).toBe(1);
      expect(item2!.price).toBe(49.99);
      expect(item2!.total).toBeCloseTo(49.99, 2);
    });

    it('should only include items for specified user', async () => {
      // Add items for both users
      await addToCart({
        user_id: testUserId,
        product_id: testProductId,
        quantity: 1
      });
      await addToCart({
        user_id: testUser2Id,
        product_id: testProduct2Id,
        quantity: 2
      });

      const user1Summary = await getCartSummary(testUserId);
      const user2Summary = await getCartSummary(testUser2Id);

      expect(user1Summary.totalItems).toBe(1);
      expect(user1Summary.totalAmount).toBeCloseTo(29.99, 2);

      expect(user2Summary.totalItems).toBe(2);
      expect(user2Summary.totalAmount).toBeCloseTo(99.98, 2);
    });
  });
});