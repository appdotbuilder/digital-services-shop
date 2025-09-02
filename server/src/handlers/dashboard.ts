import { db } from '../db';
import { 
  categoriesTable, 
  productsTable, 
  usersTable, 
  ordersTable, 
  orderItemsTable 
} from '../db/schema';
import { type DashboardStats, type DailyVisitor } from '../schema';
import { count, sum, and, eq, gte, lt, desc, sql } from 'drizzle-orm';

export async function getDashboardStats(): Promise<DashboardStats> {
  try {
    // Get total categories
    const [categoriesResult] = await db
      .select({ count: count() })
      .from(categoriesTable)
      .execute();

    // Get total products
    const [productsResult] = await db
      .select({ count: count() })
      .from(productsTable)
      .execute();

    // Get total customers (users with customer role)
    const [customersResult] = await db
      .select({ count: count() })
      .from(usersTable)
      .where(eq(usersTable.role, 'customer'))
      .execute();

    // Get total orders
    const [ordersResult] = await db
      .select({ count: count() })
      .from(ordersTable)
      .execute();

    // Get total revenue (sum of final_amount from completed orders)
    const [revenueResult] = await db
      .select({ total: sum(ordersTable.final_amount) })
      .from(ordersTable)
      .where(eq(ordersTable.status, 'completed'))
      .execute();

    // Get pending orders count
    const [pendingOrdersResult] = await db
      .select({ count: count() })
      .from(ordersTable)
      .where(eq(ordersTable.status, 'pending'))
      .execute();

    // Get completed orders count
    const [completedOrdersResult] = await db
      .select({ count: count() })
      .from(ordersTable)
      .where(eq(ordersTable.status, 'completed'))
      .execute();

    return {
      total_categories: categoriesResult.count,
      total_products: productsResult.count,
      total_customers: customersResult.count,
      total_orders: ordersResult.count,
      total_revenue: revenueResult.total ? parseFloat(revenueResult.total) : 0,
      pending_orders: pendingOrdersResult.count,
      completed_orders: completedOrdersResult.count
    };
  } catch (error) {
    console.error('Dashboard stats calculation failed:', error);
    throw error;
  }
}

export async function getDailyVisitors(days: number = 30): Promise<DailyVisitor[]> {
  try {
    // Get date range
    const endDate = new Date();
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - days);

    // Generate array of dates for the last N days
    const dateArray: DailyVisitor[] = [];
    for (let i = 0; i < days; i++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(currentDate.getDate() + i);
      
      dateArray.push({
        date: currentDate.toISOString().split('T')[0], // Format as YYYY-MM-DD
        visitors: Math.floor(Math.random() * 100) + 20 // Mock data for now
      });
    }

    return dateArray;
  } catch (error) {
    console.error('Daily visitors calculation failed:', error);
    throw error;
  }
}

export async function getRevenueByMonth(months: number = 12): Promise<Array<{
  month: string;
  revenue: number;
  orders: number;
}>> {
  try {
    const results: Array<{
      month: string;
      revenue: number;
      orders: number;
    }> = [];

    // Generate data for each month going back from current month
    const currentDate = new Date();
    
    for (let i = months - 1; i >= 0; i--) {
      const monthDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
      const nextMonthDate = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1);
      
      // Get revenue and order count for this month
      const [monthData] = await db
        .select({
          revenue: sum(ordersTable.final_amount),
          orders: count()
        })
        .from(ordersTable)
        .where(
          and(
            gte(ordersTable.created_at, monthDate),
            lt(ordersTable.created_at, nextMonthDate),
            eq(ordersTable.status, 'completed')
          )
        )
        .execute();

      results.push({
        month: monthDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short' }),
        revenue: monthData.revenue ? parseFloat(monthData.revenue) : 0,
        orders: monthData.orders
      });
    }

    return results;
  } catch (error) {
    console.error('Revenue by month calculation failed:', error);
    throw error;
  }
}

export async function getTopProducts(limit: number = 10): Promise<Array<{
  id: number;
  name: string;
  total_sales: number;
  revenue: number;
  order_count: number;
}>> {
  try {
    const results = await db
      .select({
        id: productsTable.id,
        name: productsTable.name,
        total_sales: sum(orderItemsTable.quantity),
        revenue: sum(orderItemsTable.total_price),
        order_count: count(orderItemsTable.id)
      })
      .from(orderItemsTable)
      .innerJoin(productsTable, eq(orderItemsTable.product_id, productsTable.id))
      .innerJoin(ordersTable, eq(orderItemsTable.order_id, ordersTable.id))
      .where(eq(ordersTable.status, 'completed'))
      .groupBy(productsTable.id, productsTable.name)
      .orderBy(desc(sum(orderItemsTable.quantity)))
      .limit(limit)
      .execute();

    return results.map(result => ({
      id: result.id,
      name: result.name,
      total_sales: result.total_sales ? parseInt(result.total_sales.toString()) : 0,
      revenue: result.revenue ? parseFloat(result.revenue) : 0,
      order_count: result.order_count
    }));
  } catch (error) {
    console.error('Top products calculation failed:', error);
    throw error;
  }
}

export async function getRecentOrders(limit: number = 10): Promise<Array<{
  id: number;
  user_name: string;
  final_amount: number;
  status: 'pending' | 'processing' | 'completed' | 'cancelled' | 'refunded';
  created_at: Date;
}>> {
  try {
    const results = await db
      .select({
        id: ordersTable.id,
        user_first_name: usersTable.first_name,
        user_last_name: usersTable.last_name,
        final_amount: ordersTable.final_amount,
        status: ordersTable.status,
        created_at: ordersTable.created_at
      })
      .from(ordersTable)
      .innerJoin(usersTable, eq(ordersTable.user_id, usersTable.id))
      .orderBy(desc(ordersTable.created_at))
      .limit(limit)
      .execute();

    return results.map(result => ({
      id: result.id,
      user_name: `${result.user_first_name} ${result.user_last_name}`,
      final_amount: parseFloat(result.final_amount),
      status: result.status,
      created_at: result.created_at
    }));
  } catch (error) {
    console.error('Recent orders calculation failed:', error);
    throw error;
  }
}

export async function getCustomerStats(): Promise<{
  total_customers: number;
  new_customers_this_month: number;
  repeat_customers: number;
  customer_retention_rate: number;
}> {
  try {
    // Get total customers
    const [totalCustomersResult] = await db
      .select({ count: count() })
      .from(usersTable)
      .where(eq(usersTable.role, 'customer'))
      .execute();

    // Get new customers this month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [newCustomersResult] = await db
      .select({ count: count() })
      .from(usersTable)
      .where(
        and(
          eq(usersTable.role, 'customer'),
          gte(usersTable.created_at, startOfMonth)
        )
      )
      .execute();

    // Get repeat customers (customers with more than one order)
    const repeatCustomersResult = await db
      .select({
        user_id: ordersTable.user_id,
        order_count: count()
      })
      .from(ordersTable)
      .groupBy(ordersTable.user_id)
      .having(sql`count(*) > 1`)
      .execute();

    const totalCustomers = totalCustomersResult.count;
    const repeatCustomersCount = repeatCustomersResult.length;
    const retentionRate = totalCustomers > 0 ? (repeatCustomersCount / totalCustomers) * 100 : 0;

    return {
      total_customers: totalCustomers,
      new_customers_this_month: newCustomersResult.count,
      repeat_customers: repeatCustomersCount,
      customer_retention_rate: Math.round(retentionRate * 100) / 100 // Round to 2 decimal places
    };
  } catch (error) {
    console.error('Customer stats calculation failed:', error);
    throw error;
  }
}

export async function getProductStats(): Promise<{
  total_products: number;
  digital_products: number;
  services: number;
  active_products: number;
  out_of_stock: number;
}> {
  try {
    // Get total products
    const [totalProductsResult] = await db
      .select({ count: count() })
      .from(productsTable)
      .execute();

    // Get digital products count
    const [digitalProductsResult] = await db
      .select({ count: count() })
      .from(productsTable)
      .where(eq(productsTable.type, 'digital_product'))
      .execute();

    // Get services count
    const [servicesResult] = await db
      .select({ count: count() })
      .from(productsTable)
      .where(eq(productsTable.type, 'service'))
      .execute();

    // Get active products count
    const [activeProductsResult] = await db
      .select({ count: count() })
      .from(productsTable)
      .where(eq(productsTable.is_active, true))
      .execute();

    // Get out of stock products count (products with stock_quantity = 0)
    const [outOfStockResult] = await db
      .select({ count: count() })
      .from(productsTable)
      .where(eq(productsTable.stock_quantity, 0))
      .execute();

    return {
      total_products: totalProductsResult.count,
      digital_products: digitalProductsResult.count,
      services: servicesResult.count,
      active_products: activeProductsResult.count,
      out_of_stock: outOfStockResult.count
    };
  } catch (error) {
    console.error('Product stats calculation failed:', error);
    throw error;
  }
}