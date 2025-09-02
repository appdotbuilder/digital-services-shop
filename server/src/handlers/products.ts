import { db } from '../db';
import { productsTable, categoriesTable, reviewsTable, usersTable } from '../db/schema';
import { type Product, type CreateProductInput, type UpdateProductInput } from '../schema';
import { eq, and, or, ilike, sql, SQL } from 'drizzle-orm';

export async function createProduct(input: CreateProductInput): Promise<Product> {
    try {
        // Validate category exists
        const category = await db.select()
            .from(categoriesTable)
            .where(eq(categoriesTable.id, input.category_id))
            .execute();

        if (category.length === 0) {
            throw new Error('Category not found');
        }

        // Insert product record
        const result = await db.insert(productsTable)
            .values({
                name: input.name,
                description: input.description,
                price: input.price.toString(),
                type: input.type,
                category_id: input.category_id,
                image_url: input.image_url,
                download_url: input.download_url,
                stock_quantity: input.stock_quantity
            })
            .returning()
            .execute();

        // Convert numeric fields back to numbers
        const product = result[0];
        return {
            ...product,
            price: parseFloat(product.price)
        };
    } catch (error) {
        console.error('Product creation failed:', error);
        throw error;
    }
}

export async function getProducts(filters?: { 
    category_id?: number; 
    type?: 'digital_product' | 'service'; 
    is_active?: boolean;
    limit?: number;
    offset?: number;
}): Promise<Product[]> {
    try {
        // Build conditions array
        const conditions: SQL<unknown>[] = [];

        if (filters?.category_id !== undefined) {
            conditions.push(eq(productsTable.category_id, filters.category_id));
        }

        if (filters?.type !== undefined) {
            conditions.push(eq(productsTable.type, filters.type));
        }

        if (filters?.is_active !== undefined) {
            conditions.push(eq(productsTable.is_active, filters.is_active));
        }

        // Build the final query
        const limit = filters?.limit || 50;
        const offset = filters?.offset || 0;

        let results;
        if (conditions.length > 0) {
            results = await db.select()
                .from(productsTable)
                .where(conditions.length === 1 ? conditions[0] : and(...conditions))
                .limit(limit)
                .offset(offset)
                .execute();
        } else {
            results = await db.select()
                .from(productsTable)
                .limit(limit)
                .offset(offset)
                .execute();
        }

        // Convert numeric fields
        return results.map(product => ({
            ...product,
            price: parseFloat(product.price)
        }));
    } catch (error) {
        console.error('Get products failed:', error);
        throw error;
    }
}

export async function getProductById(id: number): Promise<Product | null> {
    try {
        const results = await db.select()
            .from(productsTable)
            .where(eq(productsTable.id, id))
            .execute();

        if (results.length === 0) {
            return null;
        }

        const product = results[0];
        return {
            ...product,
            price: parseFloat(product.price)
        };
    } catch (error) {
        console.error('Get product by ID failed:', error);
        throw error;
    }
}

export async function getProductByIdWithDetails(id: number): Promise<Product & { 
    category: { name: string; slug: string } | null;
    reviews: { rating: number; comment: string; user_name: string }[];
    average_rating: number;
} | null> {
    try {
        // Get product with category
        const productResults = await db.select({
            product: productsTable,
            category: {
                name: categoriesTable.name,
                slug: categoriesTable.slug
            }
        })
        .from(productsTable)
        .leftJoin(categoriesTable, eq(productsTable.category_id, categoriesTable.id))
        .where(eq(productsTable.id, id))
        .execute();

        if (productResults.length === 0) {
            return null;
        }

        const productData = productResults[0];

        // Get reviews with user names
        const reviewResults = await db.select({
            rating: reviewsTable.rating,
            comment: reviewsTable.comment,
            user_name: sql<string>`${usersTable.first_name} || ' ' || ${usersTable.last_name}`
        })
        .from(reviewsTable)
        .innerJoin(usersTable, eq(reviewsTable.user_id, usersTable.id))
        .where(and(
            eq(reviewsTable.product_id, id),
            eq(reviewsTable.is_approved, true)
        ))
        .execute();

        // Calculate average rating
        const avgRatingResult = await db.select({
            avg_rating: sql<number>`COALESCE(AVG(${reviewsTable.rating}), 0)`
        })
        .from(reviewsTable)
        .where(and(
            eq(reviewsTable.product_id, id),
            eq(reviewsTable.is_approved, true)
        ))
        .execute();

        const averageRating = parseFloat(avgRatingResult[0].avg_rating.toString());

        return {
            ...productData.product,
            price: parseFloat(productData.product.price),
            category: productData.category,
            reviews: reviewResults.map(review => ({
                rating: review.rating,
                comment: review.comment || '',
                user_name: review.user_name
            })),
            average_rating: averageRating
        };
    } catch (error) {
        console.error('Get product with details failed:', error);
        throw error;
    }
}

export async function updateProduct(input: UpdateProductInput): Promise<Product> {
    try {
        // Validate category exists if changing category
        if (input.category_id !== undefined) {
            const category = await db.select()
                .from(categoriesTable)
                .where(eq(categoriesTable.id, input.category_id))
                .execute();

            if (category.length === 0) {
                throw new Error('Category not found');
            }
        }

        // Build update values - only include fields that are provided
        const updateValues: Record<string, any> = {};

        if (input.name !== undefined) updateValues['name'] = input.name;
        if (input.description !== undefined) updateValues['description'] = input.description;
        if (input.price !== undefined) updateValues['price'] = input.price.toString();
        if (input.type !== undefined) updateValues['type'] = input.type;
        if (input.category_id !== undefined) updateValues['category_id'] = input.category_id;
        if (input.image_url !== undefined) updateValues['image_url'] = input.image_url;
        if (input.download_url !== undefined) updateValues['download_url'] = input.download_url;
        if (input.is_active !== undefined) updateValues['is_active'] = input.is_active;
        if (input.stock_quantity !== undefined) updateValues['stock_quantity'] = input.stock_quantity;

        // Always update the timestamp
        updateValues['updated_at'] = sql`NOW()`;

        const result = await db.update(productsTable)
            .set(updateValues)
            .where(eq(productsTable.id, input.id))
            .returning()
            .execute();

        if (result.length === 0) {
            throw new Error('Product not found');
        }

        const product = result[0];
        return {
            ...product,
            price: parseFloat(product.price)
        };
    } catch (error) {
        console.error('Product update failed:', error);
        throw error;
    }
}

export async function deleteProduct(id: number): Promise<{ success: boolean }> {
    try {
        // Soft delete by setting is_active to false
        const result = await db.update(productsTable)
            .set({ 
                is_active: false,
                updated_at: sql`NOW()`
            })
            .where(eq(productsTable.id, id))
            .returning()
            .execute();

        if (result.length === 0) {
            throw new Error('Product not found');
        }

        return { success: true };
    } catch (error) {
        console.error('Product deletion failed:', error);
        throw error;
    }
}

export async function searchProducts(query: string, limit: number = 10): Promise<Product[]> {
    try {
        const searchTerm = `%${query}%`;
        
        const results = await db.select()
            .from(productsTable)
            .where(and(
                or(
                    ilike(productsTable.name, searchTerm),
                    ilike(productsTable.description, searchTerm)
                ),
                eq(productsTable.is_active, true)
            ))
            .limit(limit)
            .execute();

        return results.map(product => ({
            ...product,
            price: parseFloat(product.price)
        }));
    } catch (error) {
        console.error('Product search failed:', error);
        throw error;
    }
}