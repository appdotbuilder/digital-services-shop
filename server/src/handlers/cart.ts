import { db } from '../db';
import { cartItemsTable, productsTable, usersTable } from '../db/schema';
import { type CartItem, type AddToCartInput, type UpdateCartItemInput } from '../schema';
import { eq, and, SQL } from 'drizzle-orm';

export async function addToCart(input: AddToCartInput): Promise<CartItem> {
  try {
    // Verify user exists
    const userExists = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, input.user_id))
      .execute();
    
    if (userExists.length === 0) {
      throw new Error(`User with id ${input.user_id} not found`);
    }

    // Verify product exists
    const productExists = await db.select()
      .from(productsTable)
      .where(eq(productsTable.id, input.product_id))
      .execute();
    
    if (productExists.length === 0) {
      throw new Error(`Product with id ${input.product_id} not found`);
    }

    // Check if item already exists in cart
    const existingItem = await db.select()
      .from(cartItemsTable)
      .where(
        and(
          eq(cartItemsTable.user_id, input.user_id),
          eq(cartItemsTable.product_id, input.product_id)
        )
      )
      .execute();

    if (existingItem.length > 0) {
      // Update existing item quantity
      const updatedQuantity = existingItem[0].quantity + input.quantity;
      const result = await db.update(cartItemsTable)
        .set({
          quantity: updatedQuantity,
          updated_at: new Date()
        })
        .where(eq(cartItemsTable.id, existingItem[0].id))
        .returning()
        .execute();
      
      return result[0];
    } else {
      // Create new cart item
      const result = await db.insert(cartItemsTable)
        .values({
          user_id: input.user_id,
          product_id: input.product_id,
          quantity: input.quantity
        })
        .returning()
        .execute();

      return result[0];
    }
  } catch (error) {
    console.error('Add to cart failed:', error);
    throw error;
  }
}

export async function getCartItems(userId: number): Promise<Array<CartItem & {
  product: {
    id: number;
    name: string;
    price: number;
    image_url: string | null;
    type: 'digital_product' | 'service';
  };
}>> {
  try {
    const results = await db.select()
      .from(cartItemsTable)
      .innerJoin(productsTable, eq(cartItemsTable.product_id, productsTable.id))
      .where(eq(cartItemsTable.user_id, userId))
      .execute();

    return results.map(result => ({
      id: result.cart_items.id,
      user_id: result.cart_items.user_id,
      product_id: result.cart_items.product_id,
      quantity: result.cart_items.quantity,
      created_at: result.cart_items.created_at,
      updated_at: result.cart_items.updated_at,
      product: {
        id: result.products.id,
        name: result.products.name,
        price: parseFloat(result.products.price),
        image_url: result.products.image_url,
        type: result.products.type
      }
    }));
  } catch (error) {
    console.error('Get cart items failed:', error);
    throw error;
  }
}

export async function updateCartItem(input: UpdateCartItemInput): Promise<CartItem> {
  try {
    // Verify cart item exists
    const existingItem = await db.select()
      .from(cartItemsTable)
      .where(eq(cartItemsTable.id, input.id))
      .execute();
    
    if (existingItem.length === 0) {
      throw new Error(`Cart item with id ${input.id} not found`);
    }

    const result = await db.update(cartItemsTable)
      .set({
        quantity: input.quantity,
        updated_at: new Date()
      })
      .where(eq(cartItemsTable.id, input.id))
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('Update cart item failed:', error);
    throw error;
  }
}

export async function removeFromCart(itemId: number, userId: number): Promise<{ success: boolean }> {
  try {
    const result = await db.delete(cartItemsTable)
      .where(
        and(
          eq(cartItemsTable.id, itemId),
          eq(cartItemsTable.user_id, userId)
        )
      )
      .returning()
      .execute();

    if (result.length === 0) {
      throw new Error(`Cart item with id ${itemId} not found or does not belong to user ${userId}`);
    }

    return { success: true };
  } catch (error) {
    console.error('Remove from cart failed:', error);
    throw error;
  }
}

export async function clearCart(userId: number): Promise<{ success: boolean }> {
  try {
    await db.delete(cartItemsTable)
      .where(eq(cartItemsTable.user_id, userId))
      .execute();

    return { success: true };
  } catch (error) {
    console.error('Clear cart failed:', error);
    throw error;
  }
}

export async function getCartSummary(userId: number): Promise<{
  totalItems: number;
  totalAmount: number;
  items: Array<{
    id: number;
    name: string;
    quantity: number;
    price: number;
    total: number;
  }>;
}> {
  try {
    const results = await db.select()
      .from(cartItemsTable)
      .innerJoin(productsTable, eq(cartItemsTable.product_id, productsTable.id))
      .where(eq(cartItemsTable.user_id, userId))
      .execute();

    const items = results.map(result => {
      const price = parseFloat(result.products.price);
      const quantity = result.cart_items.quantity;
      return {
        id: result.cart_items.id,
        name: result.products.name,
        quantity: quantity,
        price: price,
        total: price * quantity
      };
    });

    const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
    const totalAmount = items.reduce((sum, item) => sum + item.total, 0);

    return {
      totalItems,
      totalAmount,
      items
    };
  } catch (error) {
    console.error('Get cart summary failed:', error);
    throw error;
  }
}