import { z } from 'zod';
/** Credit amounts cross the wire as decimal strings: floats cannot represent the ledger exactly. */
export declare const CreditAmountSchema: z.ZodString;
export declare const CreditBalanceResponseSchema: z.ZodObject<{
    balance: z.ZodString;
    /** Soonest expiry among sources that still hold credits. */
    nextExpiry: z.ZodNullable<z.ZodObject<{
        amount: z.ZodString;
        expiresAt: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        expiresAt: string;
        amount: string;
    }, {
        expiresAt: string;
        amount: string;
    }>>;
}, "strip", z.ZodTypeAny, {
    balance: string;
    nextExpiry: {
        expiresAt: string;
        amount: string;
    } | null;
}, {
    balance: string;
    nextExpiry: {
        expiresAt: string;
        amount: string;
    } | null;
}>;
export type CreditBalanceResponse = z.infer<typeof CreditBalanceResponseSchema>;
export declare const CreditTransactionTypeSchema: z.ZodEnum<["grant", "usage", "refund", "expiry", "adjustment"]>;
export declare const CreditTransactionSchema: z.ZodObject<{
    id: z.ZodString;
    type: z.ZodEnum<["grant", "usage", "refund", "expiry", "adjustment"]>;
    amount: z.ZodString;
    balanceAfter: z.ZodString;
    description: z.ZodNullable<z.ZodString>;
    referenceType: z.ZodNullable<z.ZodString>;
    referenceId: z.ZodNullable<z.ZodString>;
    createdAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    type: "usage" | "grant" | "refund" | "expiry" | "adjustment";
    id: string;
    createdAt: string;
    amount: string;
    balanceAfter: string;
    description: string | null;
    referenceType: string | null;
    referenceId: string | null;
}, {
    type: "usage" | "grant" | "refund" | "expiry" | "adjustment";
    id: string;
    createdAt: string;
    amount: string;
    balanceAfter: string;
    description: string | null;
    referenceType: string | null;
    referenceId: string | null;
}>;
export type CreditTransaction = z.infer<typeof CreditTransactionSchema>;
export declare const CreditTransactionListResponseSchema: z.ZodObject<{
    items: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        type: z.ZodEnum<["grant", "usage", "refund", "expiry", "adjustment"]>;
        amount: z.ZodString;
        balanceAfter: z.ZodString;
        description: z.ZodNullable<z.ZodString>;
        referenceType: z.ZodNullable<z.ZodString>;
        referenceId: z.ZodNullable<z.ZodString>;
        createdAt: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        type: "usage" | "grant" | "refund" | "expiry" | "adjustment";
        id: string;
        createdAt: string;
        amount: string;
        balanceAfter: string;
        description: string | null;
        referenceType: string | null;
        referenceId: string | null;
    }, {
        type: "usage" | "grant" | "refund" | "expiry" | "adjustment";
        id: string;
        createdAt: string;
        amount: string;
        balanceAfter: string;
        description: string | null;
        referenceType: string | null;
        referenceId: string | null;
    }>, "many">;
    pageInfo: z.ZodObject<{
        nextCursor: z.ZodNullable<z.ZodString>;
        hasMore: z.ZodBoolean;
    }, "strip", z.ZodTypeAny, {
        nextCursor: string | null;
        hasMore: boolean;
    }, {
        nextCursor: string | null;
        hasMore: boolean;
    }>;
}, "strip", z.ZodTypeAny, {
    items: {
        type: "usage" | "grant" | "refund" | "expiry" | "adjustment";
        id: string;
        createdAt: string;
        amount: string;
        balanceAfter: string;
        description: string | null;
        referenceType: string | null;
        referenceId: string | null;
    }[];
    pageInfo: {
        nextCursor: string | null;
        hasMore: boolean;
    };
}, {
    items: {
        type: "usage" | "grant" | "refund" | "expiry" | "adjustment";
        id: string;
        createdAt: string;
        amount: string;
        balanceAfter: string;
        description: string | null;
        referenceType: string | null;
        referenceId: string | null;
    }[];
    pageInfo: {
        nextCursor: string | null;
        hasMore: boolean;
    };
}>;
export type CreditTransactionListResponse = z.infer<typeof CreditTransactionListResponseSchema>;
export declare const CreditPackageSchema: z.ZodObject<{
    packageId: z.ZodString;
    name: z.ZodString;
    credits: z.ZodNumber;
    price: z.ZodString;
    currency: z.ZodString;
    validityDays: z.ZodNullable<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    name: string;
    packageId: string;
    credits: number;
    price: string;
    currency: string;
    validityDays: number | null;
}, {
    name: string;
    packageId: string;
    credits: number;
    price: string;
    currency: string;
    validityDays: number | null;
}>;
export type CreditPackage = z.infer<typeof CreditPackageSchema>;
export declare const CreditPackageListResponseSchema: z.ZodObject<{
    packages: z.ZodArray<z.ZodObject<{
        packageId: z.ZodString;
        name: z.ZodString;
        credits: z.ZodNumber;
        price: z.ZodString;
        currency: z.ZodString;
        validityDays: z.ZodNullable<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        packageId: string;
        credits: number;
        price: string;
        currency: string;
        validityDays: number | null;
    }, {
        name: string;
        packageId: string;
        credits: number;
        price: string;
        currency: string;
        validityDays: number | null;
    }>, "many">;
    checkoutEnabled: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    packages: {
        name: string;
        packageId: string;
        credits: number;
        price: string;
        currency: string;
        validityDays: number | null;
    }[];
    checkoutEnabled: boolean;
}, {
    packages: {
        name: string;
        packageId: string;
        credits: number;
        price: string;
        currency: string;
        validityDays: number | null;
    }[];
    checkoutEnabled: boolean;
}>;
export type CreditPackageListResponse = z.infer<typeof CreditPackageListResponseSchema>;
export declare const CheckoutRequestSchema: z.ZodObject<{
    packageId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    packageId: string;
}, {
    packageId: string;
}>;
export type CheckoutRequest = z.infer<typeof CheckoutRequestSchema>;
export declare const CheckoutResponseSchema: z.ZodObject<{
    checkoutUrl: z.ZodString;
}, "strip", z.ZodTypeAny, {
    checkoutUrl: string;
}, {
    checkoutUrl: string;
}>;
export type CheckoutResponse = z.infer<typeof CheckoutResponseSchema>;
//# sourceMappingURL=credits.d.ts.map