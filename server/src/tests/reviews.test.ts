import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, categoriesTable, productsTable, reviewsTable, ordersTable, orderItemsTable } from '../db/schema';
import { type CreateReviewInput } from '../schema';
import { 
  createReview, 
  getProductReviews, 
  getPendingReviews, 
  approveReview, 
  rejectReview, 
  getUserReviews, 
  getProductRatingSummary 
} from '../handlers/reviews';
import { eq } from 'drizzle-orm';

// Test data
const testUser = {
  email: 'test@example.com',
  password_hash: 'hashed_password',
  first_name: 'John',
  last_name: 'Doe',
  role: 'customer' as const
};

const testCategory = {
  name: 'Test Category',
  description: 'A test category',
  slug: 'test-category'
};

const testProduct = {
  name: 'Test Product',
  description: 'A test product',
  price: '29.99', // String for database insertion
  type: 'digital_product' as const,
  category_id: 1, // Will be set after category creation
  image_url: 'http://example.com/image.jpg'
};

const testReviewInput: CreateReviewInput = {
  user_id: 1, // Will be set after user creation
  product_id: 1, // Will be set after product creation
  rating: 5,
  comment: 'Excellent product!'
};

describe('Reviews', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  // Helper function to create prerequisite data
  const createPrerequisiteData = async () => {
    // Create user
    const userResult = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();
    const userId = userResult[0].id;

    // Create category
    const categoryResult = await db.insert(categoriesTable)
      .values(testCategory)
      .returning()
      .execute();
    const categoryId = categoryResult[0].id;

    // Create product
    const productResult = await db.insert(productsTable)
      .values({
        ...testProduct,
        category_id: categoryId
      })
      .returning()
      .execute();
    const productId = productResult[0].id;

    // Create order
    const orderResult = await db.insert(ordersTable)
      .values({
        user_id: userId,
        total_amount: '29.99',
        discount_amount: '0',
        final_amount: '29.99',
        status: 'completed'
      })
      .returning()
      .execute();
    const orderId = orderResult[0].id;

    // Create order item (proving purchase)
    await db.insert(orderItemsTable)
      .values({
        order_id: orderId,
        product_id: productId,
        quantity: 1,
        unit_price: '29.99',
        total_price: '29.99'
      })
      .execute();

    return { userId, categoryId, productId, orderId };
  };

  describe('createReview', () => {
    it('should create a review successfully', async () => {
      const { userId, productId } = await createPrerequisiteData();
      const input = { ...testReviewInput, user_id: userId, product_id: productId };

      const result = await createReview(input);

      expect(result.user_id).toEqual(userId);
      expect(result.product_id).toEqual(productId);
      expect(result.rating).toEqual(5);
      expect(result.comment).toEqual('Excellent product!');
      expect(result.is_approved).toEqual(false);
      expect(result.id).toBeDefined();
      expect(result.created_at).toBeInstanceOf(Date);
      expect(result.updated_at).toBeInstanceOf(Date);
    });

    it('should save review to database', async () => {
      const { userId, productId } = await createPrerequisiteData();
      const input = { ...testReviewInput, user_id: userId, product_id: productId };

      const result = await createReview(input);

      const reviews = await db.select()
        .from(reviewsTable)
        .where(eq(reviewsTable.id, result.id))
        .execute();

      expect(reviews).toHaveLength(1);
      expect(reviews[0].user_id).toEqual(userId);
      expect(reviews[0].product_id).toEqual(productId);
      expect(reviews[0].rating).toEqual(5);
      expect(reviews[0].comment).toEqual('Excellent product!');
      expect(reviews[0].is_approved).toEqual(false);
    });

    it('should reject review if user has not purchased product', async () => {
      const { userId, productId } = await createPrerequisiteData();
      
      // Create another product that user hasn't purchased
      const anotherProductResult = await db.insert(productsTable)
        .values({
          ...testProduct,
          name: 'Another Product',
          category_id: 1
        })
        .returning()
        .execute();
      const anotherProductId = anotherProductResult[0].id;

      const input = { ...testReviewInput, user_id: userId, product_id: anotherProductId };

      await expect(createReview(input)).rejects.toThrow(/must purchase the product/i);
    });

    it('should reject duplicate review from same user', async () => {
      const { userId, productId } = await createPrerequisiteData();
      const input = { ...testReviewInput, user_id: userId, product_id: productId };

      // Create first review
      await createReview(input);

      // Try to create second review
      await expect(createReview(input)).rejects.toThrow(/already reviewed this product/i);
    });

    it('should reject review for non-existent product', async () => {
      const { userId } = await createPrerequisiteData();
      const input = { ...testReviewInput, user_id: userId, product_id: 9999 };

      await expect(createReview(input)).rejects.toThrow(/product not found/i);
    });

    it('should create review with null comment', async () => {
      const { userId, productId } = await createPrerequisiteData();
      const input = { ...testReviewInput, user_id: userId, product_id: productId, comment: null };

      const result = await createReview(input);

      expect(result.comment).toBeNull();
    });
  });

  describe('getProductReviews', () => {
    it('should return approved reviews by default', async () => {
      const { userId, productId } = await createPrerequisiteData();
      
      // Create and approve a review
      const review = await createReview({ ...testReviewInput, user_id: userId, product_id: productId });
      await approveReview(review.id);

      const reviews = await getProductReviews(productId);

      expect(reviews).toHaveLength(1);
      expect(reviews[0].id).toEqual(review.id);
      expect(reviews[0].is_approved).toEqual(true);
      expect(reviews[0].user.first_name).toEqual('John');
      expect(reviews[0].user.last_name).toEqual('Doe');
    });

    it('should return all reviews when approved=false', async () => {
      const { userId, productId } = await createPrerequisiteData();
      
      // Create unapproved review
      await createReview({ ...testReviewInput, user_id: userId, product_id: productId });

      const reviews = await getProductReviews(productId, false);

      expect(reviews).toHaveLength(1);
      expect(reviews[0].is_approved).toEqual(false);
    });

    it('should return empty array for product with no approved reviews', async () => {
      const { userId, productId } = await createPrerequisiteData();
      
      // Create unapproved review
      await createReview({ ...testReviewInput, user_id: userId, product_id: productId });

      const reviews = await getProductReviews(productId, true);

      expect(reviews).toHaveLength(0);
    });

    it('should return empty array for non-existent product', async () => {
      const reviews = await getProductReviews(9999);
      expect(reviews).toHaveLength(0);
    });
  });

  describe('getPendingReviews', () => {
    it('should return unapproved reviews with user and product info', async () => {
      const { userId, productId } = await createPrerequisiteData();
      
      await createReview({ ...testReviewInput, user_id: userId, product_id: productId });

      const pendingReviews = await getPendingReviews();

      expect(pendingReviews).toHaveLength(1);
      expect(pendingReviews[0].is_approved).toEqual(false);
      expect(pendingReviews[0].user.first_name).toEqual('John');
      expect(pendingReviews[0].user.email).toEqual('test@example.com');
      expect(pendingReviews[0].product.name).toEqual('Test Product');
    });

    it('should return empty array when no pending reviews', async () => {
      const { userId, productId } = await createPrerequisiteData();
      
      // Create and approve review
      const review = await createReview({ ...testReviewInput, user_id: userId, product_id: productId });
      await approveReview(review.id);

      const pendingReviews = await getPendingReviews();

      expect(pendingReviews).toHaveLength(0);
    });
  });

  describe('approveReview', () => {
    it('should approve a review successfully', async () => {
      const { userId, productId } = await createPrerequisiteData();
      
      const review = await createReview({ ...testReviewInput, user_id: userId, product_id: productId });

      const approvedReview = await approveReview(review.id);

      expect(approvedReview.is_approved).toEqual(true);
      expect(approvedReview.id).toEqual(review.id);
    });

    it('should throw error for non-existent review', async () => {
      await expect(approveReview(9999)).rejects.toThrow(/review not found/i);
    });
  });

  describe('rejectReview', () => {
    it('should delete review successfully', async () => {
      const { userId, productId } = await createPrerequisiteData();
      
      const review = await createReview({ ...testReviewInput, user_id: userId, product_id: productId });

      const result = await rejectReview(review.id);

      expect(result.success).toEqual(true);

      // Verify review was deleted
      const reviews = await db.select()
        .from(reviewsTable)
        .where(eq(reviewsTable.id, review.id))
        .execute();

      expect(reviews).toHaveLength(0);
    });

    it('should throw error for non-existent review', async () => {
      await expect(rejectReview(9999)).rejects.toThrow(/review not found/i);
    });
  });

  describe('getUserReviews', () => {
    it('should return reviews for specific user with product info', async () => {
      const { userId, productId } = await createPrerequisiteData();
      
      await createReview({ ...testReviewInput, user_id: userId, product_id: productId });

      const userReviews = await getUserReviews(userId);

      expect(userReviews).toHaveLength(1);
      expect(userReviews[0].user_id).toEqual(userId);
      expect(userReviews[0].product.name).toEqual('Test Product');
      expect(userReviews[0].product.image_url).toEqual('http://example.com/image.jpg');
    });

    it('should return empty array for user with no reviews', async () => {
      const { userId } = await createPrerequisiteData();

      const userReviews = await getUserReviews(userId);

      expect(userReviews).toHaveLength(0);
    });

    it('should return empty array for non-existent user', async () => {
      const userReviews = await getUserReviews(9999);
      expect(userReviews).toHaveLength(0);
    });
  });

  describe('getProductRatingSummary', () => {
    it('should calculate rating summary correctly', async () => {
      const { userId, productId } = await createPrerequisiteData();
      
      // Create multiple users and reviews
      const user2Result = await db.insert(usersTable)
        .values({
          email: 'user2@example.com',
          password_hash: 'hashed',
          first_name: 'Jane',
          last_name: 'Smith',
          role: 'customer'
        })
        .returning()
        .execute();
      const user2Id = user2Result[0].id;

      // Create order for user2
      const order2Result = await db.insert(ordersTable)
        .values({
          user_id: user2Id,
          total_amount: '29.99',
          discount_amount: '0',
          final_amount: '29.99',
          status: 'completed'
        })
        .returning()
        .execute();

      await db.insert(orderItemsTable)
        .values({
          order_id: order2Result[0].id,
          product_id: productId,
          quantity: 1,
          unit_price: '29.99',
          total_price: '29.99'
        })
        .execute();

      // Create and approve multiple reviews
      const review1 = await createReview({ user_id: userId, product_id: productId, rating: 5, comment: 'Great!' });
      const review2 = await createReview({ user_id: user2Id, product_id: productId, rating: 4, comment: 'Good!' });
      
      await approveReview(review1.id);
      await approveReview(review2.id);

      const summary = await getProductRatingSummary(productId);

      expect(summary.totalReviews).toEqual(2);
      expect(summary.averageRating).toEqual(4.5);
      expect(summary.ratingDistribution[4]).toEqual(1);
      expect(summary.ratingDistribution[5]).toEqual(1);
      expect(summary.ratingDistribution[1]).toEqual(0);
    });

    it('should return zeros for product with no approved reviews', async () => {
      const { userId, productId } = await createPrerequisiteData();
      
      // Create unapproved review
      await createReview({ ...testReviewInput, user_id: userId, product_id: productId });

      const summary = await getProductRatingSummary(productId);

      expect(summary.totalReviews).toEqual(0);
      expect(summary.averageRating).toEqual(0);
      expect(summary.ratingDistribution[1]).toEqual(0);
      expect(summary.ratingDistribution[5]).toEqual(0);
    });

    it('should return zeros for non-existent product', async () => {
      const summary = await getProductRatingSummary(9999);

      expect(summary.totalReviews).toEqual(0);
      expect(summary.averageRating).toEqual(0);
      expect(Object.values(summary.ratingDistribution).every(count => count === 0)).toBe(true);
    });

    it('should only include approved reviews in calculations', async () => {
      const { userId, productId } = await createPrerequisiteData();
      
      // Create approved and unapproved reviews
      const review1 = await createReview({ user_id: userId, product_id: productId, rating: 5, comment: 'Great!' });
      await approveReview(review1.id);

      // Create user2 with purchase history
      const user2Result = await db.insert(usersTable)
        .values({
          email: 'user2@example.com',
          password_hash: 'hashed',
          first_name: 'Jane',
          last_name: 'Smith',
          role: 'customer'
        })
        .returning()
        .execute();
      
      const order2Result = await db.insert(ordersTable)
        .values({
          user_id: user2Result[0].id,
          total_amount: '29.99',
          discount_amount: '0',
          final_amount: '29.99',
          status: 'completed'
        })
        .returning()
        .execute();

      await db.insert(orderItemsTable)
        .values({
          order_id: order2Result[0].id,
          product_id: productId,
          quantity: 1,
          unit_price: '29.99',
          total_price: '29.99'
        })
        .execute();

      // Create unapproved review (should not be counted)
      await createReview({ user_id: user2Result[0].id, product_id: productId, rating: 1, comment: 'Bad!' });

      const summary = await getProductRatingSummary(productId);

      expect(summary.totalReviews).toEqual(1);
      expect(summary.averageRating).toEqual(5);
      expect(summary.ratingDistribution[5]).toEqual(1);
      expect(summary.ratingDistribution[1]).toEqual(0);
    });
  });
});