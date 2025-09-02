import { 
  serial, 
  text, 
  pgTable, 
  timestamp, 
  numeric, 
  integer, 
  boolean, 
  pgEnum 
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Enums
export const userRoleEnum = pgEnum('user_role', ['admin', 'customer']);
export const orderStatusEnum = pgEnum('order_status', ['pending', 'processing', 'completed', 'cancelled', 'refunded']);
export const productTypeEnum = pgEnum('product_type', ['digital_product', 'service']);
export const couponTypeEnum = pgEnum('coupon_type', ['percentage', 'fixed_amount']);
export const paymentStatusEnum = pgEnum('payment_status', ['pending', 'completed', 'failed', 'refunded']);

// Users table
export const usersTable = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  password_hash: text('password_hash').notNull(),
  first_name: text('first_name').notNull(),
  last_name: text('last_name').notNull(),
  role: userRoleEnum('role').notNull().default('customer'),
  is_active: boolean('is_active').notNull().default(true),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
});

// Categories table
export const categoriesTable = pgTable('categories', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  slug: text('slug').notNull().unique(),
  is_active: boolean('is_active').notNull().default(true),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
});

// Products table
export const productsTable = pgTable('products', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  price: numeric('price', { precision: 10, scale: 2 }).notNull(),
  type: productTypeEnum('type').notNull(),
  category_id: integer('category_id').notNull().references(() => categoriesTable.id),
  image_url: text('image_url'),
  download_url: text('download_url'),
  is_active: boolean('is_active').notNull().default(true),
  stock_quantity: integer('stock_quantity'), // Nullable for services
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
});

// Coupons table
export const couponsTable = pgTable('coupons', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),
  type: couponTypeEnum('type').notNull(),
  value: numeric('value', { precision: 10, scale: 2 }).notNull(),
  minimum_order_amount: numeric('minimum_order_amount', { precision: 10, scale: 2 }),
  usage_limit: integer('usage_limit'),
  used_count: integer('used_count').notNull().default(0),
  is_active: boolean('is_active').notNull().default(true),
  expires_at: timestamp('expires_at'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
});

// Orders table
export const ordersTable = pgTable('orders', {
  id: serial('id').primaryKey(),
  user_id: integer('user_id').notNull().references(() => usersTable.id),
  total_amount: numeric('total_amount', { precision: 10, scale: 2 }).notNull(),
  discount_amount: numeric('discount_amount', { precision: 10, scale: 2 }).notNull().default('0'),
  final_amount: numeric('final_amount', { precision: 10, scale: 2 }).notNull(),
  coupon_id: integer('coupon_id').references(() => couponsTable.id),
  status: orderStatusEnum('status').notNull().default('pending'),
  payment_status: paymentStatusEnum('payment_status').notNull().default('pending'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
});

// Order Items table
export const orderItemsTable = pgTable('order_items', {
  id: serial('id').primaryKey(),
  order_id: integer('order_id').notNull().references(() => ordersTable.id),
  product_id: integer('product_id').notNull().references(() => productsTable.id),
  quantity: integer('quantity').notNull(),
  unit_price: numeric('unit_price', { precision: 10, scale: 2 }).notNull(),
  total_price: numeric('total_price', { precision: 10, scale: 2 }).notNull(),
  created_at: timestamp('created_at').defaultNow().notNull()
});

// Cart Items table
export const cartItemsTable = pgTable('cart_items', {
  id: serial('id').primaryKey(),
  user_id: integer('user_id').notNull().references(() => usersTable.id),
  product_id: integer('product_id').notNull().references(() => productsTable.id),
  quantity: integer('quantity').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
});

// Reviews table
export const reviewsTable = pgTable('reviews', {
  id: serial('id').primaryKey(),
  user_id: integer('user_id').notNull().references(() => usersTable.id),
  product_id: integer('product_id').notNull().references(() => productsTable.id),
  rating: integer('rating').notNull(), // 1-5 stars
  comment: text('comment'),
  is_approved: boolean('is_approved').notNull().default(false),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
});

// Blog Posts table
export const blogPostsTable = pgTable('blog_posts', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  excerpt: text('excerpt'),
  slug: text('slug').notNull().unique(),
  author_id: integer('author_id').notNull().references(() => usersTable.id),
  featured_image_url: text('featured_image_url'),
  is_published: boolean('is_published').notNull().default(false),
  published_at: timestamp('published_at'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
});

// Contact Messages table
export const contactMessagesTable = pgTable('contact_messages', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  subject: text('subject').notNull(),
  message: text('message').notNull(),
  is_read: boolean('is_read').notNull().default(false),
  created_at: timestamp('created_at').defaultNow().notNull()
});

// Settings table
export const settingsTable = pgTable('settings', {
  id: serial('id').primaryKey(),
  key: text('key').notNull().unique(),
  value: text('value').notNull(),
  description: text('description'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
});

// Relations
export const usersRelations = relations(usersTable, ({ many }) => ({
  orders: many(ordersTable),
  cartItems: many(cartItemsTable),
  reviews: many(reviewsTable),
  blogPosts: many(blogPostsTable)
}));

export const categoriesRelations = relations(categoriesTable, ({ many }) => ({
  products: many(productsTable)
}));

export const productsRelations = relations(productsTable, ({ one, many }) => ({
  category: one(categoriesTable, {
    fields: [productsTable.category_id],
    references: [categoriesTable.id]
  }),
  orderItems: many(orderItemsTable),
  cartItems: many(cartItemsTable),
  reviews: many(reviewsTable)
}));

export const couponsRelations = relations(couponsTable, ({ many }) => ({
  orders: many(ordersTable)
}));

export const ordersRelations = relations(ordersTable, ({ one, many }) => ({
  user: one(usersTable, {
    fields: [ordersTable.user_id],
    references: [usersTable.id]
  }),
  coupon: one(couponsTable, {
    fields: [ordersTable.coupon_id],
    references: [couponsTable.id]
  }),
  orderItems: many(orderItemsTable)
}));

export const orderItemsRelations = relations(orderItemsTable, ({ one }) => ({
  order: one(ordersTable, {
    fields: [orderItemsTable.order_id],
    references: [ordersTable.id]
  }),
  product: one(productsTable, {
    fields: [orderItemsTable.product_id],
    references: [productsTable.id]
  })
}));

export const cartItemsRelations = relations(cartItemsTable, ({ one }) => ({
  user: one(usersTable, {
    fields: [cartItemsTable.user_id],
    references: [usersTable.id]
  }),
  product: one(productsTable, {
    fields: [cartItemsTable.product_id],
    references: [productsTable.id]
  })
}));

export const reviewsRelations = relations(reviewsTable, ({ one }) => ({
  user: one(usersTable, {
    fields: [reviewsTable.user_id],
    references: [usersTable.id]
  }),
  product: one(productsTable, {
    fields: [reviewsTable.product_id],
    references: [productsTable.id]
  })
}));

export const blogPostsRelations = relations(blogPostsTable, ({ one }) => ({
  author: one(usersTable, {
    fields: [blogPostsTable.author_id],
    references: [usersTable.id]
  })
}));

// Export all tables and relations for proper query building
export const tables = {
  users: usersTable,
  categories: categoriesTable,
  products: productsTable,
  coupons: couponsTable,
  orders: ordersTable,
  orderItems: orderItemsTable,
  cartItems: cartItemsTable,
  reviews: reviewsTable,
  blogPosts: blogPostsTable,
  contactMessages: contactMessagesTable,
  settings: settingsTable
};

// TypeScript types for table schemas
export type User = typeof usersTable.$inferSelect;
export type NewUser = typeof usersTable.$inferInsert;
export type Category = typeof categoriesTable.$inferSelect;
export type NewCategory = typeof categoriesTable.$inferInsert;
export type Product = typeof productsTable.$inferSelect;
export type NewProduct = typeof productsTable.$inferInsert;
export type Coupon = typeof couponsTable.$inferSelect;
export type NewCoupon = typeof couponsTable.$inferInsert;
export type Order = typeof ordersTable.$inferSelect;
export type NewOrder = typeof ordersTable.$inferInsert;
export type OrderItem = typeof orderItemsTable.$inferSelect;
export type NewOrderItem = typeof orderItemsTable.$inferInsert;
export type CartItem = typeof cartItemsTable.$inferSelect;
export type NewCartItem = typeof cartItemsTable.$inferInsert;
export type Review = typeof reviewsTable.$inferSelect;
export type NewReview = typeof reviewsTable.$inferInsert;
export type BlogPost = typeof blogPostsTable.$inferSelect;
export type NewBlogPost = typeof blogPostsTable.$inferInsert;
export type ContactMessage = typeof contactMessagesTable.$inferSelect;
export type NewContactMessage = typeof contactMessagesTable.$inferInsert;
export type Setting = typeof settingsTable.$inferSelect;
export type NewSetting = typeof settingsTable.$inferInsert;