import { z } from 'zod';
export declare const ASK_AI_MESSAGE_MAX_LENGTH = 8000;
export declare const AgentThreadStatusSchema: z.ZodEnum<["idle", "running", "failed"]>;
export type AgentThreadStatus = z.infer<typeof AgentThreadStatusSchema>;
export declare const MessageContentSchema: z.ZodString;
export declare const CreateThreadRequestSchema: z.ZodObject<{
    content: z.ZodString;
}, "strip", z.ZodTypeAny, {
    content: string;
}, {
    content: string;
}>;
export type CreateThreadRequest = z.infer<typeof CreateThreadRequestSchema>;
export declare const SendMessageRequestSchema: z.ZodObject<{
    content: z.ZodString;
}, "strip", z.ZodTypeAny, {
    content: string;
}, {
    content: string;
}>;
export type SendMessageRequest = z.infer<typeof SendMessageRequestSchema>;
export declare const UpdateThreadRequestSchema: z.ZodEffects<z.ZodObject<{
    title: z.ZodOptional<z.ZodString>;
    isFavorite: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    title?: string | undefined;
    isFavorite?: boolean | undefined;
}, {
    title?: string | undefined;
    isFavorite?: boolean | undefined;
}>, {
    title?: string | undefined;
    isFavorite?: boolean | undefined;
}, {
    title?: string | undefined;
    isFavorite?: boolean | undefined;
}>;
export type UpdateThreadRequest = z.infer<typeof UpdateThreadRequestSchema>;
export declare const AgentThreadSchema: z.ZodObject<{
    id: z.ZodString;
    domain: z.ZodLiteral<"ask_ai">;
    title: z.ZodString;
    status: z.ZodEnum<["idle", "running", "failed"]>;
    isFavorite: z.ZodBoolean;
    lastMessageAt: z.ZodString;
    createdAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    status: "idle" | "running" | "failed";
    title: string;
    isFavorite: boolean;
    id: string;
    domain: "ask_ai";
    lastMessageAt: string;
    createdAt: string;
}, {
    status: "idle" | "running" | "failed";
    title: string;
    isFavorite: boolean;
    id: string;
    domain: "ask_ai";
    lastMessageAt: string;
    createdAt: string;
}>;
export type AgentThread = z.infer<typeof AgentThreadSchema>;
export declare const AgentThreadListResponseSchema: z.ZodObject<{
    items: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        domain: z.ZodLiteral<"ask_ai">;
        title: z.ZodString;
        status: z.ZodEnum<["idle", "running", "failed"]>;
        isFavorite: z.ZodBoolean;
        lastMessageAt: z.ZodString;
        createdAt: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        status: "idle" | "running" | "failed";
        title: string;
        isFavorite: boolean;
        id: string;
        domain: "ask_ai";
        lastMessageAt: string;
        createdAt: string;
    }, {
        status: "idle" | "running" | "failed";
        title: string;
        isFavorite: boolean;
        id: string;
        domain: "ask_ai";
        lastMessageAt: string;
        createdAt: string;
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
        status: "idle" | "running" | "failed";
        title: string;
        isFavorite: boolean;
        id: string;
        domain: "ask_ai";
        lastMessageAt: string;
        createdAt: string;
    }[];
    pageInfo: {
        nextCursor: string | null;
        hasMore: boolean;
    };
}, {
    items: {
        status: "idle" | "running" | "failed";
        title: string;
        isFavorite: boolean;
        id: string;
        domain: "ask_ai";
        lastMessageAt: string;
        createdAt: string;
    }[];
    pageInfo: {
        nextCursor: string | null;
        hasMore: boolean;
    };
}>;
export type AgentThreadListResponse = z.infer<typeof AgentThreadListResponseSchema>;
export declare const TurnUsageSchema: z.ZodObject<{
    inputTokens: z.ZodNumber;
    outputTokens: z.ZodNumber;
    creditsCharged: z.ZodString;
}, "strip", z.ZodTypeAny, {
    inputTokens: number;
    outputTokens: number;
    creditsCharged: string;
}, {
    inputTokens: number;
    outputTokens: number;
    creditsCharged: string;
}>;
export type TurnUsage = z.infer<typeof TurnUsageSchema>;
/**
 * Durable thread events. Persisted with a monotonically increasing cursor, so a
 * client that reconnects with `?cursor=N` receives exactly the events after N.
 */
export declare const ThreadEventSchema: z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
    type: z.ZodLiteral<"message.user">;
    cursor: z.ZodNumber;
    createdAt: z.ZodString;
    payload: z.ZodObject<{
        messageId: z.ZodString;
        turnId: z.ZodString;
        content: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        content: string;
        messageId: string;
        turnId: string;
    }, {
        content: string;
        messageId: string;
        turnId: string;
    }>;
}, "strip", z.ZodTypeAny, {
    type: "message.user";
    cursor: number;
    createdAt: string;
    payload: {
        content: string;
        messageId: string;
        turnId: string;
    };
}, {
    type: "message.user";
    cursor: number;
    createdAt: string;
    payload: {
        content: string;
        messageId: string;
        turnId: string;
    };
}>, z.ZodObject<{
    type: z.ZodLiteral<"message.assistant">;
    cursor: z.ZodNumber;
    createdAt: z.ZodString;
    payload: z.ZodObject<{
        messageId: z.ZodString;
        turnId: z.ZodString;
        content: z.ZodString;
        usage: z.ZodNullable<z.ZodObject<{
            inputTokens: z.ZodNumber;
            outputTokens: z.ZodNumber;
            creditsCharged: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            inputTokens: number;
            outputTokens: number;
            creditsCharged: string;
        }, {
            inputTokens: number;
            outputTokens: number;
            creditsCharged: string;
        }>>;
    }, "strip", z.ZodTypeAny, {
        content: string;
        messageId: string;
        turnId: string;
        usage: {
            inputTokens: number;
            outputTokens: number;
            creditsCharged: string;
        } | null;
    }, {
        content: string;
        messageId: string;
        turnId: string;
        usage: {
            inputTokens: number;
            outputTokens: number;
            creditsCharged: string;
        } | null;
    }>;
}, "strip", z.ZodTypeAny, {
    type: "message.assistant";
    cursor: number;
    createdAt: string;
    payload: {
        content: string;
        messageId: string;
        turnId: string;
        usage: {
            inputTokens: number;
            outputTokens: number;
            creditsCharged: string;
        } | null;
    };
}, {
    type: "message.assistant";
    cursor: number;
    createdAt: string;
    payload: {
        content: string;
        messageId: string;
        turnId: string;
        usage: {
            inputTokens: number;
            outputTokens: number;
            creditsCharged: string;
        } | null;
    };
}>, z.ZodObject<{
    type: z.ZodLiteral<"turn.started">;
    cursor: z.ZodNumber;
    createdAt: z.ZodString;
    payload: z.ZodObject<{
        turnId: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        turnId: string;
    }, {
        turnId: string;
    }>;
}, "strip", z.ZodTypeAny, {
    type: "turn.started";
    cursor: number;
    createdAt: string;
    payload: {
        turnId: string;
    };
}, {
    type: "turn.started";
    cursor: number;
    createdAt: string;
    payload: {
        turnId: string;
    };
}>, z.ZodObject<{
    type: z.ZodLiteral<"turn.failed">;
    cursor: z.ZodNumber;
    createdAt: z.ZodString;
    payload: z.ZodObject<{
        turnId: z.ZodString;
        code: z.ZodString;
        message: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        code: string;
        message: string;
        turnId: string;
    }, {
        code: string;
        message: string;
        turnId: string;
    }>;
}, "strip", z.ZodTypeAny, {
    type: "turn.failed";
    cursor: number;
    createdAt: string;
    payload: {
        code: string;
        message: string;
        turnId: string;
    };
}, {
    type: "turn.failed";
    cursor: number;
    createdAt: string;
    payload: {
        code: string;
        message: string;
        turnId: string;
    };
}>, z.ZodObject<{
    type: z.ZodLiteral<"turn.cancelled">;
    cursor: z.ZodNumber;
    createdAt: z.ZodString;
    payload: z.ZodObject<{
        turnId: z.ZodString;
        partialContent: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        turnId: string;
        partialContent: string;
    }, {
        turnId: string;
        partialContent: string;
    }>;
}, "strip", z.ZodTypeAny, {
    type: "turn.cancelled";
    cursor: number;
    createdAt: string;
    payload: {
        turnId: string;
        partialContent: string;
    };
}, {
    type: "turn.cancelled";
    cursor: number;
    createdAt: string;
    payload: {
        turnId: string;
        partialContent: string;
    };
}>, z.ZodObject<{
    type: z.ZodLiteral<"thread.title">;
    cursor: z.ZodNumber;
    createdAt: z.ZodString;
    payload: z.ZodObject<{
        title: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        title: string;
    }, {
        title: string;
    }>;
}, "strip", z.ZodTypeAny, {
    type: "thread.title";
    cursor: number;
    createdAt: string;
    payload: {
        title: string;
    };
}, {
    type: "thread.title";
    cursor: number;
    createdAt: string;
    payload: {
        title: string;
    };
}>]>;
export type ThreadEvent = z.infer<typeof ThreadEventSchema>;
export type ThreadEventType = ThreadEvent['type'];
/**
 * Ephemeral streaming frames. Never persisted: `delta` carries the assistant
 * text as it is generated and `snapshot` lets a late subscriber catch up with
 * the text generated before it connected. `seq` orders them within a turn.
 */
export declare const StreamFrameSchema: z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
    type: z.ZodLiteral<"message.delta">;
    turnId: z.ZodString;
    seq: z.ZodNumber;
    delta: z.ZodString;
}, "strip", z.ZodTypeAny, {
    type: "message.delta";
    turnId: string;
    seq: number;
    delta: string;
}, {
    type: "message.delta";
    turnId: string;
    seq: number;
    delta: string;
}>, z.ZodObject<{
    type: z.ZodLiteral<"message.snapshot">;
    turnId: z.ZodString;
    seq: z.ZodNumber;
    content: z.ZodString;
}, "strip", z.ZodTypeAny, {
    type: "message.snapshot";
    content: string;
    turnId: string;
    seq: number;
}, {
    type: "message.snapshot";
    content: string;
    turnId: string;
    seq: number;
}>]>;
export type StreamFrame = z.infer<typeof StreamFrameSchema>;
export declare const ThreadDetailResponseSchema: z.ZodObject<{
    thread: z.ZodObject<{
        id: z.ZodString;
        domain: z.ZodLiteral<"ask_ai">;
        title: z.ZodString;
        status: z.ZodEnum<["idle", "running", "failed"]>;
        isFavorite: z.ZodBoolean;
        lastMessageAt: z.ZodString;
        createdAt: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        status: "idle" | "running" | "failed";
        title: string;
        isFavorite: boolean;
        id: string;
        domain: "ask_ai";
        lastMessageAt: string;
        createdAt: string;
    }, {
        status: "idle" | "running" | "failed";
        title: string;
        isFavorite: boolean;
        id: string;
        domain: "ask_ai";
        lastMessageAt: string;
        createdAt: string;
    }>;
    events: z.ZodArray<z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
        type: z.ZodLiteral<"message.user">;
        cursor: z.ZodNumber;
        createdAt: z.ZodString;
        payload: z.ZodObject<{
            messageId: z.ZodString;
            turnId: z.ZodString;
            content: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            content: string;
            messageId: string;
            turnId: string;
        }, {
            content: string;
            messageId: string;
            turnId: string;
        }>;
    }, "strip", z.ZodTypeAny, {
        type: "message.user";
        cursor: number;
        createdAt: string;
        payload: {
            content: string;
            messageId: string;
            turnId: string;
        };
    }, {
        type: "message.user";
        cursor: number;
        createdAt: string;
        payload: {
            content: string;
            messageId: string;
            turnId: string;
        };
    }>, z.ZodObject<{
        type: z.ZodLiteral<"message.assistant">;
        cursor: z.ZodNumber;
        createdAt: z.ZodString;
        payload: z.ZodObject<{
            messageId: z.ZodString;
            turnId: z.ZodString;
            content: z.ZodString;
            usage: z.ZodNullable<z.ZodObject<{
                inputTokens: z.ZodNumber;
                outputTokens: z.ZodNumber;
                creditsCharged: z.ZodString;
            }, "strip", z.ZodTypeAny, {
                inputTokens: number;
                outputTokens: number;
                creditsCharged: string;
            }, {
                inputTokens: number;
                outputTokens: number;
                creditsCharged: string;
            }>>;
        }, "strip", z.ZodTypeAny, {
            content: string;
            messageId: string;
            turnId: string;
            usage: {
                inputTokens: number;
                outputTokens: number;
                creditsCharged: string;
            } | null;
        }, {
            content: string;
            messageId: string;
            turnId: string;
            usage: {
                inputTokens: number;
                outputTokens: number;
                creditsCharged: string;
            } | null;
        }>;
    }, "strip", z.ZodTypeAny, {
        type: "message.assistant";
        cursor: number;
        createdAt: string;
        payload: {
            content: string;
            messageId: string;
            turnId: string;
            usage: {
                inputTokens: number;
                outputTokens: number;
                creditsCharged: string;
            } | null;
        };
    }, {
        type: "message.assistant";
        cursor: number;
        createdAt: string;
        payload: {
            content: string;
            messageId: string;
            turnId: string;
            usage: {
                inputTokens: number;
                outputTokens: number;
                creditsCharged: string;
            } | null;
        };
    }>, z.ZodObject<{
        type: z.ZodLiteral<"turn.started">;
        cursor: z.ZodNumber;
        createdAt: z.ZodString;
        payload: z.ZodObject<{
            turnId: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            turnId: string;
        }, {
            turnId: string;
        }>;
    }, "strip", z.ZodTypeAny, {
        type: "turn.started";
        cursor: number;
        createdAt: string;
        payload: {
            turnId: string;
        };
    }, {
        type: "turn.started";
        cursor: number;
        createdAt: string;
        payload: {
            turnId: string;
        };
    }>, z.ZodObject<{
        type: z.ZodLiteral<"turn.failed">;
        cursor: z.ZodNumber;
        createdAt: z.ZodString;
        payload: z.ZodObject<{
            turnId: z.ZodString;
            code: z.ZodString;
            message: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            code: string;
            message: string;
            turnId: string;
        }, {
            code: string;
            message: string;
            turnId: string;
        }>;
    }, "strip", z.ZodTypeAny, {
        type: "turn.failed";
        cursor: number;
        createdAt: string;
        payload: {
            code: string;
            message: string;
            turnId: string;
        };
    }, {
        type: "turn.failed";
        cursor: number;
        createdAt: string;
        payload: {
            code: string;
            message: string;
            turnId: string;
        };
    }>, z.ZodObject<{
        type: z.ZodLiteral<"turn.cancelled">;
        cursor: z.ZodNumber;
        createdAt: z.ZodString;
        payload: z.ZodObject<{
            turnId: z.ZodString;
            partialContent: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            turnId: string;
            partialContent: string;
        }, {
            turnId: string;
            partialContent: string;
        }>;
    }, "strip", z.ZodTypeAny, {
        type: "turn.cancelled";
        cursor: number;
        createdAt: string;
        payload: {
            turnId: string;
            partialContent: string;
        };
    }, {
        type: "turn.cancelled";
        cursor: number;
        createdAt: string;
        payload: {
            turnId: string;
            partialContent: string;
        };
    }>, z.ZodObject<{
        type: z.ZodLiteral<"thread.title">;
        cursor: z.ZodNumber;
        createdAt: z.ZodString;
        payload: z.ZodObject<{
            title: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            title: string;
        }, {
            title: string;
        }>;
    }, "strip", z.ZodTypeAny, {
        type: "thread.title";
        cursor: number;
        createdAt: string;
        payload: {
            title: string;
        };
    }, {
        type: "thread.title";
        cursor: number;
        createdAt: string;
        payload: {
            title: string;
        };
    }>]>, "many">;
    cursor: z.ZodNumber;
    activeTurnId: z.ZodNullable<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    cursor: number;
    thread: {
        status: "idle" | "running" | "failed";
        title: string;
        isFavorite: boolean;
        id: string;
        domain: "ask_ai";
        lastMessageAt: string;
        createdAt: string;
    };
    events: ({
        type: "message.user";
        cursor: number;
        createdAt: string;
        payload: {
            content: string;
            messageId: string;
            turnId: string;
        };
    } | {
        type: "message.assistant";
        cursor: number;
        createdAt: string;
        payload: {
            content: string;
            messageId: string;
            turnId: string;
            usage: {
                inputTokens: number;
                outputTokens: number;
                creditsCharged: string;
            } | null;
        };
    } | {
        type: "turn.started";
        cursor: number;
        createdAt: string;
        payload: {
            turnId: string;
        };
    } | {
        type: "turn.failed";
        cursor: number;
        createdAt: string;
        payload: {
            code: string;
            message: string;
            turnId: string;
        };
    } | {
        type: "turn.cancelled";
        cursor: number;
        createdAt: string;
        payload: {
            turnId: string;
            partialContent: string;
        };
    } | {
        type: "thread.title";
        cursor: number;
        createdAt: string;
        payload: {
            title: string;
        };
    })[];
    activeTurnId: string | null;
}, {
    cursor: number;
    thread: {
        status: "idle" | "running" | "failed";
        title: string;
        isFavorite: boolean;
        id: string;
        domain: "ask_ai";
        lastMessageAt: string;
        createdAt: string;
    };
    events: ({
        type: "message.user";
        cursor: number;
        createdAt: string;
        payload: {
            content: string;
            messageId: string;
            turnId: string;
        };
    } | {
        type: "message.assistant";
        cursor: number;
        createdAt: string;
        payload: {
            content: string;
            messageId: string;
            turnId: string;
            usage: {
                inputTokens: number;
                outputTokens: number;
                creditsCharged: string;
            } | null;
        };
    } | {
        type: "turn.started";
        cursor: number;
        createdAt: string;
        payload: {
            turnId: string;
        };
    } | {
        type: "turn.failed";
        cursor: number;
        createdAt: string;
        payload: {
            code: string;
            message: string;
            turnId: string;
        };
    } | {
        type: "turn.cancelled";
        cursor: number;
        createdAt: string;
        payload: {
            turnId: string;
            partialContent: string;
        };
    } | {
        type: "thread.title";
        cursor: number;
        createdAt: string;
        payload: {
            title: string;
        };
    })[];
    activeTurnId: string | null;
}>;
export type ThreadDetailResponse = z.infer<typeof ThreadDetailResponseSchema>;
export declare const CreateThreadResponseSchema: z.ZodObject<{
    threadId: z.ZodString;
    turnId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    turnId: string;
    threadId: string;
}, {
    turnId: string;
    threadId: string;
}>;
export type CreateThreadResponse = z.infer<typeof CreateThreadResponseSchema>;
export declare const SendMessageResponseSchema: z.ZodObject<{
    turnId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    turnId: string;
}, {
    turnId: string;
}>;
export type SendMessageResponse = z.infer<typeof SendMessageResponseSchema>;
export declare const AskAiTurnRequestSchema: z.ZodObject<{
    userId: z.ZodString;
    threadId: z.ZodString;
    mastraThreadId: z.ZodString;
    turnId: z.ZodString;
    message: z.ZodString;
    locale: z.ZodOptional<z.ZodString>;
    userName: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    message: string;
    turnId: string;
    threadId: string;
    userId: string;
    mastraThreadId: string;
    locale?: string | undefined;
    userName?: string | undefined;
}, {
    message: string;
    turnId: string;
    threadId: string;
    userId: string;
    mastraThreadId: string;
    locale?: string | undefined;
    userName?: string | undefined;
}>;
export type AskAiTurnRequest = z.infer<typeof AskAiTurnRequestSchema>;
/** NDJSON frames the agents service streams back for one turn. */
export declare const AskAiTurnFrameSchema: z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
    type: z.ZodLiteral<"text-delta">;
    delta: z.ZodString;
}, "strip", z.ZodTypeAny, {
    type: "text-delta";
    delta: string;
}, {
    type: "text-delta";
    delta: string;
}>, z.ZodObject<{
    type: z.ZodLiteral<"finish">;
    text: z.ZodString;
    modelId: z.ZodString;
    usage: z.ZodObject<{
        inputTokens: z.ZodNumber;
        outputTokens: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        inputTokens: number;
        outputTokens: number;
    }, {
        inputTokens: number;
        outputTokens: number;
    }>;
}, "strip", z.ZodTypeAny, {
    type: "finish";
    usage: {
        inputTokens: number;
        outputTokens: number;
    };
    text: string;
    modelId: string;
}, {
    type: "finish";
    usage: {
        inputTokens: number;
        outputTokens: number;
    };
    text: string;
    modelId: string;
}>, z.ZodObject<{
    type: z.ZodLiteral<"error">;
    code: z.ZodString;
    message: z.ZodString;
}, "strip", z.ZodTypeAny, {
    code: string;
    message: string;
    type: "error";
}, {
    code: string;
    message: string;
    type: "error";
}>]>;
export type AskAiTurnFrame = z.infer<typeof AskAiTurnFrameSchema>;
export declare const ThreadTitleRequestSchema: z.ZodObject<{
    userId: z.ZodString;
    messages: z.ZodArray<z.ZodString, "many">;
    locale: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    userId: string;
    messages: string[];
    locale?: string | undefined;
}, {
    userId: string;
    messages: string[];
    locale?: string | undefined;
}>;
export type ThreadTitleRequest = z.infer<typeof ThreadTitleRequestSchema>;
export declare const ThreadTitleResponseSchema: z.ZodObject<{
    title: z.ZodString;
}, "strip", z.ZodTypeAny, {
    title: string;
}, {
    title: string;
}>;
export type ThreadTitleResponse = z.infer<typeof ThreadTitleResponseSchema>;
//# sourceMappingURL=ask-ai.d.ts.map