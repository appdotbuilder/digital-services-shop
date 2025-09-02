import { db } from '../db';
import { reviewsTable, usersTable, productsTable, orderItemsTable, ordersTable } from '../db/schema';
import { type Review, type CreateReviewInput } from '../schema';
import { eq, and, count, avg, sum, sql, SQL } from 'drizzle-orm';

export async function createReview(input: CreateReviewInput): Promise<Review> {
  try {
    // First verify that the product exists
    const productExists = await db.select()
      .from(productsTable)
      .where(eq(productsTable.id, input.product_id))
      .limit(1)
      .execute();

    if (productExists.length === 0) {
      throw new Error('Product not found');
    }

    // Check if user has already reviewed this product
    const existingReview = await db.select()
      .from(reviewsTable)
      .where(
        and(
          eq(reviewsTable.user_id, input.user_id),
          eq(reviewsTable.product_id, input.product_id)
        )
      )
      .limit(1)
      .execute();

    if (existingReview.length > 0) {
      throw new Error('User has already reviewed this product');
    }

    // Verify that the user has actually purchased this product
    const purchaseCheck = await db.select()
      .from(orderItemsTable)
      .innerJoin(ordersTable, eq(orderItemsTable.order_id, ordersTable.id))
      .where(
        and(
          eq(ordersTable.user_id, input.user_id),
          eq(orderItemsTable.product_id, input.product_id),
          eq(ordersTable.status, 'completed')
        )
      )
      .limit(1)
      .execute();

    if (purchaseCheck.length === 0) {
      throw new Error('User must purchase the product before reviewing it');
    }

    // Create the review
    const result = await db.insert(reviewsTable)
      .values({
        user_id: input.user_id,
        product_id: input.product_id,
        rating: input.rating,
        comment: input.comment,
        is_approved: false // Default to pending approval
      })
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('Review creation failed:', error);
    throw error;
  }
}

export async function getProductReviews(productId: number, approved: boolean = true): Promise<Array<Review & {
  user: { first_name: string; last_name: string };
}>> {
  try {
    const conditions: SQL<unknown>[] = [eq(reviewsTable.product_id, productId)];
    
    if (approved) {
      conditions.push(eq(reviewsTable.is_approved, true));
    }

    const results = await db.select({
      id: reviewsTable.id,
      user_id: reviewsTable.user_id,
      product_id: reviewsTable.product_id,
      rating: reviewsTable.rating,
      comment: reviewsTable.comment,
      is_approved: reviewsTable.is_approved,
      created_at: reviewsTable.created_at,
      updated_at: reviewsTable.updated_at,
      user: {
        first_name: usersTable.first_name,
        last_name: usersTable.last_name
      }
    })
      .from(reviewsTable)
      .innerJoin(usersTable, eq(reviewsTable.user_id, usersTable.id))
      .where(conditions.length === 1 ? conditions[0] : and(...conditions))
      .execute();

    return results;
  } catch (error) {
    console.error('Failed to fetch product reviews:', error);
    throw error;
  }
}

export async function getPendingReviews(): Promise<Array<Review & {
  user: { first_name: string; last_name: string; email: string };
  product: { name: string };
}>> {
  try {
    const results = await db.select({
      id: reviewsTable.id,
      user_id: reviewsTable.user_id,
      product_id: reviewsTable.product_id,
      rating: reviewsTable.rating,
      comment: reviewsTable.comment,
      is_approved: reviewsTable.is_approved,
      created_at: reviewsTable.created_at,
      updated_at: reviewsTable.updated_at,
      user: {
        first_name: usersTable.first_name,
        last_name: usersTable.last_name,
        email: usersTable.email
      },
      product: {
        name: productsTable.name
      }
    })
      .from(reviewsTable)
      .innerJoin(usersTable, eq(reviewsTable.user_id, usersTable.id))
      .innerJoin(productsTable, eq(reviewsTable.product_id, productsTable.id))
      .where(eq(reviewsTable.is_approved, false))
      .execute();

    return results;
  } catch (error) {
    console.error('Failed to fetch pending reviews:', error);
    throw error;
  }
}

export async function approveReview(id: number): Promise<Review> {
  try {
    // Check if review exists
    const existingReview = await db.select()
      .from(reviewsTable)
      .where(eq(reviewsTable.id, id))
      .limit(1)
      .execute();

    if (existingReview.length === 0) {
      throw new Error('Review not found');
    }

    const result = await db.update(reviewsTable)
      .set({ 
        is_approved: true,
        updated_at: new Date()
      })
      .where(eq(reviewsTable.id, id))
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('Failed to approve review:', error);
    throw error;
  }
}

export async function rejectReview(id: number): Promise<{ success: boolean }> {
  try {
    // Check if review exists before deletion
    const existingReview = await db.select()
      .from(reviewsTable)
      .where(eq(reviewsTable.id, id))
      .limit(1)
      .execute();

    if (existingReview.length === 0) {
      throw new Error('Review not found');
    }

    await db.delete(reviewsTable)
      .where(eq(reviewsTable.id, id))
      .execute();

    return { success: true };
  } catch (error) {
    console.error('Failed to reject review:', error);
    throw error;
  }
}

export async function getUserReviews(userId: number): Promise<Array<Review & {
  product: { name: string; image_url: string | null };
}>> {
  try {
    const results = await db.select({
      id: reviewsTable.id,
      user_id: reviewsTable.user_id,
      product_id: reviewsTable.product_id,
      rating: reviewsTable.rating,
      comment: reviewsTable.comment,
      is_approved: reviewsTable.is_approved,
      created_at: reviewsTable.created_at,
      updated_at: reviewsTable.updated_at,
      product: {
        name: productsTable.name,
        image_url: productsTable.image_url
      }
    })
      .from(reviewsTable)
      .innerJoin(productsTable, eq(reviewsTable.product_id, productsTable.id))
      .where(eq(reviewsTable.user_id, userId))
      .execute();

    return results;
  } catch (error) {
    console.error('Failed to fetch user reviews:', error);
    throw error;
  }
}

export async function getProductRatingSummary(productId: number): Promise<{
  averageRating: number;
  totalReviews: number;
  ratingDistribution: {
    1: number;
    2: number;
    3: number;
    4: number;
    5: number;
  };
}> {
  try {
    // Get approved reviews only for rating calculations
    const conditions = and(
      eq(reviewsTable.product_id, productId),
      eq(reviewsTable.is_approved, true)
    );

    // Get average rating and total count
    const summaryResult = await db.select({
      averageRating: avg(reviewsTable.rating),
      totalReviews: count(reviewsTable.id)
    })
      .from(reviewsTable)
      .where(conditions)
      .execute();

    // Get rating distribution
    const distributionResult = await db.select({
      rating: reviewsTable.rating,
      count: count(reviewsTable.id)
    })
      .from(reviewsTable)
      .where(conditions)
      .groupBy(reviewsTable.rating)
      .execute();

    const summary = summaryResult[0];
    const averageRating = summary.averageRating ? parseFloat(summary.averageRating as string) : 0;
    const totalReviews = summary.totalReviews;

    // Initialize rating distribution
    const ratingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

    // Fill in the actual distribution
    distributionResult.forEach(item => {
      const rating = item.rating as keyof typeof ratingDistribution;
      ratingDistribution[rating] = item.count;
    });

    return {
      averageRating: Math.round(averageRating * 10) / 10, // Round to 1 decimal place
      totalReviews,
      ratingDistribution
    };
  } catch (error) {
    console.error('Failed to get product rating summary:', error);
    throw error;
  }
}