import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { categoriesTable, productsTable } from '../db/schema';
import { type CreateCategoryInput, type UpdateCategoryInput } from '../schema';
import { 
  createCategory, 
  getCategories, 
  getCategoryById, 
  updateCategory, 
  deleteCategory 
} from '../handlers/categories';
import { eq } from 'drizzle-orm';

const testCategoryInput: CreateCategoryInput = {
  name: 'Test Category',
  description: 'A category for testing',
  slug: 'test-category'
};

const testCategoryInput2: CreateCategoryInput = {
  name: 'Electronics',
  description: 'Electronic products and gadgets',
  slug: 'electronics'
};

describe('createCategory', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should create a category', async () => {
    const result = await createCategory(testCategoryInput);

    expect(result.name).toEqual('Test Category');
    expect(result.description).toEqual('A category for testing');
    expect(result.slug).toEqual('test-category');
    expect(result.is_active).toBe(true);
    expect(result.id).toBeDefined();
    expect(result.created_at).toBeInstanceOf(Date);
    expect(result.updated_at).toBeInstanceOf(Date);
  });

  it('should save category to database', async () => {
    const result = await createCategory(testCategoryInput);

    const categories = await db.select()
      .from(categoriesTable)
      .where(eq(categoriesTable.id, result.id))
      .execute();

    expect(categories).toHaveLength(1);
    expect(categories[0].name).toEqual('Test Category');
    expect(categories[0].description).toEqual('A category for testing');
    expect(categories[0].slug).toEqual('test-category');
    expect(categories[0].is_active).toBe(true);
    expect(categories[0].created_at).toBeInstanceOf(Date);
    expect(categories[0].updated_at).toBeInstanceOf(Date);
  });

  it('should create category with null description', async () => {
    const input: CreateCategoryInput = {
      name: 'No Description Category',
      description: null,
      slug: 'no-desc'
    };

    const result = await createCategory(input);

    expect(result.name).toEqual('No Description Category');
    expect(result.description).toBeNull();
    expect(result.slug).toEqual('no-desc');
    expect(result.is_active).toBe(true);
  });

  it('should fail with duplicate slug', async () => {
    await createCategory(testCategoryInput);

    await expect(createCategory(testCategoryInput))
      .rejects.toThrow(/unique/i);
  });
});

describe('getCategories', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should return empty array when no categories exist', async () => {
    const result = await getCategories();
    expect(result).toEqual([]);
  });

  it('should return all categories', async () => {
    await createCategory(testCategoryInput);
    await createCategory(testCategoryInput2);

    const result = await getCategories();

    expect(result).toHaveLength(2);
    expect(result[0].name).toEqual('Test Category');
    expect(result[1].name).toEqual('Electronics');
  });

  it('should return categories in database order', async () => {
    const category1 = await createCategory(testCategoryInput);
    const category2 = await createCategory(testCategoryInput2);

    const result = await getCategories();

    expect(result).toHaveLength(2);
    expect(result[0].id).toEqual(category1.id);
    expect(result[1].id).toEqual(category2.id);
  });
});

describe('getCategoryById', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should return null for non-existent category', async () => {
    const result = await getCategoryById(999);
    expect(result).toBeNull();
  });

  it('should return category by id', async () => {
    const created = await createCategory(testCategoryInput);
    const result = await getCategoryById(created.id);

    expect(result).not.toBeNull();
    expect(result!.id).toEqual(created.id);
    expect(result!.name).toEqual('Test Category');
    expect(result!.description).toEqual('A category for testing');
    expect(result!.slug).toEqual('test-category');
    expect(result!.is_active).toBe(true);
  });

  it('should return inactive categories', async () => {
    const created = await createCategory(testCategoryInput);
    
    // Manually set category to inactive
    await db.update(categoriesTable)
      .set({ is_active: false })
      .where(eq(categoriesTable.id, created.id))
      .execute();

    const result = await getCategoryById(created.id);

    expect(result).not.toBeNull();
    expect(result!.is_active).toBe(false);
  });
});

describe('updateCategory', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should update category name', async () => {
    const created = await createCategory(testCategoryInput);

    const updateInput: UpdateCategoryInput = {
      id: created.id,
      name: 'Updated Category Name'
    };

    const result = await updateCategory(updateInput);

    expect(result.id).toEqual(created.id);
    expect(result.name).toEqual('Updated Category Name');
    expect(result.description).toEqual('A category for testing');
    expect(result.slug).toEqual('test-category');
    expect(result.updated_at > created.updated_at).toBe(true);
  });

  it('should update category description', async () => {
    const created = await createCategory(testCategoryInput);

    const updateInput: UpdateCategoryInput = {
      id: created.id,
      description: 'Updated description'
    };

    const result = await updateCategory(updateInput);

    expect(result.id).toEqual(created.id);
    expect(result.name).toEqual('Test Category');
    expect(result.description).toEqual('Updated description');
    expect(result.slug).toEqual('test-category');
  });

  it('should update category slug', async () => {
    const created = await createCategory(testCategoryInput);

    const updateInput: UpdateCategoryInput = {
      id: created.id,
      slug: 'updated-slug'
    };

    const result = await updateCategory(updateInput);

    expect(result.id).toEqual(created.id);
    expect(result.slug).toEqual('updated-slug');
  });

  it('should update is_active status', async () => {
    const created = await createCategory(testCategoryInput);

    const updateInput: UpdateCategoryInput = {
      id: created.id,
      is_active: false
    };

    const result = await updateCategory(updateInput);

    expect(result.id).toEqual(created.id);
    expect(result.is_active).toBe(false);
  });

  it('should update multiple fields at once', async () => {
    const created = await createCategory(testCategoryInput);

    const updateInput: UpdateCategoryInput = {
      id: created.id,
      name: 'New Name',
      description: 'New description',
      slug: 'new-slug',
      is_active: false
    };

    const result = await updateCategory(updateInput);

    expect(result.id).toEqual(created.id);
    expect(result.name).toEqual('New Name');
    expect(result.description).toEqual('New description');
    expect(result.slug).toEqual('new-slug');
    expect(result.is_active).toBe(false);
    expect(result.updated_at > created.updated_at).toBe(true);
  });

  it('should set description to null', async () => {
    const created = await createCategory(testCategoryInput);

    const updateInput: UpdateCategoryInput = {
      id: created.id,
      description: null
    };

    const result = await updateCategory(updateInput);

    expect(result.description).toBeNull();
  });

  it('should fail for non-existent category', async () => {
    const updateInput: UpdateCategoryInput = {
      id: 999,
      name: 'Non-existent'
    };

    await expect(updateCategory(updateInput))
      .rejects.toThrow(/category not found/i);
  });

  it('should fail with duplicate slug', async () => {
    const category1 = await createCategory(testCategoryInput);
    await createCategory(testCategoryInput2);

    const updateInput: UpdateCategoryInput = {
      id: category1.id,
      slug: 'electronics' // Already used by category2
    };

    await expect(updateCategory(updateInput))
      .rejects.toThrow(/unique/i);
  });
});

describe('deleteCategory', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should soft delete category without products', async () => {
    const created = await createCategory(testCategoryInput);

    const result = await deleteCategory(created.id);

    expect(result.success).toBe(true);

    // Verify category is marked as inactive
    const category = await getCategoryById(created.id);
    expect(category).not.toBeNull();
    expect(category!.is_active).toBe(false);
  });

  it('should fail to delete category with products', async () => {
    const category = await createCategory(testCategoryInput);

    // Create a product in this category
    await db.insert(productsTable)
      .values({
        name: 'Test Product',
        description: 'A test product',
        price: '19.99',
        type: 'digital_product',
        category_id: category.id,
        image_url: null,
        download_url: null,
        stock_quantity: null
      })
      .execute();

    await expect(deleteCategory(category.id))
      .rejects.toThrow(/cannot delete category that has products/i);
  });

  it('should fail for non-existent category', async () => {
    await expect(deleteCategory(999))
      .rejects.toThrow(/category not found/i);
  });

  it('should allow deleting category after products are removed', async () => {
    const category = await createCategory(testCategoryInput);

    // Create a product in this category
    const product = await db.insert(productsTable)
      .values({
        name: 'Test Product',
        description: 'A test product',
        price: '19.99',
        type: 'digital_product',
        category_id: category.id,
        image_url: null,
        download_url: null,
        stock_quantity: null
      })
      .returning()
      .execute();

    // First attempt should fail
    await expect(deleteCategory(category.id))
      .rejects.toThrow(/cannot delete category that has products/i);

    // Remove the product by changing its category
    const newCategory = await createCategory(testCategoryInput2);
    await db.update(productsTable)
      .set({ category_id: newCategory.id })
      .where(eq(productsTable.id, product[0].id))
      .execute();

    // Now deletion should succeed
    const result = await deleteCategory(category.id);
    expect(result.success).toBe(true);

    // Verify category is marked as inactive
    const deletedCategory = await getCategoryById(category.id);
    expect(deletedCategory!.is_active).toBe(false);
  });
});