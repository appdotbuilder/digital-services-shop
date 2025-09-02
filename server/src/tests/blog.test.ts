import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { blogPostsTable, usersTable } from '../db/schema';
import { type CreateBlogPostInput } from '../schema';
import {
  createBlogPost,
  getBlogPosts,
  getBlogPostBySlug,
  getBlogPostById,
  updateBlogPost,
  deleteBlogPost,
  publishBlogPost,
  unpublishBlogPost
} from '../handlers/blog';
import { eq } from 'drizzle-orm';

// Test user for blog posts
const testUser = {
  email: 'author@example.com',
  password_hash: 'hashed_password',
  first_name: 'John',
  last_name: 'Doe',
  role: 'admin' as const
};

// Test blog post input
const testBlogPostInput: CreateBlogPostInput = {
  title: 'Test Blog Post',
  content: 'This is test content for the blog post.',
  excerpt: 'Test excerpt',
  slug: 'test-blog-post',
  author_id: 1, // Will be set after creating user
  featured_image_url: 'https://example.com/image.jpg',
  is_published: false
};

describe('Blog Handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  describe('createBlogPost', () => {
    it('should create a blog post successfully', async () => {
      // Create test user first
      const userResult = await db.insert(usersTable)
        .values(testUser)
        .returning()
        .execute();
      
      const input = { ...testBlogPostInput, author_id: userResult[0].id };
      const result = await createBlogPost(input);

      expect(result.title).toBe('Test Blog Post');
      expect(result.content).toBe('This is test content for the blog post.');
      expect(result.excerpt).toBe('Test excerpt');
      expect(result.slug).toBe('test-blog-post');
      expect(result.author_id).toBe(userResult[0].id);
      expect(result.featured_image_url).toBe('https://example.com/image.jpg');
      expect(result.is_published).toBe(false);
      expect(result.published_at).toBeNull();
      expect(result.id).toBeDefined();
      expect(result.created_at).toBeInstanceOf(Date);
      expect(result.updated_at).toBeInstanceOf(Date);
    });

    it('should set published_at when creating published blog post', async () => {
      // Create test user first
      const userResult = await db.insert(usersTable)
        .values(testUser)
        .returning()
        .execute();
      
      const input = { 
        ...testBlogPostInput, 
        author_id: userResult[0].id,
        is_published: true
      };
      const result = await createBlogPost(input);

      expect(result.is_published).toBe(true);
      expect(result.published_at).toBeInstanceOf(Date);
    });

    it('should throw error when slug already exists', async () => {
      // Create test user first
      const userResult = await db.insert(usersTable)
        .values(testUser)
        .returning()
        .execute();
      
      const input = { ...testBlogPostInput, author_id: userResult[0].id };
      
      // Create first blog post
      await createBlogPost(input);

      // Try to create another with same slug
      await expect(createBlogPost(input)).rejects.toThrow(/slug already exists/i);
    });

    it('should throw error when author does not exist', async () => {
      const input = { ...testBlogPostInput, author_id: 999 };
      
      await expect(createBlogPost(input)).rejects.toThrow(/author not found/i);
    });

    it('should save blog post to database', async () => {
      // Create test user first
      const userResult = await db.insert(usersTable)
        .values(testUser)
        .returning()
        .execute();
      
      const input = { ...testBlogPostInput, author_id: userResult[0].id };
      const result = await createBlogPost(input);

      const dbPost = await db.select()
        .from(blogPostsTable)
        .where(eq(blogPostsTable.id, result.id))
        .execute();

      expect(dbPost).toHaveLength(1);
      expect(dbPost[0].title).toBe('Test Blog Post');
      expect(dbPost[0].slug).toBe('test-blog-post');
      expect(dbPost[0].author_id).toBe(userResult[0].id);
    });
  });

  describe('getBlogPosts', () => {
    it('should fetch all blog posts with author info', async () => {
      // Create test user
      const userResult = await db.insert(usersTable)
        .values(testUser)
        .returning()
        .execute();
      
      // Create test blog post
      const input = { ...testBlogPostInput, author_id: userResult[0].id };
      await createBlogPost(input);

      const results = await getBlogPosts();

      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Test Blog Post');
      expect(results[0].author.first_name).toBe('John');
      expect(results[0].author.last_name).toBe('Doe');
    });

    it('should filter by published status', async () => {
      // Create test user
      const userResult = await db.insert(usersTable)
        .values(testUser)
        .returning()
        .execute();
      
      // Create draft and published posts
      await createBlogPost({ 
        ...testBlogPostInput, 
        author_id: userResult[0].id,
        slug: 'draft-post',
        is_published: false
      });
      
      await createBlogPost({ 
        ...testBlogPostInput, 
        author_id: userResult[0].id,
        slug: 'published-post',
        is_published: true
      });

      const publishedPosts = await getBlogPosts({ is_published: true });
      const draftPosts = await getBlogPosts({ is_published: false });

      expect(publishedPosts).toHaveLength(1);
      expect(publishedPosts[0].slug).toBe('published-post');
      expect(draftPosts).toHaveLength(1);
      expect(draftPosts[0].slug).toBe('draft-post');
    });

    it('should filter by author', async () => {
      // Create two test users
      const user1Result = await db.insert(usersTable)
        .values(testUser)
        .returning()
        .execute();
      
      const user2Result = await db.insert(usersTable)
        .values({
          ...testUser,
          email: 'author2@example.com',
          first_name: 'Jane',
          last_name: 'Smith'
        })
        .returning()
        .execute();
      
      // Create posts for both users
      await createBlogPost({ 
        ...testBlogPostInput, 
        author_id: user1Result[0].id,
        slug: 'user1-post'
      });
      
      await createBlogPost({ 
        ...testBlogPostInput, 
        author_id: user2Result[0].id,
        slug: 'user2-post'
      });

      const user1Posts = await getBlogPosts({ author_id: user1Result[0].id });
      const user2Posts = await getBlogPosts({ author_id: user2Result[0].id });

      expect(user1Posts).toHaveLength(1);
      expect(user1Posts[0].slug).toBe('user1-post');
      expect(user2Posts).toHaveLength(1);
      expect(user2Posts[0].slug).toBe('user2-post');
    });

    it('should apply pagination correctly', async () => {
      // Create test user
      const userResult = await db.insert(usersTable)
        .values(testUser)
        .returning()
        .execute();
      
      // Create multiple blog posts
      for (let i = 1; i <= 5; i++) {
        await createBlogPost({ 
          ...testBlogPostInput, 
          author_id: userResult[0].id,
          slug: `post-${i}`,
          title: `Post ${i}`
        });
      }

      const firstPage = await getBlogPosts({ limit: 2, offset: 0 });
      const secondPage = await getBlogPosts({ limit: 2, offset: 2 });

      expect(firstPage).toHaveLength(2);
      expect(secondPage).toHaveLength(2);
      
      // Should be ordered by created_at desc, so newer posts first
      expect(firstPage[0].title).toBe('Post 5');
      expect(firstPage[1].title).toBe('Post 4');
    });
  });

  describe('getBlogPostBySlug', () => {
    it('should fetch published blog post by slug', async () => {
      // Create test user
      const userResult = await db.insert(usersTable)
        .values(testUser)
        .returning()
        .execute();
      
      // Create published blog post
      await createBlogPost({ 
        ...testBlogPostInput, 
        author_id: userResult[0].id,
        is_published: true
      });

      const result = await getBlogPostBySlug('test-blog-post');

      expect(result).not.toBeNull();
      expect(result!.title).toBe('Test Blog Post');
      expect(result!.slug).toBe('test-blog-post');
      expect(result!.author.first_name).toBe('John');
      expect(result!.author.last_name).toBe('Doe');
    });

    it('should not return unpublished blog post', async () => {
      // Create test user
      const userResult = await db.insert(usersTable)
        .values(testUser)
        .returning()
        .execute();
      
      // Create unpublished blog post
      await createBlogPost({ 
        ...testBlogPostInput, 
        author_id: userResult[0].id,
        is_published: false
      });

      const result = await getBlogPostBySlug('test-blog-post');

      expect(result).toBeNull();
    });

    it('should return null for non-existent slug', async () => {
      const result = await getBlogPostBySlug('non-existent-slug');

      expect(result).toBeNull();
    });
  });

  describe('getBlogPostById', () => {
    it('should fetch blog post by ID', async () => {
      // Create test user
      const userResult = await db.insert(usersTable)
        .values(testUser)
        .returning()
        .execute();
      
      const input = { ...testBlogPostInput, author_id: userResult[0].id };
      const created = await createBlogPost(input);

      const result = await getBlogPostById(created.id);

      expect(result).not.toBeNull();
      expect(result!.id).toBe(created.id);
      expect(result!.title).toBe('Test Blog Post');
    });

    it('should return null for non-existent ID', async () => {
      const result = await getBlogPostById(999);

      expect(result).toBeNull();
    });
  });

  describe('updateBlogPost', () => {
    it('should update blog post successfully', async () => {
      // Create test user
      const userResult = await db.insert(usersTable)
        .values(testUser)
        .returning()
        .execute();
      
      const input = { ...testBlogPostInput, author_id: userResult[0].id };
      const created = await createBlogPost(input);

      const updates = {
        title: 'Updated Title',
        content: 'Updated content'
      };

      const result = await updateBlogPost(created.id, updates);

      expect(result.title).toBe('Updated Title');
      expect(result.content).toBe('Updated content');
      expect(result.slug).toBe('test-blog-post'); // Unchanged
    });

    it('should set published_at when publishing', async () => {
      // Create test user
      const userResult = await db.insert(usersTable)
        .values(testUser)
        .returning()
        .execute();
      
      const input = { ...testBlogPostInput, author_id: userResult[0].id, is_published: false };
      const created = await createBlogPost(input);

      const result = await updateBlogPost(created.id, { is_published: true });

      expect(result.is_published).toBe(true);
      expect(result.published_at).toBeInstanceOf(Date);
    });

    it('should clear published_at when unpublishing', async () => {
      // Create test user
      const userResult = await db.insert(usersTable)
        .values(testUser)
        .returning()
        .execute();
      
      const input = { ...testBlogPostInput, author_id: userResult[0].id, is_published: true };
      const created = await createBlogPost(input);

      const result = await updateBlogPost(created.id, { is_published: false });

      expect(result.is_published).toBe(false);
      expect(result.published_at).toBeNull();
    });

    it('should validate slug uniqueness on update', async () => {
      // Create test user
      const userResult = await db.insert(usersTable)
        .values(testUser)
        .returning()
        .execute();
      
      // Create two blog posts
      const post1 = await createBlogPost({ 
        ...testBlogPostInput, 
        author_id: userResult[0].id,
        slug: 'post-1'
      });
      
      await createBlogPost({ 
        ...testBlogPostInput, 
        author_id: userResult[0].id,
        slug: 'post-2'
      });

      // Try to update post1 with post2's slug
      await expect(updateBlogPost(post1.id, { slug: 'post-2' }))
        .rejects.toThrow(/slug already exists/i);
    });

    it('should throw error for non-existent blog post', async () => {
      await expect(updateBlogPost(999, { title: 'Updated' }))
        .rejects.toThrow(/not found/i);
    });
  });

  describe('deleteBlogPost', () => {
    it('should delete blog post successfully', async () => {
      // Create test user
      const userResult = await db.insert(usersTable)
        .values(testUser)
        .returning()
        .execute();
      
      const input = { ...testBlogPostInput, author_id: userResult[0].id };
      const created = await createBlogPost(input);

      const result = await deleteBlogPost(created.id);

      expect(result.success).toBe(true);

      // Verify deletion
      const deleted = await getBlogPostById(created.id);
      expect(deleted).toBeNull();
    });

    it('should return false for non-existent blog post', async () => {
      const result = await deleteBlogPost(999);

      expect(result.success).toBe(false);
    });
  });

  describe('publishBlogPost', () => {
    it('should publish blog post successfully', async () => {
      // Create test user
      const userResult = await db.insert(usersTable)
        .values(testUser)
        .returning()
        .execute();
      
      const input = { ...testBlogPostInput, author_id: userResult[0].id, is_published: false };
      const created = await createBlogPost(input);

      const result = await publishBlogPost(created.id);

      expect(result.is_published).toBe(true);
      expect(result.published_at).toBeInstanceOf(Date);
    });

    it('should throw error for non-existent blog post', async () => {
      await expect(publishBlogPost(999))
        .rejects.toThrow(/not found/i);
    });
  });

  describe('unpublishBlogPost', () => {
    it('should unpublish blog post successfully', async () => {
      // Create test user
      const userResult = await db.insert(usersTable)
        .values(testUser)
        .returning()
        .execute();
      
      const input = { ...testBlogPostInput, author_id: userResult[0].id, is_published: true };
      const created = await createBlogPost(input);

      const result = await unpublishBlogPost(created.id);

      expect(result.is_published).toBe(false);
      expect(result.published_at).toBeNull();
    });

    it('should throw error for non-existent blog post', async () => {
      await expect(unpublishBlogPost(999))
        .rejects.toThrow(/not found/i);
    });
  });
});