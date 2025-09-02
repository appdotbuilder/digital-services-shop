import { db } from '../db';
import { 
  ordersTable, 
  orderItemsTable, 
  productsTable, 
  usersTable, 
  couponsTable,
  cartItemsTable 
} from '../db/schema';
import { type Order, type OrderItem, type CreateOrderInput } from '../schema';
import { eq, and, desc, gte, lte, SQL, sql } from 'drizzle-orm';

export async function createOrder(input: CreateOrderInput): Promise<Order> {
  try {
    // Validate that user exists
    const user = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, input.user_id))
      .limit(1)
      .execute();

    if (user.length === 0) {
      throw new Error('User not found');
    }

    // Validate products exist and calculate total
    let totalAmount = 0;
    const validatedItems = [];

    for (const item of input.items) {
      const product = await db.select()
        .from(productsTable)
        .where(and(
          eq(productsTable.id, item.product_id),
          eq(productsTable.is_active, true)
        ))
        .limit(1)
        .execute();

      if (product.length === 0) {
        throw new Error(`Product with id ${item.product_id} not found or inactive`);
      }

      // Verify price matches (for security)
      const productPrice = parseFloat(product[0].price);
      if (Math.abs(productPrice - item.price) > 0.01) {
        throw new Error(`Price mismatch for product ${item.product_id}`);
      }

      // Check stock for physical products
      if (product[0].stock_quantity !== null && product[0].stock_quantity < item.quantity) {
        throw new Error(`Insufficient stock for product ${product[0].name}`);
      }

      const itemTotal = item.price * item.quantity;
      totalAmount += itemTotal;

      validatedItems.push({
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: item.price,
        total_price: itemTotal
      });
    }

    let discountAmount = 0;
    let couponId = null;

    // Apply coupon if provided
    if (input.coupon_code) {
      const coupon = await db.select()
        .from(couponsTable)
        .where(and(
          eq(couponsTable.code, input.coupon_code),
          eq(couponsTable.is_active, true)
        ))
        .limit(1)
        .execute();

      if (coupon.length === 0) {
        throw new Error('Invalid coupon code');
      }

      const couponData = coupon[0];

      // Check if coupon is expired
      if (couponData.expires_at && new Date() > couponData.expires_at) {
        throw new Error('Coupon has expired');
      }

      // Check usage limit
      if (couponData.usage_limit && couponData.used_count >= couponData.usage_limit) {
        throw new Error('Coupon usage limit exceeded');
      }

      // Check minimum order amount
      if (couponData.minimum_order_amount && totalAmount < parseFloat(couponData.minimum_order_amount)) {
        throw new Error(`Minimum order amount of $${couponData.minimum_order_amount} required for this coupon`);
      }

      // Calculate discount
      const couponValue = parseFloat(couponData.value);
      if (couponData.type === 'percentage') {
        discountAmount = (totalAmount * couponValue) / 100;
      } else {
        discountAmount = couponValue;
      }

      // Ensure discount doesn't exceed total
      if (discountAmount > totalAmount) {
        discountAmount = totalAmount;
      }

      couponId = couponData.id;
    }

    const finalAmount = totalAmount - discountAmount;

    // Create order
    const orderResult = await db.insert(ordersTable)
      .values({
        user_id: input.user_id,
        total_amount: totalAmount.toString(),
        discount_amount: discountAmount.toString(),
        final_amount: finalAmount.toString(),
        coupon_id: couponId,
        status: 'pending',
        payment_status: 'pending'
      })
      .returning()
      .execute();

    const order = orderResult[0];

    // Create order items
    const orderItemsData = validatedItems.map(item => ({
      order_id: order.id,
      product_id: item.product_id,
      quantity: item.quantity,
      unit_price: item.unit_price.toString(),
      total_price: item.total_price.toString()
    }));

    await db.insert(orderItemsTable)
      .values(orderItemsData)
      .execute();

    // Update coupon usage count
    if (couponId) {
      await db.update(couponsTable)
        .set({ used_count: sql`${couponsTable.used_count} + 1` })
        .where(eq(couponsTable.id, couponId))
        .execute();
    }

    // Update product stock quantities
    for (const item of validatedItems) {
      const product = await db.select()
        .from(productsTable)
        .where(eq(productsTable.id, item.product_id))
        .limit(1)
        .execute();

      if (product[0].stock_quantity !== null) {
        await db.update(productsTable)
          .set({ stock_quantity: product[0].stock_quantity - item.quantity })
          .where(eq(productsTable.id, item.product_id))
          .execute();
      }
    }

    // Return order with converted numeric fields
    return {
      ...order,
      total_amount: parseFloat(order.total_amount),
      discount_amount: parseFloat(order.discount_amount),
      final_amount: parseFloat(order.final_amount)
    };
  } catch (error) {
    console.error('Order creation failed:', error);
    throw error;
  }
}

export async function getOrders(filters?: {
  user_id?: number;
  status?: 'pending' | 'processing' | 'completed' | 'cancelled' | 'refunded';
  payment_status?: 'pending' | 'completed' | 'failed' | 'refunded';
  limit?: number;
  offset?: number;
}): Promise<Order[]> {
  try {
    const conditions: SQL<unknown>[] = [];

    if (filters?.user_id) {
      conditions.push(eq(ordersTable.user_id, filters.user_id));
    }

    if (filters?.status) {
      conditions.push(eq(ordersTable.status, filters.status));
    }

    if (filters?.payment_status) {
      conditions.push(eq(ordersTable.payment_status, filters.payment_status));
    }

    // Build complete query in one chain to avoid type issues
    const baseQuery = db.select().from(ordersTable);
    
    const queryWithConditions = conditions.length > 0 
      ? baseQuery.where(conditions.length === 1 ? conditions[0] : and(...conditions))
      : baseQuery;
    
    const queryWithOrder = queryWithConditions.orderBy(desc(ordersTable.created_at));
    
    const queryWithLimit = filters?.limit 
      ? queryWithOrder.limit(filters.limit)
      : queryWithOrder;
    
    const finalQuery = filters?.offset 
      ? queryWithLimit.offset(filters.offset)
      : queryWithLimit;

    const results = await finalQuery.execute();

    return results.map(order => ({
      ...order,
      total_amount: parseFloat(order.total_amount),
      discount_amount: parseFloat(order.discount_amount),
      final_amount: parseFloat(order.final_amount)
    }));
  } catch (error) {
    console.error('Get orders failed:', error);
    throw error;
  }
}

export async function getUserOrders(userId: number): Promise<Array<Order & {
  orderItems: Array<OrderItem & {
    product: {
      name: string;
      type: 'digital_product' | 'service';
      download_url: string | null;
    };
  }>;
}>> {
  try {
    // Get user's orders
    const orders = await db.select()
      .from(ordersTable)
      .where(eq(ordersTable.user_id, userId))
      .orderBy(desc(ordersTable.created_at))
      .execute();

    // Get order items with product details for each order
    const ordersWithItems = [];
    
    for (const order of orders) {
      const orderItemsWithProducts = await db.select({
        id: orderItemsTable.id,
        order_id: orderItemsTable.order_id,
        product_id: orderItemsTable.product_id,
        quantity: orderItemsTable.quantity,
        unit_price: orderItemsTable.unit_price,
        total_price: orderItemsTable.total_price,
        created_at: orderItemsTable.created_at,
        product_name: productsTable.name,
        product_type: productsTable.type,
        product_download_url: productsTable.download_url
      })
      .from(orderItemsTable)
      .innerJoin(productsTable, eq(orderItemsTable.product_id, productsTable.id))
      .where(eq(orderItemsTable.order_id, order.id))
      .execute();

      const orderItems = orderItemsWithProducts.map(item => ({
        id: item.id,
        order_id: item.order_id,
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: parseFloat(item.unit_price),
        total_price: parseFloat(item.total_price),
        created_at: item.created_at,
        product: {
          name: item.product_name,
          type: item.product_type,
          download_url: item.product_download_url
        }
      }));

      ordersWithItems.push({
        ...order,
        total_amount: parseFloat(order.total_amount),
        discount_amount: parseFloat(order.discount_amount),
        final_amount: parseFloat(order.final_amount),
        orderItems
      });
    }

    return ordersWithItems;
  } catch (error) {
    console.error('Get user orders failed:', error);
    throw error;
  }
}

export async function getOrderById(id: number): Promise<Order & {
  user: { first_name: string; last_name: string; email: string };
  orderItems: Array<OrderItem & {
    product: { name: string; type: 'digital_product' | 'service' };
  }>;
  coupon?: { code: string; type: 'percentage' | 'fixed_amount'; value: number };
} | null> {
  try {
    // Get order with user details
    const orderWithUser = await db.select({
      id: ordersTable.id,
      user_id: ordersTable.user_id,
      total_amount: ordersTable.total_amount,
      discount_amount: ordersTable.discount_amount,
      final_amount: ordersTable.final_amount,
      coupon_id: ordersTable.coupon_id,
      status: ordersTable.status,
      payment_status: ordersTable.payment_status,
      created_at: ordersTable.created_at,
      updated_at: ordersTable.updated_at,
      user_first_name: usersTable.first_name,
      user_last_name: usersTable.last_name,
      user_email: usersTable.email
    })
    .from(ordersTable)
    .innerJoin(usersTable, eq(ordersTable.user_id, usersTable.id))
    .where(eq(ordersTable.id, id))
    .limit(1)
    .execute();

    if (orderWithUser.length === 0) {
      return null;
    }

    const orderData = orderWithUser[0];

    // Get order items with product details
    const orderItemsWithProducts = await db.select({
      id: orderItemsTable.id,
      order_id: orderItemsTable.order_id,
      product_id: orderItemsTable.product_id,
      quantity: orderItemsTable.quantity,
      unit_price: orderItemsTable.unit_price,
      total_price: orderItemsTable.total_price,
      created_at: orderItemsTable.created_at,
      product_name: productsTable.name,
      product_type: productsTable.type
    })
    .from(orderItemsTable)
    .innerJoin(productsTable, eq(orderItemsTable.product_id, productsTable.id))
    .where(eq(orderItemsTable.order_id, id))
    .execute();

    const orderItems = orderItemsWithProducts.map(item => ({
      id: item.id,
      order_id: item.order_id,
      product_id: item.product_id,
      quantity: item.quantity,
      unit_price: parseFloat(item.unit_price),
      total_price: parseFloat(item.total_price),
      created_at: item.created_at,
      product: {
        name: item.product_name,
        type: item.product_type
      }
    }));

    // Get coupon details if applicable
    let coupon;
    if (orderData.coupon_id) {
      const couponResult = await db.select({
        code: couponsTable.code,
        type: couponsTable.type,
        value: couponsTable.value
      })
      .from(couponsTable)
      .where(eq(couponsTable.id, orderData.coupon_id))
      .limit(1)
      .execute();

      if (couponResult.length > 0) {
        coupon = {
          code: couponResult[0].code,
          type: couponResult[0].type,
          value: parseFloat(couponResult[0].value)
        };
      }
    }

    return {
      id: orderData.id,
      user_id: orderData.user_id,
      total_amount: parseFloat(orderData.total_amount),
      discount_amount: parseFloat(orderData.discount_amount),
      final_amount: parseFloat(orderData.final_amount),
      coupon_id: orderData.coupon_id,
      status: orderData.status,
      payment_status: orderData.payment_status,
      created_at: orderData.created_at,
      updated_at: orderData.updated_at,
      user: {
        first_name: orderData.user_first_name,
        last_name: orderData.user_last_name,
        email: orderData.user_email
      },
      orderItems,
      ...(coupon && { coupon })
    };
  } catch (error) {
    console.error('Get order by ID failed:', error);
    throw error;
  }
}

export async function updateOrderStatus(
  id: number, 
  status: 'pending' | 'processing' | 'completed' | 'cancelled' | 'refunded'
): Promise<Order> {
  try {
    const result = await db.update(ordersTable)
      .set({ 
        status,
        updated_at: new Date()
      })
      .where(eq(ordersTable.id, id))
      .returning()
      .execute();

    if (result.length === 0) {
      throw new Error('Order not found');
    }

    const order = result[0];
    return {
      ...order,
      total_amount: parseFloat(order.total_amount),
      discount_amount: parseFloat(order.discount_amount),
      final_amount: parseFloat(order.final_amount)
    };
  } catch (error) {
    console.error('Update order status failed:', error);
    throw error;
  }
}

export async function updatePaymentStatus(
  id: number,
  payment_status: 'pending' | 'completed' | 'failed' | 'refunded'
): Promise<Order> {
  try {
    const result = await db.update(ordersTable)
      .set({ 
        payment_status,
        updated_at: new Date()
      })
      .where(eq(ordersTable.id, id))
      .returning()
      .execute();

    if (result.length === 0) {
      throw new Error('Order not found');
    }

    const order = result[0];
    return {
      ...order,
      total_amount: parseFloat(order.total_amount),
      discount_amount: parseFloat(order.discount_amount),
      final_amount: parseFloat(order.final_amount)
    };
  } catch (error) {
    console.error('Update payment status failed:', error);
    throw error;
  }
}

export async function cancelOrder(id: number, userId?: number): Promise<Order> {
  try {
    // Build conditions for the update
    const conditions: SQL<unknown>[] = [eq(ordersTable.id, id)];
    
    if (userId) {
      conditions.push(eq(ordersTable.user_id, userId));
    }

    // Check current order status first
    const currentOrder = await db.select()
      .from(ordersTable)
      .where(conditions.length === 1 ? conditions[0] : and(...conditions))
      .limit(1)
      .execute();

    if (currentOrder.length === 0) {
      throw new Error('Order not found');
    }

    if (currentOrder[0].status === 'completed' || currentOrder[0].status === 'refunded') {
      throw new Error('Cannot cancel completed or refunded orders');
    }

    if (currentOrder[0].status === 'cancelled') {
      throw new Error('Order is already cancelled');
    }

    // Update order status to cancelled
    const result = await db.update(ordersTable)
      .set({ 
        status: 'cancelled',
        updated_at: new Date()
      })
      .where(conditions.length === 1 ? conditions[0] : and(...conditions))
      .returning()
      .execute();

    const order = result[0];

    // Restore stock quantities for cancelled orders
    const orderItems = await db.select()
      .from(orderItemsTable)
      .where(eq(orderItemsTable.order_id, id))
      .execute();

    for (const item of orderItems) {
      const product = await db.select()
        .from(productsTable)
        .where(eq(productsTable.id, item.product_id))
        .limit(1)
        .execute();

      if (product[0].stock_quantity !== null) {
        await db.update(productsTable)
          .set({ stock_quantity: product[0].stock_quantity + item.quantity })
          .where(eq(productsTable.id, item.product_id))
          .execute();
      }
    }

    return {
      ...order,
      total_amount: parseFloat(order.total_amount),
      discount_amount: parseFloat(order.discount_amount),
      final_amount: parseFloat(order.final_amount)
    };
  } catch (error) {
    console.error('Cancel order failed:', error);
    throw error;
  }
}