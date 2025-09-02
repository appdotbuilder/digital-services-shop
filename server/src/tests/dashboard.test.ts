import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { 
  categoriesTable, 
  productsTable, 
  usersTable, 
  ordersTable,
  orderItemsTable
} from '../db/schema';
import {
  getDashboardStats,
  getDailyVisitors,
  getRevenueByMonth,
  getTopProducts,
  getRecentOrders,
  getCustomerStats,
  getProductStats
} from '../handlers/dashboard';

describe('Dashboard Handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  // Helper function to create test data
  const createTestData = async () => {
    // Create test users
    const usersResult = await db.insert(usersTable)
      .values([
        {
          email: 'admin@test.com',
          password_hash: 'hash1',
          first_name: 'Admin',
          last_name: 'User',
          role: 'admin'
        },
        {
          email: 'customer1@test.com',
          password_hash: 'hash2',
          first_name: 'Customer',
          last_name: 'One',
          role: 'customer'
        },
        {
          email: 'customer2@test.com',
          password_hash: 'hash3',
          first_name: 'Customer',
          last_name: 'Two',
          role: 'customer'
        }
      ])
      .returning()
      .execute();

    // Create test categories
    const categoriesResult = await db.insert(categoriesTable)
      .values([
        {
          name: 'Electronics',
          description: 'Electronic products',
          slug: 'electronics'
        },
        {
          name: 'Software',
          description: 'Software products',
          slug: 'software'
        }
      ])
      .returning()
      .execute();

    // Create test products
    const productsResult = await db.insert(productsTable)
      .values([
        {
          name: 'Laptop',
          description: 'Gaming laptop',
          price: '999.99',
          type: 'digital_product',
          category_id: categoriesResult[0].id,
          stock_quantity: 10
        },
        {
          name: 'Consultation',
          description: 'IT consultation',
          price: '150.00',
          type: 'service',
          category_id: categoriesResult[1].id,
          stock_quantity: null
        },
        {
          name: 'Out of Stock Item',
          description: 'No stock',
          price: '50.00',
          type: 'digital_product',
          category_id: categoriesResult[0].id,
          stock_quantity: 0
        }
      ])
      .returning()
      .execute();

    // Create test orders
    const ordersResult = await db.insert(ordersTable)
      .values([
        {
          user_id: usersResult[1].id,
          total_amount: '999.99',
          discount_amount: '0.00',
          final_amount: '999.99',
          status: 'completed'
        },
        {
          user_id: usersResult[2].id,
          total_amount: '150.00',
          discount_amount: '0.00',
          final_amount: '150.00',
          status: 'pending'
        },
        {
          user_id: usersResult[1].id, // Same customer - repeat customer
          total_amount: '50.00',
          discount_amount: '0.00',
          final_amount: '50.00',
          status: 'completed'
        }
      ])
      .returning()
      .execute();

    // Create test order items
    await db.insert(orderItemsTable)
      .values([
        {
          order_id: ordersResult[0].id,
          product_id: productsResult[0].id,
          quantity: 1,
          unit_price: '999.99',
          total_price: '999.99'
        },
        {
          order_id: ordersResult[1].id,
          product_id: productsResult[1].id,
          quantity: 1,
          unit_price: '150.00',
          total_price: '150.00'
        },
        {
          order_id: ordersResult[2].id,
          product_id: productsResult[2].id,
          quantity: 1,
          unit_price: '50.00',
          total_price: '50.00'
        }
      ])
      .execute();

    return {
      users: usersResult,
      categories: categoriesResult,
      products: productsResult,
      orders: ordersResult
    };
  };

  describe('getDashboardStats', () => {
    it('should return correct dashboard statistics', async () => {
      await createTestData();

      const stats = await getDashboardStats();

      expect(stats.total_categories).toEqual(2);
      expect(stats.total_products).toEqual(3);
      expect(stats.total_customers).toEqual(2); // Only customers, not admin
      expect(stats.total_orders).toEqual(3);
      expect(stats.total_revenue).toEqual(1049.99); // Sum of completed orders
      expect(stats.pending_orders).toEqual(1);
      expect(stats.completed_orders).toEqual(2);
    });

    it('should handle empty database', async () => {
      const stats = await getDashboardStats();

      expect(stats.total_categories).toEqual(0);
      expect(stats.total_products).toEqual(0);
      expect(stats.total_customers).toEqual(0);
      expect(stats.total_orders).toEqual(0);
      expect(stats.total_revenue).toEqual(0);
      expect(stats.pending_orders).toEqual(0);
      expect(stats.completed_orders).toEqual(0);
    });
  });

  describe('getDailyVisitors', () => {
    it('should return daily visitor data for specified days', async () => {
      const visitors = await getDailyVisitors(7);

      expect(visitors).toHaveLength(7);
      expect(visitors[0].date).toBeDefined();
      expect(typeof visitors[0].visitors).toBe('number');
      expect(visitors[0].visitors).toBeGreaterThanOrEqual(20);
      expect(visitors[0].visitors).toBeLessThanOrEqual(120);
    });

    it('should default to 30 days', async () => {
      const visitors = await getDailyVisitors();

      expect(visitors).toHaveLength(30);
    });

    it('should return dates in YYYY-MM-DD format', async () => {
      const visitors = await getDailyVisitors(3);

      visitors.forEach(visitor => {
        expect(visitor.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      });
    });
  });

  describe('getRevenueByMonth', () => {
    it('should return revenue data by month', async () => {
      await createTestData();

      const revenue = await getRevenueByMonth(3);

      expect(revenue).toHaveLength(3);
      expect(revenue[0].month).toBeDefined();
      expect(typeof revenue[0].revenue).toBe('number');
      expect(typeof revenue[0].orders).toBe('number');
    });

    it('should default to 12 months', async () => {
      const revenue = await getRevenueByMonth();

      expect(revenue).toHaveLength(12);
    });
  });

  describe('getTopProducts', () => {
    it('should return top-selling products', async () => {
      await createTestData();

      const topProducts = await getTopProducts(5);

      expect(topProducts.length).toBeGreaterThan(0);
      expect(topProducts.length).toBeLessThanOrEqual(5);

      const firstProduct = topProducts[0];
      expect(firstProduct.id).toBeDefined();
      expect(firstProduct.name).toBeDefined();
      expect(typeof firstProduct.total_sales).toBe('number');
      expect(typeof firstProduct.revenue).toBe('number');
      expect(typeof firstProduct.order_count).toBe('number');
    });

    it('should default to 10 products limit', async () => {
      await createTestData();

      const topProducts = await getTopProducts();

      expect(topProducts.length).toBeLessThanOrEqual(10);
    });

    it('should handle no completed orders', async () => {
      const topProducts = await getTopProducts();

      expect(topProducts).toEqual([]);
    });
  });

  describe('getRecentOrders', () => {
    it('should return recent orders with user names', async () => {
      await createTestData();

      const recentOrders = await getRecentOrders(5);

      expect(recentOrders.length).toBeGreaterThan(0);
      expect(recentOrders.length).toBeLessThanOrEqual(5);

      const firstOrder = recentOrders[0];
      expect(firstOrder.id).toBeDefined();
      expect(firstOrder.user_name).toBeDefined();
      expect(firstOrder.user_name).toContain(' '); // Should have first and last name
      expect(typeof firstOrder.final_amount).toBe('number');
      expect(['pending', 'processing', 'completed', 'cancelled', 'refunded']).toContain(firstOrder.status);
      expect(firstOrder.created_at).toBeInstanceOf(Date);
    });

    it('should default to 10 orders limit', async () => {
      await createTestData();

      const recentOrders = await getRecentOrders();

      expect(recentOrders.length).toBeLessThanOrEqual(10);
    });

    it('should order by most recent first', async () => {
      await createTestData();

      const recentOrders = await getRecentOrders();

      for (let i = 1; i < recentOrders.length; i++) {
        expect(recentOrders[i - 1].created_at >= recentOrders[i].created_at).toBe(true);
      }
    });
  });

  describe('getCustomerStats', () => {
    it('should return customer statistics', async () => {
      await createTestData();

      const stats = await getCustomerStats();

      expect(stats.total_customers).toEqual(2);
      expect(typeof stats.new_customers_this_month).toBe('number');
      expect(stats.repeat_customers).toEqual(1); // Customer with 2 orders
      expect(typeof stats.customer_retention_rate).toBe('number');
      expect(stats.customer_retention_rate).toBeGreaterThanOrEqual(0);
      expect(stats.customer_retention_rate).toBeLessThanOrEqual(100);
    });

    it('should handle zero customers', async () => {
      const stats = await getCustomerStats();

      expect(stats.total_customers).toEqual(0);
      expect(stats.new_customers_this_month).toEqual(0);
      expect(stats.repeat_customers).toEqual(0);
      expect(stats.customer_retention_rate).toEqual(0);
    });
  });

  describe('getProductStats', () => {
    it('should return product statistics', async () => {
      await createTestData();

      const stats = await getProductStats();

      expect(stats.total_products).toEqual(3);
      expect(stats.digital_products).toEqual(2);
      expect(stats.services).toEqual(1);
      expect(stats.active_products).toEqual(3); // All products are active by default
      expect(stats.out_of_stock).toEqual(1); // One product has stock_quantity = 0
    });

    it('should handle empty products table', async () => {
      const stats = await getProductStats();

      expect(stats.total_products).toEqual(0);
      expect(stats.digital_products).toEqual(0);
      expect(stats.services).toEqual(0);
      expect(stats.active_products).toEqual(0);
      expect(stats.out_of_stock).toEqual(0);
    });
  });
});