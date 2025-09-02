import { initTRPC } from '@trpc/server';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import 'dotenv/config';
import cors from 'cors';
import superjson from 'superjson';
import { z } from 'zod';

// Import all schemas
import {
  createUserInputSchema,
  loginInputSchema,
  createCategoryInputSchema,
  updateCategoryInputSchema,
  createProductInputSchema,
  updateProductInputSchema,
  createCouponInputSchema,
  addToCartInputSchema,
  updateCartItemInputSchema,
  createOrderInputSchema,
  createReviewInputSchema,
  createBlogPostInputSchema,
  createContactMessageInputSchema,
  updateSettingInputSchema
} from './schema';

// Import all handlers
import { registerUser, loginUser, getCurrentUser } from './handlers/auth';
import { 
  createCategory, 
  getCategories, 
  getCategoryById, 
  updateCategory, 
  deleteCategory 
} from './handlers/categories';
import {
  createProduct,
  getProducts,
  getProductById,
  getProductByIdWithDetails,
  updateProduct,
  deleteProduct,
  searchProducts
} from './handlers/products';
import {
  createCoupon,
  getCoupons,
  getCouponByCode,
  validateCoupon,
  updateCoupon,
  deleteCoupon
} from './handlers/coupons';
import {
  addToCart,
  getCartItems,
  updateCartItem,
  removeFromCart,
  clearCart,
  getCartSummary
} from './handlers/cart';
import {
  createOrder,
  getOrders,
  getUserOrders,
  getOrderById,
  updateOrderStatus,
  updatePaymentStatus,
  cancelOrder
} from './handlers/orders';
import {
  createReview,
  getProductReviews,
  getPendingReviews,
  approveReview,
  rejectReview,
  getUserReviews,
  getProductRatingSummary
} from './handlers/reviews';
import {
  createBlogPost,
  getBlogPosts,
  getBlogPostBySlug,
  getBlogPostById,
  updateBlogPost,
  deleteBlogPost,
  publishBlogPost,
  unpublishBlogPost
} from './handlers/blog';
import {
  createContactMessage,
  getContactMessages,
  getContactMessageById,
  markMessageAsRead,
  markMessageAsUnread,
  deleteContactMessage,
  getUnreadMessageCount
} from './handlers/contact';
import {
  getSettings,
  getSettingByKey,
  updateSetting,
  getPublicSettings,
  initializeDefaultSettings,
  deleteSetting
} from './handlers/settings';
import {
  getDashboardStats,
  getDailyVisitors,
  getRevenueByMonth,
  getTopProducts,
  getRecentOrders,
  getCustomerStats,
  getProductStats
} from './handlers/dashboard';
import {
  generateSalesReport,
  generateProductReport,
  generateCustomerReport,
  generateInventoryReport,
  generateRevenueReport,
  generateCouponReport
} from './handlers/reports';

const t = initTRPC.create({
  transformer: superjson,
});

const publicProcedure = t.procedure;
const router = t.router;

const appRouter = router({
  // Health check
  healthcheck: publicProcedure.query(() => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }),

  // Authentication routes
  auth: router({
    register: publicProcedure
      .input(createUserInputSchema)
      .mutation(({ input }) => registerUser(input)),
    login: publicProcedure
      .input(loginInputSchema)
      .mutation(({ input }) => loginUser(input)),
    getCurrentUser: publicProcedure
      .input(z.object({ userId: z.number() }))
      .query(({ input }) => getCurrentUser(input.userId)),
  }),

  // Category routes
  categories: router({
    create: publicProcedure
      .input(createCategoryInputSchema)
      .mutation(({ input }) => createCategory(input)),
    list: publicProcedure
      .query(() => getCategories()),
    getById: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => getCategoryById(input.id)),
    update: publicProcedure
      .input(updateCategoryInputSchema)
      .mutation(({ input }) => updateCategory(input)),
    delete: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deleteCategory(input.id)),
  }),

  // Product routes
  products: router({
    create: publicProcedure
      .input(createProductInputSchema)
      .mutation(({ input }) => createProduct(input)),
    list: publicProcedure
      .input(z.object({ 
        category_id: z.number().optional(), 
        type: z.enum(['digital_product', 'service']).optional(), 
        is_active: z.boolean().optional(),
        limit: z.number().optional(),
        offset: z.number().optional(),
      }).optional())
      .query(({ input }) => getProducts(input)),
    getById: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => getProductById(input.id)),
    getByIdWithDetails: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => getProductByIdWithDetails(input.id)),
    update: publicProcedure
      .input(updateProductInputSchema)
      .mutation(({ input }) => updateProduct(input)),
    delete: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deleteProduct(input.id)),
    search: publicProcedure
      .input(z.object({ query: z.string(), limit: z.number().optional() }))
      .query(({ input }) => searchProducts(input.query, input.limit)),
  }),

  // Coupon routes
  coupons: router({
    create: publicProcedure
      .input(createCouponInputSchema)
      .mutation(({ input }) => createCoupon(input)),
    list: publicProcedure
      .query(() => getCoupons()),
    getByCode: publicProcedure
      .input(z.object({ code: z.string() }))
      .query(({ input }) => getCouponByCode(input.code)),
    validate: publicProcedure
      .input(z.object({ code: z.string(), orderAmount: z.number() }))
      .query(({ input }) => validateCoupon(input.code, input.orderAmount)),
    update: publicProcedure
      .input(z.object({ 
        id: z.number(), 
        updates: z.object({ 
          is_active: z.boolean().optional(), 
          usage_limit: z.number().nullable().optional(), 
          expires_at: z.date().nullable().optional() 
        }) 
      }))
      .mutation(({ input }) => updateCoupon(input.id, input.updates)),
    delete: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deleteCoupon(input.id)),
  }),

  // Cart routes
  cart: router({
    add: publicProcedure
      .input(addToCartInputSchema)
      .mutation(({ input }) => addToCart(input)),
    list: publicProcedure
      .input(z.object({ userId: z.number() }))
      .query(({ input }) => getCartItems(input.userId)),
    update: publicProcedure
      .input(updateCartItemInputSchema)
      .mutation(({ input }) => updateCartItem(input)),
    remove: publicProcedure
      .input(z.object({ itemId: z.number(), userId: z.number() }))
      .mutation(({ input }) => removeFromCart(input.itemId, input.userId)),
    clear: publicProcedure
      .input(z.object({ userId: z.number() }))
      .mutation(({ input }) => clearCart(input.userId)),
    summary: publicProcedure
      .input(z.object({ userId: z.number() }))
      .query(({ input }) => getCartSummary(input.userId)),
  }),

  // Order routes
  orders: router({
    create: publicProcedure
      .input(createOrderInputSchema)
      .mutation(({ input }) => createOrder(input)),
    list: publicProcedure
      .input(z.object({
        user_id: z.number().optional(),
        status: z.enum(['pending', 'processing', 'completed', 'cancelled', 'refunded']).optional(),
        payment_status: z.enum(['pending', 'completed', 'failed', 'refunded']).optional(),
        limit: z.number().optional(),
        offset: z.number().optional(),
      }).optional())
      .query(({ input }) => getOrders(input)),
    getUserOrders: publicProcedure
      .input(z.object({ userId: z.number() }))
      .query(({ input }) => getUserOrders(input.userId)),
    getById: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => getOrderById(input.id)),
    updateStatus: publicProcedure
      .input(z.object({ 
        id: z.number(), 
        status: z.enum(['pending', 'processing', 'completed', 'cancelled', 'refunded']) 
      }))
      .mutation(({ input }) => updateOrderStatus(input.id, input.status)),
    updatePaymentStatus: publicProcedure
      .input(z.object({ 
        id: z.number(), 
        payment_status: z.enum(['pending', 'completed', 'failed', 'refunded']) 
      }))
      .mutation(({ input }) => updatePaymentStatus(input.id, input.payment_status)),
    cancel: publicProcedure
      .input(z.object({ id: z.number(), userId: z.number().optional() }))
      .mutation(({ input }) => cancelOrder(input.id, input.userId)),
  }),

  // Review routes
  reviews: router({
    create: publicProcedure
      .input(createReviewInputSchema)
      .mutation(({ input }) => createReview(input)),
    getProductReviews: publicProcedure
      .input(z.object({ productId: z.number(), approved: z.boolean().optional() }))
      .query(({ input }) => getProductReviews(input.productId, input.approved)),
    getPending: publicProcedure
      .query(() => getPendingReviews()),
    approve: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => approveReview(input.id)),
    reject: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => rejectReview(input.id)),
    getUserReviews: publicProcedure
      .input(z.object({ userId: z.number() }))
      .query(({ input }) => getUserReviews(input.userId)),
    getRatingSummary: publicProcedure
      .input(z.object({ productId: z.number() }))
      .query(({ input }) => getProductRatingSummary(input.productId)),
  }),

  // Blog routes
  blog: router({
    create: publicProcedure
      .input(createBlogPostInputSchema)
      .mutation(({ input }) => createBlogPost(input)),
    list: publicProcedure
      .input(z.object({
        is_published: z.boolean().optional(),
        author_id: z.number().optional(),
        limit: z.number().optional(),
        offset: z.number().optional(),
      }).optional())
      .query(({ input }) => getBlogPosts(input)),
    getBySlug: publicProcedure
      .input(z.object({ slug: z.string() }))
      .query(({ input }) => getBlogPostBySlug(input.slug)),
    getById: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => getBlogPostById(input.id)),
    update: publicProcedure
      .input(z.object({ 
        id: z.number(), 
        updates: z.object({
          title: z.string().optional(),
          content: z.string().optional(),
          excerpt: z.string().nullable().optional(),
          slug: z.string().optional(),
          featured_image_url: z.string().nullable().optional(),
          is_published: z.boolean().optional(),
        })
      }))
      .mutation(({ input }) => updateBlogPost(input.id, input.updates)),
    delete: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deleteBlogPost(input.id)),
    publish: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => publishBlogPost(input.id)),
    unpublish: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => unpublishBlogPost(input.id)),
  }),

  // Contact routes
  contact: router({
    create: publicProcedure
      .input(createContactMessageInputSchema)
      .mutation(({ input }) => createContactMessage(input)),
    list: publicProcedure
      .input(z.object({
        is_read: z.boolean().optional(),
        limit: z.number().optional(),
        offset: z.number().optional(),
      }).optional())
      .query(({ input }) => getContactMessages(input)),
    getById: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => getContactMessageById(input.id)),
    markRead: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => markMessageAsRead(input.id)),
    markUnread: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => markMessageAsUnread(input.id)),
    delete: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deleteContactMessage(input.id)),
    getUnreadCount: publicProcedure
      .query(() => getUnreadMessageCount()),
  }),

  // Settings routes
  settings: router({
    list: publicProcedure
      .query(() => getSettings()),
    getByKey: publicProcedure
      .input(z.object({ key: z.string() }))
      .query(({ input }) => getSettingByKey(input.key)),
    update: publicProcedure
      .input(updateSettingInputSchema)
      .mutation(({ input }) => updateSetting(input)),
    getPublic: publicProcedure
      .query(() => getPublicSettings()),
    initialize: publicProcedure
      .mutation(() => initializeDefaultSettings()),
    delete: publicProcedure
      .input(z.object({ key: z.string() }))
      .mutation(({ input }) => deleteSetting(input.key)),
  }),

  // Dashboard routes
  dashboard: router({
    stats: publicProcedure
      .query(() => getDashboardStats()),
    visitors: publicProcedure
      .input(z.object({ days: z.number().optional() }).optional())
      .query(({ input }) => getDailyVisitors(input?.days)),
    revenue: publicProcedure
      .input(z.object({ months: z.number().optional() }).optional())
      .query(({ input }) => getRevenueByMonth(input?.months)),
    topProducts: publicProcedure
      .input(z.object({ limit: z.number().optional() }).optional())
      .query(({ input }) => getTopProducts(input?.limit)),
    recentOrders: publicProcedure
      .input(z.object({ limit: z.number().optional() }).optional())
      .query(({ input }) => getRecentOrders(input?.limit)),
    customerStats: publicProcedure
      .query(() => getCustomerStats()),
    productStats: publicProcedure
      .query(() => getProductStats()),
  }),

  // Report routes
  reports: router({
    sales: publicProcedure
      .input(z.object({
        start_date: z.date(),
        end_date: z.date(),
        format: z.enum(['json', 'csv']).optional(),
      }))
      .query(({ input }) => generateSalesReport(input)),
    products: publicProcedure
      .input(z.object({
        category_id: z.number().optional(),
        product_type: z.enum(['digital_product', 'service']).optional(),
      }).optional())
      .query(({ input }) => generateProductReport(input)),
    customers: publicProcedure
      .input(z.object({
        start_date: z.date(),
        end_date: z.date(),
      }))
      .query(({ input }) => generateCustomerReport(input)),
    inventory: publicProcedure
      .query(() => generateInventoryReport()),
    revenue: publicProcedure
      .input(z.object({
        start_date: z.date(),
        end_date: z.date(),
        group_by: z.enum(['day', 'week', 'month']),
      }))
      .query(({ input }) => generateRevenueReport(input)),
    coupons: publicProcedure
      .query(() => generateCouponReport()),
  }),
});

export type AppRouter = typeof appRouter;

async function start() {
  const port = process.env['SERVER_PORT'] || 2022;
  const server = createHTTPServer({
    middleware: (req, res, next) => {
      cors()(req, res, next);
    },
    router: appRouter,
    createContext() {
      return {};
    },
  });
  server.listen(port);
  console.log(`TRPC server listening at port: ${port}`);
}

start();