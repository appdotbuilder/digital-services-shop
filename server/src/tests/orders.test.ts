import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { 
  usersTable, 
  categoriesTable, 
  productsTable, 
  couponsTable,
  ordersTable,
  orderItemsTable
} from '../db/schema';
import { 
  createOrder,
  getOrders,
  getUserOrders,
  getOrderById,
  updateOrderStatus,
  updatePaymentStatus,
  cancelOrder
} from '../handlers/orders';
import { type CreateOrderInput } from '../schema';
import { eq } from 'drizzle-orm';

describe('Orders Handlers', () => {
  let testUserId: number;
  let testCategoryId: number;
  let testProductId1: number;
  let testProductId2: number;
  let testCouponId: number;

  beforeEach(async () => {
    await createDB();
    
    // Create test user
    const userResult = await db.insert(usersTable)
      .values({
        email: 'test@example.com',
        password_hash: 'hashed_password',
        first_name: 'John',
        last_name: 'Doe',
        role: 'customer'
      })
      .returning()
      .execute();
    testUserId = userResult[0].id;

    // Create test category
    const categoryResult = await db.insert(categoriesTable)
      .values({
        name: 'Test Category',
        description: 'Test description',
        slug: 'test-category'
      })
      .returning()
      .execute();
    testCategoryId = categoryResult[0].id;

    // Create test products
    const product1Result = await db.insert(productsTable)
      .values({
        name: 'Digital Product',
        description: 'Test digital product',
        price: '29.99',
        type: 'digital_product',
        category_id: testCategoryId,
        stock_quantity: null
      })
      .returning()
      .execute();
    testProductId1 = product1Result[0].id;

    const product2Result = await db.insert(productsTable)
      .values({
        name: 'Physical Product',
        description: 'Test physical product',
        price: '19.99',
        type: 'service',
        category_id: testCategoryId,
        stock_quantity: 10
      })
      .returning()
      .execute();
    testProductId2 = product2Result[0].id;

    // Create test coupon
    const couponResult = await db.insert(couponsTable)
      .values({
        code: 'SAVE10',
        type: 'percentage',
        value: '10.00',
        minimum_order_amount: '20.00',
        usage_limit: 100,
        used_count: 0
      })
      .returning()
      .execute();
    testCouponId = couponResult[0].id;
  });

  afterEach(resetDB);

  describe('createOrder', () => {
    const testOrderInput: CreateOrderInput = {
      user_id: 1, // Will be set to testUserId in test
      items: [
        {
          product_id: 1, // Will be set to testProductId1 in test
          quantity: 1,
          price: 29.99
        },
        {
          product_id: 2, // Will be set to testProductId2 in test
          quantity: 2,
          price: 19.99
        }
      ]
    };

    it('should create an order without coupon', async () => {
      const input = {
        ...testOrderInput,
        user_id: testUserId,
        items: [
          {
            product_id: testProductId1,
            quantity: 1,
            price: 29.99
          },
          {
            product_id: testProductId2,
            quantity: 2,
            price: 19.99
          }
        ]
      };

      const result = await createOrder(input);

      expect(result.id).toBeDefined();
      expect(result.user_id).toBe(testUserId);
      expect(result.total_amount).toBe(69.97);
      expect(result.discount_amount).toBe(0);
      expect(result.final_amount).toBe(69.97);
      expect(result.coupon_id).toBeNull();
      expect(result.status).toBe('pending');
      expect(result.payment_status).toBe('pending');
      expect(result.created_at).toBeInstanceOf(Date);
      expect(result.updated_at).toBeInstanceOf(Date);
    });

    it('should create an order with coupon', async () => {
      const input = {
        ...testOrderInput,
        user_id: testUserId,
        items: [
          {
            product_id: testProductId1,
            quantity: 1,
            price: 29.99
          },
          {
            product_id: testProductId2,
            quantity: 2,
            price: 19.99
          }
        ],
        coupon_code: 'SAVE10'
      };

      const result = await createOrder(input);

      expect(result.total_amount).toBe(69.97);
      expect(result.discount_amount).toBeCloseTo(6.997, 2); // 10% of 69.97, allow precision variance
      expect(result.final_amount).toBeCloseTo(62.973, 2);
      expect(result.coupon_id).toBe(testCouponId);
    });

    it('should create order items correctly', async () => {
      const input = {
        ...testOrderInput,
        user_id: testUserId,
        items: [
          {
            product_id: testProductId1,
            quantity: 1,
            price: 29.99
          }
        ]
      };

      const order = await createOrder(input);

      const orderItems = await db.select()
        .from(orderItemsTable)
        .where(eq(orderItemsTable.order_id, order.id))
        .execute();

      expect(orderItems).toHaveLength(1);
      expect(orderItems[0].product_id).toBe(testProductId1);
      expect(orderItems[0].quantity).toBe(1);
      expect(parseFloat(orderItems[0].unit_price)).toBe(29.99);
      expect(parseFloat(orderItems[0].total_price)).toBe(29.99);
    });

    it('should update stock quantity for physical products', async () => {
      const input = {
        ...testOrderInput,
        user_id: testUserId,
        items: [
          {
            product_id: testProductId2,
            quantity: 3,
            price: 19.99
          }
        ]
      };

      await createOrder(input);

      const product = await db.select()
        .from(productsTable)
        .where(eq(productsTable.id, testProductId2))
        .limit(1)
        .execute();

      expect(product[0].stock_quantity).toBe(7); // 10 - 3
    });

    it('should update coupon usage count', async () => {
      const input = {
        ...testOrderInput,
        user_id: testUserId,
        items: [
          {
            product_id: testProductId1,
            quantity: 1,
            price: 29.99
          }
        ],
        coupon_code: 'SAVE10'
      };

      await createOrder(input);

      const coupon = await db.select()
        .from(couponsTable)
        .where(eq(couponsTable.id, testCouponId))
        .limit(1)
        .execute();

      expect(coupon[0].used_count).toBe(1);
    });

    it('should throw error for non-existent user', async () => {
      const input = {
        ...testOrderInput,
        user_id: 999,
        items: [
          {
            product_id: testProductId1,
            quantity: 1,
            price: 29.99
          }
        ]
      };

      await expect(createOrder(input)).rejects.toThrow(/User not found/i);
    });

    it('should throw error for non-existent product', async () => {
      const input = {
        ...testOrderInput,
        user_id: testUserId,
        items: [
          {
            product_id: 999,
            quantity: 1,
            price: 29.99
          }
        ]
      };

      await expect(createOrder(input)).rejects.toThrow(/Product with id 999 not found/i);
    });

    it('should throw error for price mismatch', async () => {
      const input = {
        ...testOrderInput,
        user_id: testUserId,
        items: [
          {
            product_id: testProductId1,
            quantity: 1,
            price: 99.99 // Wrong price
          }
        ]
      };

      await expect(createOrder(input)).rejects.toThrow(/Price mismatch/i);
    });

    it('should throw error for insufficient stock', async () => {
      const input = {
        ...testOrderInput,
        user_id: testUserId,
        items: [
          {
            product_id: testProductId2,
            quantity: 15, // More than available stock (10)
            price: 19.99
          }
        ]
      };

      await expect(createOrder(input)).rejects.toThrow(/Insufficient stock/i);
    });

    it('should throw error for invalid coupon', async () => {
      const input = {
        ...testOrderInput,
        user_id: testUserId,
        items: [
          {
            product_id: testProductId1,
            quantity: 1,
            price: 29.99
          }
        ],
        coupon_code: 'INVALID'
      };

      await expect(createOrder(input)).rejects.toThrow(/Invalid coupon code/i);
    });

    it('should throw error when order amount below coupon minimum', async () => {
      const input = {
        ...testOrderInput,
        user_id: testUserId,
        items: [
          {
            product_id: testProductId2,
            quantity: 1,
            price: 19.99
          }
        ],
        coupon_code: 'SAVE10' // Requires minimum $20
      };

      await expect(createOrder(input)).rejects.toThrow(/Minimum order amount/i);
    });
  });

  describe('getOrders', () => {
    let testOrderId: number;

    beforeEach(async () => {
      // Create a test order
      const input: CreateOrderInput = {
        user_id: testUserId,
        items: [
          {
            product_id: testProductId1,
            quantity: 1,
            price: 29.99
          }
        ]
      };

      const order = await createOrder(input);
      testOrderId = order.id;
    });

    it('should get all orders without filters', async () => {
      const orders = await getOrders();

      expect(orders).toHaveLength(1);
      expect(orders[0].id).toBe(testOrderId);
      expect(orders[0].user_id).toBe(testUserId);
      expect(typeof orders[0].total_amount).toBe('number');
    });

    it('should filter orders by user_id', async () => {
      const orders = await getOrders({ user_id: testUserId });

      expect(orders).toHaveLength(1);
      expect(orders[0].user_id).toBe(testUserId);
    });

    it('should filter orders by status', async () => {
      const orders = await getOrders({ status: 'pending' });

      expect(orders).toHaveLength(1);
      expect(orders[0].status).toBe('pending');
    });

    it('should filter orders by payment_status', async () => {
      const orders = await getOrders({ payment_status: 'pending' });

      expect(orders).toHaveLength(1);
      expect(orders[0].payment_status).toBe('pending');
    });

    it('should apply limit and offset', async () => {
      const orders = await getOrders({ limit: 1, offset: 0 });

      expect(orders).toHaveLength(1);
    });

    it('should return empty array with non-matching filters', async () => {
      const orders = await getOrders({ user_id: 999 });

      expect(orders).toHaveLength(0);
    });
  });

  describe('getUserOrders', () => {
    beforeEach(async () => {
      // Create a test order
      const input: CreateOrderInput = {
        user_id: testUserId,
        items: [
          {
            product_id: testProductId1,
            quantity: 1,
            price: 29.99
          }
        ]
      };

      await createOrder(input);
    });

    it('should get user orders with product details', async () => {
      const orders = await getUserOrders(testUserId);

      expect(orders).toHaveLength(1);
      expect(orders[0].user_id).toBe(testUserId);
      expect(orders[0].orderItems).toHaveLength(1);
      expect(orders[0].orderItems[0].product.name).toBe('Digital Product');
      expect(orders[0].orderItems[0].product.type).toBe('digital_product');
      expect(typeof orders[0].orderItems[0].unit_price).toBe('number');
    });

    it('should return empty array for non-existent user', async () => {
      const orders = await getUserOrders(999);

      expect(orders).toHaveLength(0);
    });
  });

  describe('getOrderById', () => {
    let testOrderId: number;

    beforeEach(async () => {
      // Create a test order with coupon
      const input: CreateOrderInput = {
        user_id: testUserId,
        items: [
          {
            product_id: testProductId1,
            quantity: 1,
            price: 29.99
          }
        ],
        coupon_code: 'SAVE10'
      };

      const order = await createOrder(input);
      testOrderId = order.id;
    });

    it('should get order with full details', async () => {
      const order = await getOrderById(testOrderId);

      expect(order).toBeDefined();
      expect(order!.id).toBe(testOrderId);
      expect(order!.user.first_name).toBe('John');
      expect(order!.user.last_name).toBe('Doe');
      expect(order!.user.email).toBe('test@example.com');
      expect(order!.orderItems).toHaveLength(1);
      expect(order!.orderItems[0].product.name).toBe('Digital Product');
      expect(order!.coupon).toBeDefined();
      expect(order!.coupon!.code).toBe('SAVE10');
      expect(order!.coupon!.type).toBe('percentage');
      expect(typeof order!.coupon!.value).toBe('number');
    });

    it('should return null for non-existent order', async () => {
      const order = await getOrderById(999);

      expect(order).toBeNull();
    });
  });

  describe('updateOrderStatus', () => {
    let testOrderId: number;

    beforeEach(async () => {
      const input: CreateOrderInput = {
        user_id: testUserId,
        items: [
          {
            product_id: testProductId1,
            quantity: 1,
            price: 29.99
          }
        ]
      };

      const order = await createOrder(input);
      testOrderId = order.id;
    });

    it('should update order status', async () => {
      const updatedOrder = await updateOrderStatus(testOrderId, 'processing');

      expect(updatedOrder.id).toBe(testOrderId);
      expect(updatedOrder.status).toBe('processing');
      expect(updatedOrder.updated_at).toBeInstanceOf(Date);
    });

    it('should throw error for non-existent order', async () => {
      await expect(updateOrderStatus(999, 'processing')).rejects.toThrow(/Order not found/i);
    });
  });

  describe('updatePaymentStatus', () => {
    let testOrderId: number;

    beforeEach(async () => {
      const input: CreateOrderInput = {
        user_id: testUserId,
        items: [
          {
            product_id: testProductId1,
            quantity: 1,
            price: 29.99
          }
        ]
      };

      const order = await createOrder(input);
      testOrderId = order.id;
    });

    it('should update payment status', async () => {
      const updatedOrder = await updatePaymentStatus(testOrderId, 'completed');

      expect(updatedOrder.id).toBe(testOrderId);
      expect(updatedOrder.payment_status).toBe('completed');
      expect(updatedOrder.updated_at).toBeInstanceOf(Date);
    });

    it('should throw error for non-existent order', async () => {
      await expect(updatePaymentStatus(999, 'completed')).rejects.toThrow(/Order not found/i);
    });
  });

  describe('cancelOrder', () => {
    let testOrderId: number;

    beforeEach(async () => {
      const input: CreateOrderInput = {
        user_id: testUserId,
        items: [
          {
            product_id: testProductId2, // Physical product with stock
            quantity: 2,
            price: 19.99
          }
        ]
      };

      const order = await createOrder(input);
      testOrderId = order.id;
    });

    it('should cancel order and restore stock', async () => {
      const cancelledOrder = await cancelOrder(testOrderId);

      expect(cancelledOrder.id).toBe(testOrderId);
      expect(cancelledOrder.status).toBe('cancelled');
      expect(cancelledOrder.updated_at).toBeInstanceOf(Date);

      // Check that stock was restored
      const product = await db.select()
        .from(productsTable)
        .where(eq(productsTable.id, testProductId2))
        .limit(1)
        .execute();

      expect(product[0].stock_quantity).toBe(10); // Back to original stock
    });

    it('should cancel order with user restriction', async () => {
      const cancelledOrder = await cancelOrder(testOrderId, testUserId);

      expect(cancelledOrder.status).toBe('cancelled');
    });

    it('should throw error for non-existent order', async () => {
      await expect(cancelOrder(999)).rejects.toThrow(/Order not found/i);
    });

    it('should throw error when cancelling completed order', async () => {
      // First update order to completed
      await updateOrderStatus(testOrderId, 'completed');

      await expect(cancelOrder(testOrderId)).rejects.toThrow(/Cannot cancel completed/i);
    });

    it('should throw error when cancelling already cancelled order', async () => {
      // First cancel the order
      await cancelOrder(testOrderId);

      // Try to cancel again
      await expect(cancelOrder(testOrderId)).rejects.toThrow(/Order is already cancelled/i);
    });

    it('should throw error when user tries to cancel another users order', async () => {
      await expect(cancelOrder(testOrderId, 999)).rejects.toThrow(/Order not found/i);
    });
  });
});