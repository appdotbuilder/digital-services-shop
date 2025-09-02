import { db } from '../db';
import { blogPostsTable, usersTable } from '../db/schema';
import { type BlogPost, type CreateBlogPostInput } from '../schema';
import { eq, desc, and, SQL } from 'drizzle-orm';

export async function createBlogPost(input: CreateBlogPostInput): Promise<BlogPost> {
  try {
    // Check if slug already exists
    const existingPost = await db.select()
      .from(blogPostsTable)
      .where(eq(blogPostsTable.slug, input.slug))
      .execute();

    if (existingPost.length > 0) {
      throw new Error('A blog post with this slug already exists');
    }

    // Verify author exists
    const author = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, input.author_id))
      .execute();

    if (author.length === 0) {
      throw new Error('Author not found');
    }

    // Set published_at if is_published is true
    const published_at = input.is_published ? new Date() : null;

    const result = await db.insert(blogPostsTable)
      .values({
        title: input.title,
        content: input.content,
        excerpt: input.excerpt,
        slug: input.slug,
        author_id: input.author_id,
        featured_image_url: input.featured_image_url,
        is_published: input.is_published,
        published_at: published_at
      })
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('Blog post creation failed:', error);
    throw error;
  }
}

export async function getBlogPosts(filters?: {
  is_published?: boolean;
  author_id?: number;
  limit?: number;
  offset?: number;
}): Promise<Array<BlogPost & {
  author: { first_name: string; last_name: string };
}>> {
  try {
    // Build conditions array
    const conditions: SQL<unknown>[] = [];

    if (filters?.is_published !== undefined) {
      conditions.push(eq(blogPostsTable.is_published, filters.is_published));
    }

    if (filters?.author_id) {
      conditions.push(eq(blogPostsTable.author_id, filters.author_id));
    }

    // Build the query step by step
    const baseSelect = db.select({
      id: blogPostsTable.id,
      title: blogPostsTable.title,
      content: blogPostsTable.content,
      excerpt: blogPostsTable.excerpt,
      slug: blogPostsTable.slug,
      author_id: blogPostsTable.author_id,
      featured_image_url: blogPostsTable.featured_image_url,
      is_published: blogPostsTable.is_published,
      published_at: blogPostsTable.published_at,
      created_at: blogPostsTable.created_at,
      updated_at: blogPostsTable.updated_at,
      author: {
        first_name: usersTable.first_name,
        last_name: usersTable.last_name
      }
    })
    .from(blogPostsTable)
    .innerJoin(usersTable, eq(blogPostsTable.author_id, usersTable.id));

    // Create final query with conditional where clause
    const query = conditions.length > 0
      ? baseSelect.where(conditions.length === 1 ? conditions[0] : and(...conditions))
      : baseSelect;

    // Apply ordering and pagination
    const limit = filters?.limit || 10;
    const offset = filters?.offset || 0;

    const results = await query
      .orderBy(desc(blogPostsTable.created_at))
      .limit(limit)
      .offset(offset)
      .execute();

    return results.map(result => ({
      id: result.id,
      title: result.title,
      content: result.content,
      excerpt: result.excerpt,
      slug: result.slug,
      author_id: result.author_id,
      featured_image_url: result.featured_image_url,
      is_published: result.is_published,
      published_at: result.published_at,
      created_at: result.created_at,
      updated_at: result.updated_at,
      author: result.author
    }));
  } catch (error) {
    console.error('Failed to fetch blog posts:', error);
    throw error;
  }
}

export async function getBlogPostBySlug(slug: string): Promise<BlogPost & {
  author: { first_name: string; last_name: string };
} | null> {
  try {
    const results = await db.select({
      id: blogPostsTable.id,
      title: blogPostsTable.title,
      content: blogPostsTable.content,
      excerpt: blogPostsTable.excerpt,
      slug: blogPostsTable.slug,
      author_id: blogPostsTable.author_id,
      featured_image_url: blogPostsTable.featured_image_url,
      is_published: blogPostsTable.is_published,
      published_at: blogPostsTable.published_at,
      created_at: blogPostsTable.created_at,
      updated_at: blogPostsTable.updated_at,
      author: {
        first_name: usersTable.first_name,
        last_name: usersTable.last_name
      }
    })
    .from(blogPostsTable)
    .innerJoin(usersTable, eq(blogPostsTable.author_id, usersTable.id))
    .where(and(
      eq(blogPostsTable.slug, slug),
      eq(blogPostsTable.is_published, true)
    ))
    .execute();

    if (results.length === 0) {
      return null;
    }

    const result = results[0];
    return {
      id: result.id,
      title: result.title,
      content: result.content,
      excerpt: result.excerpt,
      slug: result.slug,
      author_id: result.author_id,
      featured_image_url: result.featured_image_url,
      is_published: result.is_published,
      published_at: result.published_at,
      created_at: result.created_at,
      updated_at: result.updated_at,
      author: result.author
    };
  } catch (error) {
    console.error('Failed to fetch blog post by slug:', error);
    throw error;
  }
}

export async function getBlogPostById(id: number): Promise<BlogPost | null> {
  try {
    const results = await db.select()
      .from(blogPostsTable)
      .where(eq(blogPostsTable.id, id))
      .execute();

    return results.length > 0 ? results[0] : null;
  } catch (error) {
    console.error('Failed to fetch blog post by ID:', error);
    throw error;
  }
}

export async function updateBlogPost(
  id: number,
  updates: Partial<{
    title: string;
    content: string;
    excerpt: string | null;
    slug: string;
    featured_image_url: string | null;
    is_published: boolean;
  }>
): Promise<BlogPost> {
  try {
    // Verify blog post exists
    const existingPost = await db.select()
      .from(blogPostsTable)
      .where(eq(blogPostsTable.id, id))
      .execute();

    if (existingPost.length === 0) {
      throw new Error('Blog post not found');
    }

    // Check slug uniqueness if slug is being updated
    if (updates.slug && updates.slug !== existingPost[0].slug) {
      const slugConflict = await db.select()
        .from(blogPostsTable)
        .where(eq(blogPostsTable.slug, updates.slug))
        .execute();

      if (slugConflict.length > 0) {
        throw new Error('A blog post with this slug already exists');
      }
    }

    // Handle published_at logic
    const updateData: any = { ...updates };

    // If changing is_published to true and it wasn't published before, set published_at
    if (updates.is_published === true && !existingPost[0].is_published) {
      updateData.published_at = new Date();
    }
    // If changing is_published to false, clear published_at
    else if (updates.is_published === false) {
      updateData.published_at = null;
    }

    const result = await db.update(blogPostsTable)
      .set(updateData)
      .where(eq(blogPostsTable.id, id))
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('Blog post update failed:', error);
    throw error;
  }
}

export async function deleteBlogPost(id: number): Promise<{ success: boolean }> {
  try {
    const result = await db.delete(blogPostsTable)
      .where(eq(blogPostsTable.id, id))
      .returning()
      .execute();

    return { success: result.length > 0 };
  } catch (error) {
    console.error('Blog post deletion failed:', error);
    throw error;
  }
}

export async function publishBlogPost(id: number): Promise<BlogPost> {
  try {
    const result = await db.update(blogPostsTable)
      .set({
        is_published: true,
        published_at: new Date()
      })
      .where(eq(blogPostsTable.id, id))
      .returning()
      .execute();

    if (result.length === 0) {
      throw new Error('Blog post not found');
    }

    return result[0];
  } catch (error) {
    console.error('Blog post publishing failed:', error);
    throw error;
  }
}

export async function unpublishBlogPost(id: number): Promise<BlogPost> {
  try {
    const result = await db.update(blogPostsTable)
      .set({
        is_published: false,
        published_at: null
      })
      .where(eq(blogPostsTable.id, id))
      .returning()
      .execute();

    if (result.length === 0) {
      throw new Error('Blog post not found');
    }

    return result[0];
  } catch (error) {
    console.error('Blog post unpublishing failed:', error);
    throw error;
  }
}