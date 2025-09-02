import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { 
  usersTable, 
  categoriesTable, 
  productsTable, 
  ordersTable, 
  orderItemsTable,
  reviewsTable,
  couponsTable
} from '../db/schema';
import { 
  generateSalesReport,
  generateProductReport,
  generateCustomerReport,
  generateInventoryReport,
  generateRevenueReport,
  generateCouponReport
} from '../handlers/reports';

describe('Reports', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  describe('generateSalesReport', () => {
    it('should generate basic sales report with no orders', async () => {
      const start_date = new Date('2024-01-01');
      const end_date = new Date('2024-12-31');

      const result = await generateSalesReport({ start_date, end_date });

      expect(result.total_orders).toEqual(0);
      expect(result.total_revenue).toEqual(0);
      expect(result.average_order_value).toEqual(0);
      expect(result.orders_by_status).toEqual({});
      expect(result.daily_sales).toEqual([]);
    });

    it('should generate sales report with orders', async () => {
      // Create test data
      const user = await db.insert(usersTable).values({
        email: 'test@example.com',
        password_hash: 'hash',
        first_name: 'Test',
        last_name: 'User',
        role: 'customer'
      }).returning().execute();

      const orders = await db.insert(ordersTable).values([
        {
          user_id: user[0].id,
          total_amount: '100.00',
          discount_amount: '10.00',
          final_amount: '90.00',
          status: 'completed',
          payment_status: 'completed',
          created_at: new Date('2024-01-15')
        },
        {
          user_id: user[0].id,
          total_amount: '200.00',
          discount_amount: '0.00',
          final_amount: '200.00',
          status: 'pending',
          payment_status: 'pending',
          created_at: new Date('2024-01-20')
        }
      ]).returning().execute();

      const start_date = new Date('2024-01-01');
      const end_date = new Date('2024-01-31');

      const result = await generateSalesReport({ start_date, end_date });

      expect(result.total_orders).toEqual(2);
      expect(result.total_revenue).toEqual(290.00);
      expect(result.average_order_value).toEqual(145.00);
      expect(result.orders_by_status['completed']).toEqual(1);
      expect(result.orders_by_status['pending']).toEqual(1);
      expect(result.daily_sales.length).toEqual(2);
    });

    it('should filter orders by date range', async () => {
      const user = await db.insert(usersTable).values({
        email: 'test@example.com',
        password_hash: 'hash',
        first_name: 'Test',
        last_name: 'User',
        role: 'customer'
      }).returning().execute();

      // Order outside range
      await db.insert(ordersTable).values({
        user_id: user[0].id,
        total_amount: '100.00',
        discount_amount: '0.00',
        final_amount: '100.00',
        status: 'completed',
        payment_status: 'completed',
        created_at: new Date('2023-12-31')
      }).execute();

      // Order inside range
      await db.insert(ordersTable).values({
        user_id: user[0].id,
        total_amount: '200.00',
        discount_amount: '0.00',
        final_amount: '200.00',
        status: 'completed',
        payment_status: 'completed',
        created_at: new Date('2024-01-15')
      }).execute();

      const start_date = new Date('2024-01-01');
      const end_date = new Date('2024-01-31');

      const result = await generateSalesReport({ start_date, end_date });

      expect(result.total_orders).toEqual(1);
      expect(result.total_revenue).toEqual(200.00);
    });
  });

  describe('generateProductReport', () => {
    it('should generate product report with no sales', async () => {
      const category = await db.insert(categoriesTable).values({
        name: 'Test Category',
        description: 'A test category',
        slug: 'test-category'
      }).returning().execute();

      await db.insert(productsTable).values({
        name: 'Test Product',
        description: 'A test product',
        price: '99.99',
        type: 'digital_product',
        category_id: category[0].id,
        stock_quantity: null
      }).execute();

      const result = await generateProductReport();

      expect(result.length).toEqual(1);
      expect(result[0].name).toEqual('Test Product');
      expect(result[0].category).toEqual('Test Category');
      expect(result[0].type).toEqual('digital_product');
      expect(result[0].total_sales).toEqual(0);
      expect(result[0].revenue).toEqual(0);
      expect(result[0].average_rating).toEqual(0);
      expect(result[0].stock_quantity).toBeNull();
    });

    it('should generate product report with sales and reviews', async () => {
      const user = await db.insert(usersTable).values({
        email: 'test@example.com',
        password_hash: 'hash',
        first_name: 'Test',
        last_name: 'User',
        role: 'customer'
      }).returning().execute();

      const category = await db.insert(categoriesTable).values({
        name: 'Test Category',
        description: 'A test category',
        slug: 'test-category'
      }).returning().execute();

      const product = await db.insert(productsTable).values({
        name: 'Test Product',
        description: 'A test product',
        price: '99.99',
        type: 'digital_product',
        category_id: category[0].id,
        stock_quantity: 50
      }).returning().execute();

      const order = await db.insert(ordersTable).values({
        user_id: user[0].id,
        total_amount: '199.98',
        discount_amount: '0.00',
        final_amount: '199.98',
        status: 'completed',
        payment_status: 'completed'
      }).returning().execute();

      await db.insert(orderItemsTable).values({
        order_id: order[0].id,
        product_id: product[0].id,
        quantity: 2,
        unit_price: '99.99',
        total_price: '199.98'
      }).execute();

      await db.insert(reviewsTable).values([
        {
          user_id: user[0].id,
          product_id: product[0].id,
          rating: 5,
          comment: 'Great product!'
        },
        {
          user_id: user[0].id,
          product_id: product[0].id,
          rating: 4,
          comment: 'Good product'
        }
      ]).execute();

      const result = await generateProductReport();

      expect(result.length).toEqual(1);
      expect(result[0].total_sales).toEqual(2);
      expect(result[0].revenue).toEqual(199.98);
      expect(result[0].average_rating).toEqual(4.5);
      expect(result[0].stock_quantity).toEqual(50);
    });

    it('should filter by category_id', async () => {
      const categories = await db.insert(categoriesTable).values([
        { name: 'Category 1', description: 'First category', slug: 'category-1' },
        { name: 'Category 2', description: 'Second category', slug: 'category-2' }
      ]).returning().execute();

      await db.insert(productsTable).values([
        {
          name: 'Product 1',
          description: 'Product in category 1',
          price: '99.99',
          type: 'digital_product',
          category_id: categories[0].id
        },
        {
          name: 'Product 2',
          description: 'Product in category 2',
          price: '149.99',
          type: 'service',
          category_id: categories[1].id
        }
      ]).execute();

      const result = await generateProductReport({ category_id: categories[0].id });

      expect(result.length).toEqual(1);
      expect(result[0].name).toEqual('Product 1');
      expect(result[0].category).toEqual('Category 1');
    });

    it('should filter by product_type', async () => {
      const category = await db.insert(categoriesTable).values({
        name: 'Test Category',
        description: 'A test category',
        slug: 'test-category'
      }).returning().execute();

      await db.insert(productsTable).values([
        {
          name: 'Digital Product',
          description: 'A digital product',
          price: '99.99',
          type: 'digital_product',
          category_id: category[0].id
        },
        {
          name: 'Service Product',
          description: 'A service product',
          price: '149.99',
          type: 'service',
          category_id: category[0].id
        }
      ]).execute();

      const result = await generateProductReport({ product_type: 'digital_product' });

      expect(result.length).toEqual(1);
      expect(result[0].name).toEqual('Digital Product');
      expect(result[0].type).toEqual('digital_product');
    });
  });

  describe('generateCustomerReport', () => {
    it('should generate customer report with no customers', async () => {
      const start_date = new Date('2024-01-01');
      const end_date = new Date('2024-12-31');

      const result = await generateCustomerReport({ start_date, end_date });

      expect(result.total_customers).toEqual(0);
      expect(result.new_customers).toEqual(0);
      expect(result.returning_customers).toEqual(0);
      expect(result.top_customers).toEqual([]);
    });

    it('should generate customer report with customers and orders', async () => {
      const users = await db.insert(usersTable).values([
        {
          email: 'customer1@example.com',
          password_hash: 'hash',
          first_name: 'John',
          last_name: 'Doe',
          role: 'customer',
          created_at: new Date('2024-01-10')
        },
        {
          email: 'customer2@example.com',
          password_hash: 'hash',
          first_name: 'Jane',
          last_name: 'Smith',
          role: 'customer',
          created_at: new Date('2024-01-15')
        }
      ]).returning().execute();

      await db.insert(ordersTable).values([
        {
          user_id: users[0].id,
          total_amount: '500.00',
          discount_amount: '0.00',
          final_amount: '500.00',
          status: 'completed',
          payment_status: 'completed',
          created_at: new Date('2024-01-20')
        },
        {
          user_id: users[0].id,
          total_amount: '300.00',
          discount_amount: '0.00',
          final_amount: '300.00',
          status: 'completed',
          payment_status: 'completed',
          created_at: new Date('2024-01-25')
        },
        {
          user_id: users[1].id,
          total_amount: '200.00',
          discount_amount: '0.00',
          final_amount: '200.00',
          status: 'completed',
          payment_status: 'completed',
          created_at: new Date('2024-01-22')
        }
      ]).execute();

      const start_date = new Date('2024-01-01');
      const end_date = new Date('2024-01-31');

      const result = await generateCustomerReport({ start_date, end_date });

      expect(result.total_customers).toEqual(2);
      expect(result.new_customers).toEqual(2);
      expect(result.top_customers.length).toEqual(2);
      expect(result.top_customers[0].name).toEqual('John Doe');
      expect(result.top_customers[0].total_spent).toEqual(800.00);
      expect(result.top_customers[0].total_orders).toEqual(2);
    });
  });

  describe('generateInventoryReport', () => {
    it('should generate inventory report with different stock statuses', async () => {
      const category = await db.insert(categoriesTable).values({
        name: 'Test Category',
        description: 'A test category',
        slug: 'test-category'
      }).returning().execute();

      await db.insert(productsTable).values([
        {
          name: 'Digital Product',
          description: 'A digital product',
          price: '99.99',
          type: 'digital_product',
          category_id: category[0].id,
          stock_quantity: null // Digital products don't have stock
        },
        {
          name: 'Physical Product',
          description: 'A physical product in stock',
          price: '149.99',
          type: 'service', // Using service type but with stock
          category_id: category[0].id,
          stock_quantity: 50
        },
        {
          name: 'Low Stock Product',
          description: 'A product with low stock',
          price: '199.99',
          type: 'service',
          category_id: category[0].id,
          stock_quantity: 5
        },
        {
          name: 'Out of Stock Product',
          description: 'A product out of stock',
          price: '299.99',
          type: 'service',
          category_id: category[0].id,
          stock_quantity: 0
        }
      ]).execute();

      const result = await generateInventoryReport();

      expect(result.length).toEqual(4);
      
      const digitalProduct = result.find(p => p.name === 'Digital Product');
      expect(digitalProduct?.status).toEqual('digital');
      expect(digitalProduct?.reorder_needed).toEqual(false);

      const inStockProduct = result.find(p => p.name === 'Physical Product');
      expect(inStockProduct?.status).toEqual('in_stock');
      expect(inStockProduct?.reorder_needed).toEqual(false);

      const lowStockProduct = result.find(p => p.name === 'Low Stock Product');
      expect(lowStockProduct?.status).toEqual('low_stock');
      expect(lowStockProduct?.reorder_needed).toEqual(true);

      const outOfStockProduct = result.find(p => p.name === 'Out of Stock Product');
      expect(outOfStockProduct?.status).toEqual('out_of_stock');
      expect(outOfStockProduct?.reorder_needed).toEqual(true);
    });

    it('should only include active products', async () => {
      const category = await db.insert(categoriesTable).values({
        name: 'Test Category',
        description: 'A test category',
        slug: 'test-category'
      }).returning().execute();

      await db.insert(productsTable).values([
        {
          name: 'Active Product',
          description: 'An active product',
          price: '99.99',
          type: 'digital_product',
          category_id: category[0].id,
          is_active: true
        },
        {
          name: 'Inactive Product',
          description: 'An inactive product',
          price: '149.99',
          type: 'service',
          category_id: category[0].id,
          is_active: false
        }
      ]).execute();

      const result = await generateInventoryReport();

      expect(result.length).toEqual(1);
      expect(result[0].name).toEqual('Active Product');
    });
  });

  describe('generateRevenueReport', () => {
    it('should generate revenue report grouped by day', async () => {
      const user = await db.insert(usersTable).values({
        email: 'test@example.com',
        password_hash: 'hash',
        first_name: 'Test',
        last_name: 'User',
        role: 'customer'
      }).returning().execute();

      await db.insert(ordersTable).values([
        {
          user_id: user[0].id,
          total_amount: '100.00',
          discount_amount: '0.00',
          final_amount: '100.00',
          status: 'completed',
          payment_status: 'completed',
          created_at: new Date('2024-01-15T10:00:00Z')
        },
        {
          user_id: user[0].id,
          total_amount: '200.00',
          discount_amount: '0.00',
          final_amount: '200.00',
          status: 'completed',
          payment_status: 'completed',
          created_at: new Date('2024-01-15T14:00:00Z')
        },
        {
          user_id: user[0].id,
          total_amount: '150.00',
          discount_amount: '0.00',
          final_amount: '150.00',
          status: 'completed',
          payment_status: 'completed',
          created_at: new Date('2024-01-16T10:00:00Z')
        }
      ]).execute();

      const start_date = new Date('2024-01-01');
      const end_date = new Date('2024-01-31');

      const result = await generateRevenueReport({ 
        start_date, 
        end_date, 
        group_by: 'day' 
      });

      expect(result.length).toEqual(2);
      expect(result[0].period).toEqual('2024-01-15');
      expect(result[0].revenue).toEqual(300.00);
      expect(result[0].orders).toEqual(2);
      expect(result[0].average_order_value).toEqual(150.00);
      
      expect(result[1].period).toEqual('2024-01-16');
      expect(result[1].revenue).toEqual(150.00);
      expect(result[1].orders).toEqual(1);
    });

    it('should generate revenue report grouped by month', async () => {
      const user = await db.insert(usersTable).values({
        email: 'test@example.com',
        password_hash: 'hash',
        first_name: 'Test',
        last_name: 'User',
        role: 'customer'
      }).returning().execute();

      await db.insert(ordersTable).values([
        {
          user_id: user[0].id,
          total_amount: '100.00',
          discount_amount: '0.00',
          final_amount: '100.00',
          status: 'completed',
          payment_status: 'completed',
          created_at: new Date('2024-01-15')
        },
        {
          user_id: user[0].id,
          total_amount: '200.00',
          discount_amount: '0.00',
          final_amount: '200.00',
          status: 'completed',
          payment_status: 'completed',
          created_at: new Date('2024-02-15')
        }
      ]).execute();

      const start_date = new Date('2024-01-01');
      const end_date = new Date('2024-12-31');

      const result = await generateRevenueReport({ 
        start_date, 
        end_date, 
        group_by: 'month' 
      });

      expect(result.length).toEqual(2);
      expect(result[0].period).toEqual('2024-01-01');
      expect(result[0].revenue).toEqual(100.00);
      expect(result[1].period).toEqual('2024-02-01');
      expect(result[1].revenue).toEqual(200.00);
    });
  });

  describe('generateCouponReport', () => {
    it('should generate coupon report with no usage', async () => {
      await db.insert(couponsTable).values({
        code: 'SAVE10',
        type: 'percentage',
        value: '10.00',
        minimum_order_amount: '50.00',
        usage_limit: 100,
        used_count: 0
      }).execute();

      const result = await generateCouponReport();

      expect(result.length).toEqual(1);
      expect(result[0].code).toEqual('SAVE10');
      expect(result[0].type).toEqual('percentage');
      expect(result[0].value).toEqual(10.00);
      expect(result[0].used_count).toEqual(0);
      expect(result[0].total_discount_given).toEqual(0);
      expect(result[0].revenue_impact).toEqual(0);
    });

    it('should generate coupon report with usage data', async () => {
      const user = await db.insert(usersTable).values({
        email: 'test@example.com',
        password_hash: 'hash',
        first_name: 'Test',
        last_name: 'User',
        role: 'customer'
      }).returning().execute();

      const coupon = await db.insert(couponsTable).values({
        code: 'SAVE20',
        type: 'fixed_amount',
        value: '20.00',
        minimum_order_amount: '100.00',
        usage_limit: 50,
        used_count: 2
      }).returning().execute();

      await db.insert(ordersTable).values([
        {
          user_id: user[0].id,
          total_amount: '200.00',
          discount_amount: '20.00',
          final_amount: '180.00',
          coupon_id: coupon[0].id,
          status: 'completed',
          payment_status: 'completed'
        },
        {
          user_id: user[0].id,
          total_amount: '150.00',
          discount_amount: '20.00',
          final_amount: '130.00',
          coupon_id: coupon[0].id,
          status: 'completed',
          payment_status: 'completed'
        }
      ]).execute();

      const result = await generateCouponReport();

      expect(result.length).toEqual(1);
      expect(result[0].code).toEqual('SAVE20');
      expect(result[0].used_count).toEqual(2);
      expect(result[0].total_discount_given).toEqual(40.00);
      expect(result[0].revenue_impact).toEqual(310.00);
      expect(result[0].conversion_rate).toEqual(2);
    });
  });
});