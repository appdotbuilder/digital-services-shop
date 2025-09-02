import { db } from '../db';
import { 
  ordersTable, 
  orderItemsTable, 
  productsTable, 
  categoriesTable, 
  usersTable,
  reviewsTable,
  couponsTable
} from '../db/schema';
import { eq, gte, lte, and, sql, desc, count, sum, avg, isNotNull } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

export async function generateSalesReport(params: {
    start_date: Date;
    end_date: Date;
    format?: 'json' | 'csv';
}): Promise<{
    total_orders: number;
    total_revenue: number;
    average_order_value: number;
    orders_by_status: Record<string, number>;
    daily_sales: Array<{
        date: string;
        orders: number;
        revenue: number;
    }>;
}> {
    try {
        const { start_date, end_date } = params;

        // Get basic stats
        const statsQuery = await db.select({
            total_orders: count(ordersTable.id),
            total_revenue: sum(ordersTable.final_amount),
            average_order_value: avg(ordersTable.final_amount)
        })
        .from(ordersTable)
        .where(and(
            gte(ordersTable.created_at, start_date),
            lte(ordersTable.created_at, end_date)
        ))
        .execute();

        const stats = statsQuery[0] || { total_orders: 0, total_revenue: null, average_order_value: null };

        // Get orders by status
        const statusQuery = await db.select({
            status: ordersTable.status,
            count: count(ordersTable.id)
        })
        .from(ordersTable)
        .where(and(
            gte(ordersTable.created_at, start_date),
            lte(ordersTable.created_at, end_date)
        ))
        .groupBy(ordersTable.status)
        .execute();

        const orders_by_status: Record<string, number> = {};
        statusQuery.forEach(row => {
            orders_by_status[row.status] = row.count;
        });

        // Get daily sales
        const dailySalesQuery = await db.select({
            date: sql<string>`date_trunc('day', ${ordersTable.created_at})::date`,
            orders: count(ordersTable.id),
            revenue: sum(ordersTable.final_amount)
        })
        .from(ordersTable)
        .where(and(
            gte(ordersTable.created_at, start_date),
            lte(ordersTable.created_at, end_date)
        ))
        .groupBy(sql`date_trunc('day', ${ordersTable.created_at})::date`)
        .orderBy(sql`date_trunc('day', ${ordersTable.created_at})::date`)
        .execute();

        const daily_sales = dailySalesQuery.map(row => ({
            date: row.date,
            orders: row.orders,
            revenue: parseFloat(row.revenue || '0')
        }));

        return {
            total_orders: stats.total_orders,
            total_revenue: parseFloat(stats.total_revenue || '0'),
            average_order_value: parseFloat(stats.average_order_value || '0'),
            orders_by_status,
            daily_sales
        };
    } catch (error) {
        console.error('Sales report generation failed:', error);
        throw error;
    }
}

export async function generateProductReport(params?: {
    category_id?: number;
    product_type?: 'digital_product' | 'service';
}): Promise<Array<{
    id: number;
    name: string;
    category: string;
    type: 'digital_product' | 'service';
    total_sales: number;
    revenue: number;
    average_rating: number;
    stock_quantity: number | null;
}>> {
    try {
        // Build base product query
        let baseQuery = db.select({
            id: productsTable.id,
            name: productsTable.name,
            category: categoriesTable.name,
            type: productsTable.type,
            stock_quantity: productsTable.stock_quantity
        })
        .from(productsTable)
        .innerJoin(categoriesTable, eq(productsTable.category_id, categoriesTable.id));

        // Apply filters
        const conditions: SQL<unknown>[] = [];
        
        if (params?.category_id) {
            conditions.push(eq(productsTable.category_id, params.category_id));
        }
        
        if (params?.product_type) {
            conditions.push(eq(productsTable.type, params.product_type));
        }

        // Apply where clause if conditions exist
        const queryWithFilters = conditions.length > 0
            ? baseQuery.where(and(...conditions))
            : baseQuery;

        const products = await queryWithFilters.execute();

        // Get sales data for all products
        const salesData = await db.select({
            product_id: orderItemsTable.product_id,
            total_sales: sum(orderItemsTable.quantity),
            revenue: sum(orderItemsTable.total_price)
        })
        .from(orderItemsTable)
        .groupBy(orderItemsTable.product_id)
        .execute();

        // Get ratings data for all products
        const ratingsData = await db.select({
            product_id: reviewsTable.product_id,
            average_rating: avg(reviewsTable.rating)
        })
        .from(reviewsTable)
        .groupBy(reviewsTable.product_id)
        .execute();

        // Combine data
        return products.map(product => {
            const sales = salesData.find(s => s.product_id === product.id);
            const ratings = ratingsData.find(r => r.product_id === product.id);

            return {
                id: product.id,
                name: product.name,
                category: product.category,
                type: product.type,
                total_sales: parseInt(sales?.total_sales || '0'),
                revenue: parseFloat(sales?.revenue || '0'),
                average_rating: parseFloat(ratings?.average_rating || '0'),
                stock_quantity: product.stock_quantity
            };
        });
    } catch (error) {
        console.error('Product report generation failed:', error);
        throw error;
    }
}

export async function generateCustomerReport(params: {
    start_date: Date;
    end_date: Date;
}): Promise<{
    total_customers: number;
    new_customers: number;
    returning_customers: number;
    top_customers: Array<{
        id: number;
        name: string;
        email: string;
        total_orders: number;
        total_spent: number;
    }>;
}> {
    try {
        const { start_date, end_date } = params;

        // Get total customers who have orders
        const totalCustomersQuery = await db.select({
            count: count(sql`DISTINCT ${ordersTable.user_id}`)
        })
        .from(ordersTable)
        .where(and(
            gte(ordersTable.created_at, start_date),
            lte(ordersTable.created_at, end_date)
        ))
        .execute();

        // Get new customers (first order in date range)
        const newCustomersQuery = await db.select({
            count: count()
        })
        .from(usersTable)
        .where(and(
            gte(usersTable.created_at, start_date),
            lte(usersTable.created_at, end_date)
        ))
        .execute();

        // Get returning customers (customers with orders before start_date and also in date range)
        const returningCustomersQuery = await db.select({
            count: count(sql`DISTINCT ${ordersTable.user_id}`)
        })
        .from(ordersTable)
        .where(and(
            gte(ordersTable.created_at, start_date),
            lte(ordersTable.created_at, end_date),
            sql`${ordersTable.user_id} IN (
                SELECT DISTINCT user_id FROM ${ordersTable} 
                WHERE created_at < ${start_date}
            )`
        ))
        .execute();

        // Get top customers
        const topCustomersQuery = await db.select({
            id: usersTable.id,
            first_name: usersTable.first_name,
            last_name: usersTable.last_name,
            email: usersTable.email,
            total_orders: count(ordersTable.id),
            total_spent: sum(ordersTable.final_amount)
        })
        .from(usersTable)
        .innerJoin(ordersTable, eq(usersTable.id, ordersTable.user_id))
        .where(and(
            gte(ordersTable.created_at, start_date),
            lte(ordersTable.created_at, end_date)
        ))
        .groupBy(usersTable.id, usersTable.first_name, usersTable.last_name, usersTable.email)
        .orderBy(desc(sum(ordersTable.final_amount)))
        .limit(10)
        .execute();

        const top_customers = topCustomersQuery.map(row => ({
            id: row.id,
            name: `${row.first_name} ${row.last_name}`,
            email: row.email,
            total_orders: row.total_orders,
            total_spent: parseFloat(row.total_spent || '0')
        }));

        return {
            total_customers: totalCustomersQuery[0]?.count || 0,
            new_customers: newCustomersQuery[0]?.count || 0,
            returning_customers: returningCustomersQuery[0]?.count || 0,
            top_customers
        };
    } catch (error) {
        console.error('Customer report generation failed:', error);
        throw error;
    }
}

export async function generateInventoryReport(): Promise<Array<{
    id: number;
    name: string;
    category: string;
    stock_quantity: number | null;
    status: 'in_stock' | 'low_stock' | 'out_of_stock' | 'digital';
    reorder_needed: boolean;
}>> {
    try {
        const results = await db.select({
            id: productsTable.id,
            name: productsTable.name,
            category: categoriesTable.name,
            type: productsTable.type,
            stock_quantity: productsTable.stock_quantity
        })
        .from(productsTable)
        .innerJoin(categoriesTable, eq(productsTable.category_id, categoriesTable.id))
        .where(eq(productsTable.is_active, true))
        .execute();

        return results.map(row => {
            let status: 'in_stock' | 'low_stock' | 'out_of_stock' | 'digital';
            let reorder_needed = false;

            if (row.type === 'digital_product') {
                status = 'digital';
            } else if (row.type === 'service' && (row.stock_quantity === null || row.stock_quantity > 10)) {
                status = 'in_stock'; // Services are typically available
            } else if (row.stock_quantity === null || row.stock_quantity === 0) {
                status = 'out_of_stock';
                reorder_needed = true;
            } else if (row.stock_quantity <= 10) {
                status = 'low_stock';
                reorder_needed = true;
            } else {
                status = 'in_stock';
            }

            return {
                id: row.id,
                name: row.name,
                category: row.category,
                stock_quantity: row.stock_quantity,
                status,
                reorder_needed
            };
        });
    } catch (error) {
        console.error('Inventory report generation failed:', error);
        throw error;
    }
}

export async function generateRevenueReport(params: {
    start_date: Date;
    end_date: Date;
    group_by: 'day' | 'week' | 'month';
}): Promise<Array<{
    period: string;
    revenue: number;
    orders: number;
    average_order_value: number;
}>> {
    try {
        const { start_date, end_date, group_by } = params;

        let dateFormat: string;
        switch (group_by) {
            case 'day':
                dateFormat = 'day';
                break;
            case 'week':
                dateFormat = 'week';
                break;
            case 'month':
                dateFormat = 'month';
                break;
            default:
                dateFormat = 'day';
        }

        const results = await db.select({
            period: sql<string>`date_trunc('${sql.raw(dateFormat)}', ${ordersTable.created_at})::date`,
            revenue: sum(ordersTable.final_amount),
            orders: count(ordersTable.id),
            average_order_value: avg(ordersTable.final_amount)
        })
        .from(ordersTable)
        .where(and(
            gte(ordersTable.created_at, start_date),
            lte(ordersTable.created_at, end_date)
        ))
        .groupBy(sql`date_trunc('${sql.raw(dateFormat)}', ${ordersTable.created_at})::date`)
        .orderBy(sql`date_trunc('${sql.raw(dateFormat)}', ${ordersTable.created_at})::date`)
        .execute();

        return results.map(row => ({
            period: row.period,
            revenue: parseFloat(row.revenue || '0'),
            orders: row.orders,
            average_order_value: parseFloat(row.average_order_value || '0')
        }));
    } catch (error) {
        console.error('Revenue report generation failed:', error);
        throw error;
    }
}

export async function generateCouponReport(): Promise<Array<{
    id: number;
    code: string;
    type: 'percentage' | 'fixed_amount';
    value: number;
    used_count: number;
    total_discount_given: number;
    revenue_impact: number;
    conversion_rate: number;
}>> {
    try {
        const results = await db.select({
            id: couponsTable.id,
            code: couponsTable.code,
            type: couponsTable.type,
            value: couponsTable.value,
            used_count: couponsTable.used_count,
            total_discount_given: sql<string>`COALESCE(SUM(${ordersTable.discount_amount}), 0)`,
            total_revenue: sql<string>`COALESCE(SUM(${ordersTable.final_amount}), 0)`
        })
        .from(couponsTable)
        .leftJoin(ordersTable, eq(couponsTable.id, ordersTable.coupon_id))
        .groupBy(couponsTable.id, couponsTable.code, couponsTable.type, couponsTable.value, couponsTable.used_count)
        .execute();

        return results.map(row => {
            const total_discount_given = parseFloat(row.total_discount_given);
            const revenue_impact = parseFloat(row.total_revenue);
            // Simple conversion rate calculation: used_count / total_active_time (simplified to just used_count for now)
            const conversion_rate = row.used_count > 0 ? (row.used_count / 100) * 100 : 0; // Placeholder calculation

            return {
                id: row.id,
                code: row.code,
                type: row.type,
                value: parseFloat(row.value),
                used_count: row.used_count,
                total_discount_given,
                revenue_impact,
                conversion_rate
            };
        });
    } catch (error) {
        console.error('Coupon report generation failed:', error);
        throw error;
    }
}