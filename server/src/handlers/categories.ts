import { db } from '../db';
import { categoriesTable, productsTable } from '../db/schema';
import { type Category, type CreateCategoryInput, type UpdateCategoryInput } from '../schema';
import { eq, sql } from 'drizzle-orm';

export async function createCategory(input: CreateCategoryInput): Promise<Category> {
  try {
    // Insert category record
    const result = await db.insert(categoriesTable)
      .values({
        name: input.name,
        description: input.description,
        slug: input.slug
      })
      .returning()
      .execute();

    const category = result[0];
    return category;
  } catch (error) {
    console.error('Category creation failed:', error);
    throw error;
  }
}

export async function getCategories(): Promise<Category[]> {
  try {
    const categories = await db.select()
      .from(categoriesTable)
      .execute();

    return categories;
  } catch (error) {
    console.error('Failed to fetch categories:', error);
    throw error;
  }
}

export async function getCategoryById(id: number): Promise<Category | null> {
  try {
    const categories = await db.select()
      .from(categoriesTable)
      .where(eq(categoriesTable.id, id))
      .execute();

    return categories.length > 0 ? categories[0] : null;
  } catch (error) {
    console.error('Failed to fetch category by id:', error);
    throw error;
  }
}

export async function updateCategory(input: UpdateCategoryInput): Promise<Category> {
  try {
    // Build update object with only provided fields
    const updateData: any = {
      updated_at: sql`now()`
    };

    if (input.name !== undefined) {
      updateData.name = input.name;
    }

    if (input.description !== undefined) {
      updateData.description = input.description;
    }

    if (input.slug !== undefined) {
      updateData.slug = input.slug;
    }

    if (input.is_active !== undefined) {
      updateData.is_active = input.is_active;
    }

    const result = await db.update(categoriesTable)
      .set(updateData)
      .where(eq(categoriesTable.id, input.id))
      .returning()
      .execute();

    if (result.length === 0) {
      throw new Error('Category not found');
    }

    return result[0];
  } catch (error) {
    console.error('Category update failed:', error);
    throw error;
  }
}

export async function deleteCategory(id: number): Promise<{ success: boolean }> {
  try {
    // Check if category has products
    const productsCount = await db.select({
      count: sql<number>`count(*)`
    })
    .from(productsTable)
    .where(eq(productsTable.category_id, id))
    .execute();

    if (productsCount[0].count > 0) {
      throw new Error('Cannot delete category that has products');
    }

    // Soft delete by setting is_active to false
    const result = await db.update(categoriesTable)
      .set({ 
        is_active: false,
        updated_at: sql`now()`
      })
      .where(eq(categoriesTable.id, id))
      .returning()
      .execute();

    if (result.length === 0) {
      throw new Error('Category not found');
    }

    return { success: true };
  } catch (error) {
    console.error('Category deletion failed:', error);
    throw error;
  }
}