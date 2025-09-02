import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { couponsTable } from '../db/schema';
import { type CreateCouponInput } from '../schema';
import { createCoupon } from '../handlers/coupons';
import { eq } from 'drizzle-orm';

// Test inputs for different coupon types
const percentageCouponInput: CreateCouponInput = {
    code: 'SAVE20',
    type: 'percentage',
    value: 20,
    minimum_order_amount: 100,
    usage_limit: 50,
    expires_at: new Date('2024-12-31')
};

const fixedAmountCouponInput: CreateCouponInput = {
    code: 'FIXED10',
    type: 'fixed_amount',
    value: 10,
    minimum_order_amount: null,
    usage_limit: null,
    expires_at: null
};

describe('createCoupon', () => {
    beforeEach(createDB);
    afterEach(resetDB);

    it('should create a percentage coupon with all fields', async () => {
        const result = await createCoupon(percentageCouponInput);

        // Basic field validation
        expect(result.code).toEqual('SAVE20');
        expect(result.type).toEqual('percentage');
        expect(result.value).toEqual(20);
        expect(typeof result.value).toEqual('number');
        expect(result.minimum_order_amount).toEqual(100);
        expect(typeof result.minimum_order_amount).toEqual('number');
        expect(result.usage_limit).toEqual(50);
        expect(result.used_count).toEqual(0);
        expect(result.is_active).toEqual(true);
        expect(result.expires_at).toBeInstanceOf(Date);
        expect(result.id).toBeDefined();
        expect(result.created_at).toBeInstanceOf(Date);
        expect(result.updated_at).toBeInstanceOf(Date);
    });

    it('should create a fixed amount coupon with nullable fields', async () => {
        const result = await createCoupon(fixedAmountCouponInput);

        // Basic field validation
        expect(result.code).toEqual('FIXED10');
        expect(result.type).toEqual('fixed_amount');
        expect(result.value).toEqual(10);
        expect(typeof result.value).toEqual('number');
        expect(result.minimum_order_amount).toBeNull();
        expect(result.usage_limit).toBeNull();
        expect(result.used_count).toEqual(0);
        expect(result.is_active).toEqual(true);
        expect(result.expires_at).toBeNull();
        expect(result.id).toBeDefined();
        expect(result.created_at).toBeInstanceOf(Date);
        expect(result.updated_at).toBeInstanceOf(Date);
    });

    it('should save coupon to database with correct data types', async () => {
        const result = await createCoupon(percentageCouponInput);

        // Query the database to verify storage
        const coupons = await db.select()
            .from(couponsTable)
            .where(eq(couponsTable.id, result.id))
            .execute();

        expect(coupons).toHaveLength(1);
        const coupon = coupons[0];
        
        expect(coupon.code).toEqual('SAVE20');
        expect(coupon.type).toEqual('percentage');
        // Database stores as string, verify parsing works
        expect(parseFloat(coupon.value)).toEqual(20);
        expect(parseFloat(coupon.minimum_order_amount!)).toEqual(100);
        expect(coupon.usage_limit).toEqual(50);
        expect(coupon.used_count).toEqual(0);
        expect(coupon.is_active).toEqual(true);
        expect(coupon.expires_at).toBeInstanceOf(Date);
        expect(coupon.created_at).toBeInstanceOf(Date);
        expect(coupon.updated_at).toBeInstanceOf(Date);
    });

    it('should handle duplicate coupon codes by throwing error', async () => {
        // Create first coupon
        await createCoupon(percentageCouponInput);

        // Attempt to create duplicate
        const duplicateInput: CreateCouponInput = {
            ...percentageCouponInput,
            value: 15 // Different value but same code
        };

        // Should throw error due to unique constraint
        expect(createCoupon(duplicateInput)).rejects.toThrow(/duplicate key value violates unique constraint|UNIQUE constraint failed/i);
    });

    it('should handle minimum positive values correctly', async () => {
        const minValueInput: CreateCouponInput = {
            code: 'MIN01',
            type: 'fixed_amount',
            value: 0.01,
            minimum_order_amount: 0.01,
            usage_limit: 1,
            expires_at: new Date()
        };

        const result = await createCoupon(minValueInput);

        expect(result.value).toEqual(0.01);
        expect(typeof result.value).toEqual('number');
        expect(result.minimum_order_amount).toEqual(0.01);
        expect(typeof result.minimum_order_amount).toEqual('number');
        expect(result.usage_limit).toEqual(1);
    });

    it('should handle large numeric values correctly', async () => {
        const largeValueInput: CreateCouponInput = {
            code: 'LARGE99',
            type: 'percentage',
            value: 99.99,
            minimum_order_amount: 9999.99,
            usage_limit: 999999,
            expires_at: null
        };

        const result = await createCoupon(largeValueInput);

        expect(result.value).toEqual(99.99);
        expect(result.minimum_order_amount).toEqual(9999.99);
        expect(result.usage_limit).toEqual(999999);
    });

    it('should set default values correctly', async () => {
        const basicInput: CreateCouponInput = {
            code: 'BASIC',
            type: 'percentage',
            value: 5,
            minimum_order_amount: null,
            usage_limit: null,
            expires_at: null
        };

        const result = await createCoupon(basicInput);

        // Verify defaults are applied
        expect(result.used_count).toEqual(0);
        expect(result.is_active).toEqual(true);
        expect(result.minimum_order_amount).toBeNull();
        expect(result.usage_limit).toBeNull();
        expect(result.expires_at).toBeNull();
    });

    it('should handle future expiration dates correctly', async () => {
        const futureDate = new Date();
        futureDate.setFullYear(futureDate.getFullYear() + 1);

        const futureInput: CreateCouponInput = {
            code: 'FUTURE',
            type: 'fixed_amount',
            value: 25,
            minimum_order_amount: null,
            usage_limit: null,
            expires_at: futureDate
        };

        const result = await createCoupon(futureInput);

        expect(result.expires_at).toBeInstanceOf(Date);
        expect(result.expires_at!.getFullYear()).toEqual(futureDate.getFullYear());
    });
});