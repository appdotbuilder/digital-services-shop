import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { productsTable, categoriesTable, usersTable, reviewsTable } from '../db/schema';
import { type CreateProductInput, type UpdateProductInput } from '../schema';
import { 
    createProduct, 
    getProducts, 
    getProductById, 
    getProductByIdWithDetails,
    updateProduct, 
    deleteProduct, 
    searchProducts 
} from '../handlers/products';
import { eq } from 'drizzle-orm';

describe('Products', () => {
    let testCategoryId: number;
    let testUserId: number;

    beforeEach(async () => {
        await createDB();

        // Create test category
        const categoryResult = await db.insert(categoriesTable)
            .values({
                name: 'Test Category',
                description: 'A category for testing',
                slug: 'test-category'
            })
            .returning()
            .execute();
        testCategoryId = categoryResult[0].id;

        // Create test user for reviews
        const userResult = await db.insert(usersTable)
            .values({
                email: 'test@example.com',
                password_hash: 'hashedpassword',
                first_name: 'Test',
                last_name: 'User'
            })
            .returning()
            .execute();
        testUserId = userResult[0].id;
    });

    afterEach(resetDB);

    describe('createProduct', () => {
        const testInput: CreateProductInput = {
            name: 'Test Product',
            description: 'A product for testing',
            price: 19.99,
            type: 'digital_product',
            category_id: 0, // Will be set in test
            image_url: 'https://example.com/image.jpg',
            download_url: 'https://example.com/download.zip',
            stock_quantity: 100
        };

        it('should create a digital product', async () => {
            const input = { ...testInput, category_id: testCategoryId };
            const result = await createProduct(input);

            expect(result.name).toEqual('Test Product');
            expect(result.description).toEqual(testInput.description);
            expect(result.price).toEqual(19.99);
            expect(typeof result.price).toEqual('number');
            expect(result.type).toEqual('digital_product');
            expect(result.category_id).toEqual(testCategoryId);
            expect(result.image_url).toEqual(testInput.image_url);
            expect(result.download_url).toEqual(testInput.download_url);
            expect(result.stock_quantity).toEqual(100);
            expect(result.is_active).toEqual(true);
            expect(result.id).toBeDefined();
            expect(result.created_at).toBeInstanceOf(Date);
            expect(result.updated_at).toBeInstanceOf(Date);
        });

        it('should create a service product', async () => {
            const input: CreateProductInput = {
                name: 'Consulting Service',
                description: 'Professional consulting',
                price: 150.00,
                type: 'service',
                category_id: testCategoryId,
                image_url: null,
                download_url: null,
                stock_quantity: null
            };

            const result = await createProduct(input);

            expect(result.name).toEqual('Consulting Service');
            expect(result.type).toEqual('service');
            expect(result.stock_quantity).toBeNull();
            expect(result.download_url).toBeNull();
            expect(result.price).toEqual(150.00);
        });

        it('should save product to database', async () => {
            const input = { ...testInput, category_id: testCategoryId };
            const result = await createProduct(input);

            const products = await db.select()
                .from(productsTable)
                .where(eq(productsTable.id, result.id))
                .execute();

            expect(products).toHaveLength(1);
            expect(products[0].name).toEqual('Test Product');
            expect(parseFloat(products[0].price)).toEqual(19.99);
        });

        it('should throw error for invalid category', async () => {
            const input = { ...testInput, category_id: 999 };

            expect(createProduct(input)).rejects.toThrow(/category not found/i);
        });
    });

    describe('getProducts', () => {
        let digitalProductId: number;
        let serviceProductId: number;

        beforeEach(async () => {
            // Create test products
            const digitalResult = await db.insert(productsTable)
                .values({
                    name: 'Digital Product',
                    description: 'A digital product',
                    price: '29.99',
                    type: 'digital_product',
                    category_id: testCategoryId,
                    is_active: true
                })
                .returning()
                .execute();
            digitalProductId = digitalResult[0].id;

            const serviceResult = await db.insert(productsTable)
                .values({
                    name: 'Service Product',
                    description: 'A service',
                    price: '99.99',
                    type: 'service',
                    category_id: testCategoryId,
                    is_active: false
                })
                .returning()
                .execute();
            serviceProductId = serviceResult[0].id;
        });

        it('should get all products without filters', async () => {
            const result = await getProducts();

            expect(result.length).toEqual(2);
            expect(result[0].price).toEqual(29.99);
            expect(typeof result[0].price).toEqual('number');
        });

        it('should filter by category', async () => {
            const result = await getProducts({ category_id: testCategoryId });

            expect(result.length).toEqual(2);
            expect(result.every(p => p.category_id === testCategoryId)).toBe(true);
        });

        it('should filter by product type', async () => {
            const result = await getProducts({ type: 'digital_product' });

            expect(result.length).toEqual(1);
            expect(result[0].type).toEqual('digital_product');
        });

        it('should filter by active status', async () => {
            const activeResult = await getProducts({ is_active: true });
            const inactiveResult = await getProducts({ is_active: false });

            expect(activeResult.length).toEqual(1);
            expect(inactiveResult.length).toEqual(1);
            expect(activeResult[0].is_active).toBe(true);
            expect(inactiveResult[0].is_active).toBe(false);
        });

        it('should apply pagination', async () => {
            const page1 = await getProducts({ limit: 1, offset: 0 });
            const page2 = await getProducts({ limit: 1, offset: 1 });

            expect(page1.length).toEqual(1);
            expect(page2.length).toEqual(1);
            expect(page1[0].id).not.toEqual(page2[0].id);
        });

        it('should combine multiple filters', async () => {
            const result = await getProducts({ 
                type: 'digital_product', 
                is_active: true 
            });

            expect(result.length).toEqual(1);
            expect(result[0].type).toEqual('digital_product');
            expect(result[0].is_active).toBe(true);
        });
    });

    describe('getProductById', () => {
        let productId: number;

        beforeEach(async () => {
            const result = await db.insert(productsTable)
                .values({
                    name: 'Test Product',
                    description: 'Test description',
                    price: '49.99',
                    type: 'digital_product',
                    category_id: testCategoryId
                })
                .returning()
                .execute();
            productId = result[0].id;
        });

        it('should get product by ID', async () => {
            const result = await getProductById(productId);

            expect(result).not.toBeNull();
            expect(result!.id).toEqual(productId);
            expect(result!.name).toEqual('Test Product');
            expect(result!.price).toEqual(49.99);
            expect(typeof result!.price).toEqual('number');
        });

        it('should return null for non-existent product', async () => {
            const result = await getProductById(999);

            expect(result).toBeNull();
        });
    });

    describe('getProductByIdWithDetails', () => {
        let productId: number;

        beforeEach(async () => {
            const productResult = await db.insert(productsTable)
                .values({
                    name: 'Detailed Product',
                    description: 'Product with details',
                    price: '79.99',
                    type: 'digital_product',
                    category_id: testCategoryId
                })
                .returning()
                .execute();
            productId = productResult[0].id;

            // Create approved review
            await db.insert(reviewsTable)
                .values({
                    user_id: testUserId,
                    product_id: productId,
                    rating: 5,
                    comment: 'Great product!',
                    is_approved: true
                })
                .execute();

            // Create unapproved review (should not appear)
            await db.insert(reviewsTable)
                .values({
                    user_id: testUserId,
                    product_id: productId,
                    rating: 3,
                    comment: 'Not approved',
                    is_approved: false
                })
                .execute();
        });

        it('should get product with category and reviews', async () => {
            const result = await getProductByIdWithDetails(productId);

            expect(result).not.toBeNull();
            expect(result!.id).toEqual(productId);
            expect(result!.price).toEqual(79.99);
            expect(typeof result!.price).toEqual('number');
            
            // Check category info
            expect(result!.category).not.toBeNull();
            expect(result!.category!.name).toEqual('Test Category');
            expect(result!.category!.slug).toEqual('test-category');
            
            // Check reviews (only approved ones)
            expect(result!.reviews).toHaveLength(1);
            expect(result!.reviews[0].rating).toEqual(5);
            expect(result!.reviews[0].comment).toEqual('Great product!');
            expect(result!.reviews[0].user_name).toEqual('Test User');
            
            // Check average rating
            expect(result!.average_rating).toEqual(5);
        });

        it('should return null for non-existent product', async () => {
            const result = await getProductByIdWithDetails(999);

            expect(result).toBeNull();
        });

        it('should handle product with no reviews', async () => {
            // Create product without reviews
            const newProductResult = await db.insert(productsTable)
                .values({
                    name: 'No Reviews Product',
                    price: '29.99',
                    type: 'service',
                    category_id: testCategoryId
                })
                .returning()
                .execute();

            const result = await getProductByIdWithDetails(newProductResult[0].id);

            expect(result).not.toBeNull();
            expect(result!.reviews).toHaveLength(0);
            expect(result!.average_rating).toEqual(0);
        });
    });

    describe('updateProduct', () => {
        let productId: number;

        beforeEach(async () => {
            const result = await db.insert(productsTable)
                .values({
                    name: 'Original Product',
                    description: 'Original description',
                    price: '39.99',
                    type: 'digital_product',
                    category_id: testCategoryId,
                    is_active: true
                })
                .returning()
                .execute();
            productId = result[0].id;
        });

        it('should update product fields', async () => {
            const updateInput: UpdateProductInput = {
                id: productId,
                name: 'Updated Product',
                price: 59.99,
                is_active: false
            };

            const result = await updateProduct(updateInput);

            expect(result.id).toEqual(productId);
            expect(result.name).toEqual('Updated Product');
            expect(result.price).toEqual(59.99);
            expect(typeof result.price).toEqual('number');
            expect(result.is_active).toBe(false);
            expect(result.description).toEqual('Original description'); // Unchanged
        });

        it('should update only specified fields', async () => {
            const updateInput: UpdateProductInput = {
                id: productId,
                price: 49.99
            };

            const result = await updateProduct(updateInput);

            expect(result.price).toEqual(49.99);
            expect(result.name).toEqual('Original Product'); // Unchanged
        });

        it('should throw error for invalid category', async () => {
            const updateInput: UpdateProductInput = {
                id: productId,
                category_id: 999
            };

            expect(updateProduct(updateInput)).rejects.toThrow(/category not found/i);
        });

        it('should throw error for non-existent product', async () => {
            const updateInput: UpdateProductInput = {
                id: 999,
                name: 'Updated Name'
            };

            expect(updateProduct(updateInput)).rejects.toThrow(/product not found/i);
        });
    });

    describe('deleteProduct', () => {
        let productId: number;

        beforeEach(async () => {
            const result = await db.insert(productsTable)
                .values({
                    name: 'Product to Delete',
                    price: '25.99',
                    type: 'digital_product',
                    category_id: testCategoryId,
                    is_active: true
                })
                .returning()
                .execute();
            productId = result[0].id;
        });

        it('should soft delete product', async () => {
            const result = await deleteProduct(productId);

            expect(result.success).toBe(true);

            // Verify product is soft deleted
            const product = await db.select()
                .from(productsTable)
                .where(eq(productsTable.id, productId))
                .execute();

            expect(product[0].is_active).toBe(false);
        });

        it('should throw error for non-existent product', async () => {
            expect(deleteProduct(999)).rejects.toThrow(/product not found/i);
        });
    });

    describe('searchProducts', () => {
        beforeEach(async () => {
            // Create searchable products
            await db.insert(productsTable)
                .values([
                    {
                        name: 'JavaScript Guide',
                        description: 'Learn JavaScript programming',
                        price: '29.99',
                        type: 'digital_product',
                        category_id: testCategoryId,
                        is_active: true
                    },
                    {
                        name: 'Python Course',
                        description: 'Master Python development',
                        price: '39.99',
                        type: 'digital_product',
                        category_id: testCategoryId,
                        is_active: true
                    },
                    {
                        name: 'Web Design',
                        description: 'Create beautiful websites',
                        price: '49.99',
                        type: 'service',
                        category_id: testCategoryId,
                        is_active: false // Should not appear in search
                    }
                ])
                .execute();
        });

        it('should search products by name', async () => {
            const result = await searchProducts('JavaScript');

            expect(result.length).toEqual(1);
            expect(result[0].name).toEqual('JavaScript Guide');
            expect(result[0].price).toEqual(29.99);
            expect(typeof result[0].price).toEqual('number');
        });

        it('should search products by description', async () => {
            const result = await searchProducts('Python development');

            expect(result.length).toEqual(1);
            expect(result[0].name).toEqual('Python Course');
        });

        it('should be case insensitive', async () => {
            const result = await searchProducts('javascript');

            expect(result.length).toEqual(1);
            expect(result[0].name).toEqual('JavaScript Guide');
        });

        it('should only return active products', async () => {
            const result = await searchProducts('Web Design');

            expect(result.length).toEqual(0);
        });

        it('should respect limit parameter', async () => {
            const result = await searchProducts('Course', 1);

            expect(result.length).toEqual(1);
        });

        it('should return empty array for no matches', async () => {
            const result = await searchProducts('NonexistentProduct');

            expect(result.length).toEqual(0);
        });
    });
});