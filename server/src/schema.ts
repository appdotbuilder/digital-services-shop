import { z } from 'zod';

// Enum schemas
export const userRoleSchema = z.enum(['admin', 'customer']);
export const orderStatusSchema = z.enum(['pending', 'processing', 'completed', 'cancelled', 'refunded']);
export const productTypeSchema = z.enum(['digital_product', 'service']);
export const couponTypeSchema = z.enum(['percentage', 'fixed_amount']);
export const paymentStatusSchema = z.enum(['pending', 'completed', 'failed', 'refunded']);

// User schemas
export const userSchema = z.object({
  id: z.number(),
  email: z.string().email(),
  password_hash: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  role: userRoleSchema,
  is_active: z.boolean(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type User = z.infer<typeof userSchema>;

export const createUserInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  role: userRoleSchema.default('customer')
});

export type CreateUserInput = z.infer<typeof createUserInputSchema>;

export const loginInputSchema = z.object({
  email: z.string().email(),
  password: z.string()
});

export type LoginInput = z.infer<typeof loginInputSchema>;

// Category schemas
export const categorySchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().nullable(),
  slug: z.string(),
  is_active: z.boolean(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type Category = z.infer<typeof categorySchema>;

export const createCategoryInputSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable(),
  slug: z.string().min(1)
});

export type CreateCategoryInput = z.infer<typeof createCategoryInputSchema>;

export const updateCategoryInputSchema = z.object({
  id: z.number(),
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  slug: z.string().min(1).optional(),
  is_active: z.boolean().optional()
});

export type UpdateCategoryInput = z.infer<typeof updateCategoryInputSchema>;

// Product schemas
export const productSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().nullable(),
  price: z.number(),
  type: productTypeSchema,
  category_id: z.number(),
  image_url: z.string().nullable(),
  download_url: z.string().nullable(),
  is_active: z.boolean(),
  stock_quantity: z.number().int().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type Product = z.infer<typeof productSchema>;

export const createProductInputSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable(),
  price: z.number().positive(),
  type: productTypeSchema,
  category_id: z.number(),
  image_url: z.string().nullable(),
  download_url: z.string().nullable(),
  stock_quantity: z.number().int().nonnegative().nullable()
});

export type CreateProductInput = z.infer<typeof createProductInputSchema>;

export const updateProductInputSchema = z.object({
  id: z.number(),
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  price: z.number().positive().optional(),
  type: productTypeSchema.optional(),
  category_id: z.number().optional(),
  image_url: z.string().nullable().optional(),
  download_url: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
  stock_quantity: z.number().int().nonnegative().nullable().optional()
});

export type UpdateProductInput = z.infer<typeof updateProductInputSchema>;

// Coupon schemas
export const couponSchema = z.object({
  id: z.number(),
  code: z.string(),
  type: couponTypeSchema,
  value: z.number(),
  minimum_order_amount: z.number().nullable(),
  usage_limit: z.number().int().nullable(),
  used_count: z.number().int(),
  is_active: z.boolean(),
  expires_at: z.coerce.date().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type Coupon = z.infer<typeof couponSchema>;

export const createCouponInputSchema = z.object({
  code: z.string().min(1),
  type: couponTypeSchema,
  value: z.number().positive(),
  minimum_order_amount: z.number().positive().nullable(),
  usage_limit: z.number().int().positive().nullable(),
  expires_at: z.coerce.date().nullable()
});

export type CreateCouponInput = z.infer<typeof createCouponInputSchema>;

// Order schemas
export const orderSchema = z.object({
  id: z.number(),
  user_id: z.number(),
  total_amount: z.number(),
  discount_amount: z.number(),
  final_amount: z.number(),
  coupon_id: z.number().nullable(),
  status: orderStatusSchema,
  payment_status: paymentStatusSchema,
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type Order = z.infer<typeof orderSchema>;

export const createOrderInputSchema = z.object({
  user_id: z.number(),
  items: z.array(z.object({
    product_id: z.number(),
    quantity: z.number().int().positive(),
    price: z.number().positive()
  })),
  coupon_code: z.string().optional()
});

export type CreateOrderInput = z.infer<typeof createOrderInputSchema>;

// Order Item schemas
export const orderItemSchema = z.object({
  id: z.number(),
  order_id: z.number(),
  product_id: z.number(),
  quantity: z.number().int(),
  unit_price: z.number(),
  total_price: z.number(),
  created_at: z.coerce.date()
});

export type OrderItem = z.infer<typeof orderItemSchema>;

// Cart schemas
export const cartItemSchema = z.object({
  id: z.number(),
  user_id: z.number(),
  product_id: z.number(),
  quantity: z.number().int(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type CartItem = z.infer<typeof cartItemSchema>;

export const addToCartInputSchema = z.object({
  user_id: z.number(),
  product_id: z.number(),
  quantity: z.number().int().positive()
});

export type AddToCartInput = z.infer<typeof addToCartInputSchema>;

export const updateCartItemInputSchema = z.object({
  id: z.number(),
  quantity: z.number().int().positive()
});

export type UpdateCartItemInput = z.infer<typeof updateCartItemInputSchema>;

// Review schemas
export const reviewSchema = z.object({
  id: z.number(),
  user_id: z.number(),
  product_id: z.number(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().nullable(),
  is_approved: z.boolean(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type Review = z.infer<typeof reviewSchema>;

export const createReviewInputSchema = z.object({
  user_id: z.number(),
  product_id: z.number(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().nullable()
});

export type CreateReviewInput = z.infer<typeof createReviewInputSchema>;

// Blog schemas
export const blogPostSchema = z.object({
  id: z.number(),
  title: z.string(),
  content: z.string(),
  excerpt: z.string().nullable(),
  slug: z.string(),
  author_id: z.number(),
  featured_image_url: z.string().nullable(),
  is_published: z.boolean(),
  published_at: z.coerce.date().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type BlogPost = z.infer<typeof blogPostSchema>;

export const createBlogPostInputSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
  excerpt: z.string().nullable(),
  slug: z.string().min(1),
  author_id: z.number(),
  featured_image_url: z.string().nullable(),
  is_published: z.boolean().default(false)
});

export type CreateBlogPostInput = z.infer<typeof createBlogPostInputSchema>;

// Contact schemas
export const contactMessageSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string().email(),
  subject: z.string(),
  message: z.string(),
  is_read: z.boolean(),
  created_at: z.coerce.date()
});

export type ContactMessage = z.infer<typeof contactMessageSchema>;

export const createContactMessageInputSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  subject: z.string().min(1),
  message: z.string().min(1)
});

export type CreateContactMessageInput = z.infer<typeof createContactMessageInputSchema>;

// Settings schemas
export const settingSchema = z.object({
  id: z.number(),
  key: z.string(),
  value: z.string(),
  description: z.string().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type Setting = z.infer<typeof settingSchema>;

export const updateSettingInputSchema = z.object({
  key: z.string(),
  value: z.string()
});

export type UpdateSettingInput = z.infer<typeof updateSettingInputSchema>;

// Dashboard analytics schemas
export const dashboardStatsSchema = z.object({
  total_categories: z.number().int(),
  total_products: z.number().int(),
  total_customers: z.number().int(),
  total_orders: z.number().int(),
  total_revenue: z.number(),
  pending_orders: z.number().int(),
  completed_orders: z.number().int()
});

export type DashboardStats = z.infer<typeof dashboardStatsSchema>;

export const dailyVisitorSchema = z.object({
  date: z.string(),
  visitors: z.number().int()
});

export type DailyVisitor = z.infer<typeof dailyVisitorSchema>;