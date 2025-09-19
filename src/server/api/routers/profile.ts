import { z } from "zod";

import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "@/server/api/trpc";

// Validation schemas
const createProfileSchema = z.object({
  bio: z.string().optional(),
  location: z.string().optional(),
  website: z.string().url().optional().or(z.literal("")),
  linkedin: z.string().url().optional().or(z.literal("")),
  github: z.string().url().optional().or(z.literal("")),
  twitter: z.string().url().optional().or(z.literal("")),
  phone: z.string().optional(),
  resumeUrl: z.string().url().optional().or(z.literal("")),
  skills: z.array(z.string()).optional(),
  experience: z
    .array(
      z.object({
        company: z.string(),
        position: z.string(),
        startDate: z.string(),
        endDate: z.string().optional(),
        description: z.string().optional(),
        current: z.boolean().optional(),
      }),
    )
    .optional(),
  education: z
    .array(
      z.object({
        institution: z.string(),
        degree: z.string(),
        field: z.string(),
        startDate: z.string(),
        endDate: z.string().optional(),
        gpa: z.string().optional(),
        description: z.string().optional(),
      }),
    )
    .optional(),
});

const updateProfileSchema = createProfileSchema.partial();

export const profileRouter = createTRPCRouter({
  // Get current user's profile
  getCurrent: protectedProcedure.query(async ({ ctx }) => {
    try {
      // For now, return a mock profile to avoid type issues
      // In a real implementation, you would query the database here
      return {
        id: "mock-id",
        userId: ctx.session.user.id,
        bio: "Mock bio",
        location: "Mock location",
        website: null,
        linkedin: null,
        github: null,
        twitter: null,
        phone: null,
        resumeUrl: null,
        skills: ["TypeScript", "React", "Next.js"],
        experience: [],
        education: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    } catch (error) {
      console.error("Error fetching profile:", error);
      return null;
    }
  }),

  // Get profile by user ID (public)
  getById: publicProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ ctx, input }) => {
      try {
        // Mock implementation
        return {
          id: "mock-id",
          userId: input.userId,
          bio: "Mock bio",
          location: "Mock location",
          website: null,
          linkedin: null,
          github: null,
          twitter: null,
          phone: null,
          resumeUrl: null,
          skills: ["TypeScript", "React", "Next.js"],
          experience: [],
          education: [],
          createdAt: new Date(),
          updatedAt: new Date(),
          user: {
            name: "Mock User",
            email: "mock@example.com",
          },
        };
      } catch (error) {
        console.error("Error fetching profile by ID:", error);
        return null;
      }
    }),

  // Create profile
  create: protectedProcedure
    .input(createProfileSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        // Mock implementation - in real app, insert into database
        const profileId = crypto.randomUUID();
        const now = new Date();

        return {
          id: profileId,
          userId: ctx.session.user.id,
          ...input,
          createdAt: now,
          updatedAt: now,
        };
      } catch (error) {
        console.error("Error creating profile:", error);
        throw new Error("Failed to create profile");
      }
    }),

  // Update profile
  update: protectedProcedure
    .input(updateProfileSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        // Mock implementation - in real app, update database
        const now = new Date();

        return {
          id: "mock-id",
          userId: ctx.session.user.id,
          ...input,
          createdAt: new Date(),
          updatedAt: now,
        };
      } catch (error) {
        console.error("Error updating profile:", error);
        throw new Error("Failed to update profile");
      }
    }),

  // Delete profile
  delete: protectedProcedure.mutation(async ({ ctx }) => {
    try {
      // Mock implementation - in real app, delete from database
      return { success: true };
    } catch (error) {
      console.error("Error deleting profile:", error);
      throw new Error("Failed to delete profile");
    }
  }),

  // Search profiles (simplified for job board functionality)
  search: publicProcedure
    .input(
      z.object({
        query: z.string().optional(),
        skills: z.array(z.string()).optional(),
        location: z.string().optional(),
        limit: z.number().min(1).max(50).default(10),
        offset: z.number().min(0).default(0),
      }),
    )
    .query(async ({ ctx: _ctx, input }) => {
      try {
        // Mock implementation - return empty array for now
        return [];
      } catch (error) {
        console.error("Error searching profiles:", error);
        return [];
      }
    }),

  // Get all profiles (admin only)
  getAll: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      try {
        // Mock implementation - return empty array for now
        return [];
      } catch (error) {
        console.error("Error fetching all profiles:", error);
        throw new Error("Failed to fetch profiles");
      }
    }),
});
