'use server';

import { CreateBook, TextSegment } from "@/types";
import { connectToDatabase } from "@/database/mongoose";
import { escapeRegex, generateSlug, serializeData } from "@/lib/utils";
import Book from "@/database/models/book.model";
import BookSegment from "@/database/models/book-segment.model";
import mongoose from "mongoose";
import { getUserPlan } from "@/lib/subscription.server";


// =============================
// GET ALL BOOKS
// =============================
export const getAllBooks = async (search?: string) => {
    try {
        await connectToDatabase();

        let query = {};

        if (search) {
            const escapedSearch = escapeRegex(search);
            const regex = new RegExp(escapedSearch, "i");

            query = {
                $or: [
                    { title: { $regex: regex } },
                    { author: { $regex: regex } },
                ],
            };
        }

        const books = await Book.find(query)
            .sort({ createdAt: -1 })
            .lean();

        return {
            success: true,
            data: serializeData(books),
        };
    } catch (error) {
        console.error("Error fetching books:", error);
        return { success: false, error };
    }
};


// =============================
// CHECK BOOK EXISTS
// =============================
export const checkBookExists = async (title: string) => {
    try {
        await connectToDatabase();

        const slug = generateSlug(title);
        const existingBook = await Book.findOne({ slug }).lean();

        if (existingBook) {
            return {
                exists: true,
                book: serializeData(existingBook),
            };
        }

        return { exists: false };
    } catch (error) {
        console.error("Error checking book exists:", error);
        return { exists: false, error };
    }
};


// =============================
// CREATE BOOK
// =============================
export const createBook = async (data: CreateBook) => {
    try {
        await connectToDatabase();

        const slug = generateSlug(data.title);

        // Check duplicate
        const existingBook = await Book.findOne({ slug }).lean();
        if (existingBook) {
            return {
                success: true,
                data: serializeData(existingBook),
                alreadyExists: true,
            };
        }

        // Auth validation
        const { auth } = await import("@clerk/nextjs/server");
        const { PLAN_LIMITS } = await import("@/lib/subscription-constants");

        const { userId } = await auth();

        if (!userId || userId !== data.clerkId) {
            return { success: false, error: "Unauthorized" };
        }

        // Subscription limit check
        const plan = await getUserPlan();
        const limits = PLAN_LIMITS[plan];
        const bookCount = await Book.countDocuments({ clerkId: userId });

        if (bookCount >= limits.maxBooks) {
            return {
                success: false,
                error: `Book limit reached for ${plan} plan (${limits.maxBooks}). Upgrade to continue.`,
                isBillingError: true,
            };
        }

        const book = await Book.create({
            ...data,
            clerkId: userId,
            slug,
            totalSegments: 0,
        });

        return {
            success: true,
            data: serializeData(book),
        };
    } catch (error) {
        console.error("Error creating book:", error);
        return { success: false, error };
    }
};


// =============================
// GET BOOK BY SLUG
// =============================
export const getBookBySlug = async (slug: string) => {
    try {
        await connectToDatabase();

        if (!slug) {
            return { success: false, error: "Invalid slug" };
        }

        const book = await Book.findOne({ slug }).lean();

        if (!book) {
            return { success: false, error: "Book not found" };
        }

        return {
            success: true,
            data: serializeData(book),
        };
    } catch (error) {
        console.error("Error fetching book by slug:", error);
        return { success: false, error };
    }
};


// =============================
// SAVE BOOK SEGMENTS
// =============================
export const saveBookSegments = async (
    bookId: string,
    clerkId: string,
    segments: TextSegment[]
) => {
    try {
        await connectToDatabase();

        if (!segments || segments.length === 0) {
            return { success: false, error: "No segments provided" };
        }

        const segmentsToInsert = segments.map(
            ({ text, segmentIndex, pageNumber, wordCount }) => ({
                clerkId,
                bookId,
                content: text,
                segmentIndex,
                pageNumber,
                wordCount,
            })
        );

        await BookSegment.insertMany(segmentsToInsert);

        await Book.findByIdAndUpdate(bookId, {
            totalSegments: segments.length,
        });

        return {
            success: true,
            data: { segmentsCreated: segments.length },
        };
    } catch (error) {
        console.error("Error saving book segments:", error);
        return { success: false, error };
    }
};


// =============================
// SEARCH BOOK SEGMENTS
// =============================
export const searchBookSegments = async (
    bookId: string,
    query: string,
    limit: number = 5
) => {
    try {
        await connectToDatabase();

        const bookObjectId = new mongoose.Types.ObjectId(bookId);

        let segments: Record<string, unknown>[] = [];

        // Try text search first
        try {
            segments = await BookSegment.find({
                bookId: bookObjectId,
                $text: { $search: query },
            })
                .select("_id bookId content segmentIndex pageNumber wordCount")
                .sort({ score: { $meta: "textScore" } })
                .limit(limit)
                .lean();
        } catch {
            segments = [];
        }

        // Fallback regex search
        if (segments.length === 0) {
            const keywords = query.split(/\s+/).filter((k) => k.length > 2);
            const pattern = keywords.map(escapeRegex).join("|");

            segments = await BookSegment.find({
                bookId: bookObjectId,
                content: { $regex: pattern, $options: "i" },
            })
                .select("_id bookId content segmentIndex pageNumber wordCount")
                .sort({ segmentIndex: 1 })
                .limit(limit)
                .lean();
        }

        return {
            success: true,
            data: serializeData(segments),
        };
    } catch (error) {
        console.error("Error searching segments:", error);
        return {
            success: false,
            error: (error as Error).message,
            data: [],
        };
    }
};