import { z } from "zod";

/**
 * All user-specific behaviour lives here as editable configuration.
 * Nothing in the scoring engine hardcodes the profile.
 */

export const experienceSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  summary: z.string().min(1),
  tags: z.array(z.string()).default([]),
});

export const skillSchema = z.object({
  name: z.string().min(1),
  level: z.enum(["core", "secondary", "complementary"]),
  aliases: z.array(z.string()).default([]),
});

export const scoringWeightsSchema = z.object({
  tech: z.number().min(0).max(10),
  client: z.number().min(0).max(10),
  commercial: z.number().min(0).max(10),
  practical: z.number().min(0).max(10),
});

export const appSettingsSchema = z.object({
  profile: z.object({
    name: z.string(),
    headline: z.string(),
    yearsExperience: z.number().int().min(0),
    location: z.string(),
    languages: z.array(z.object({ code: z.string(), level: z.enum(["native", "fluent", "conversational", "basic"]) })),
    skills: z.array(skillSchema),
    experiences: z.array(experienceSchema),
  }),
  preferences: z.object({
    minHourlyRate: z.number().min(0),
    targetHourlyRate: z.number().min(0),
    currency: z.string(),
    preferredClientTypes: z.array(z.string()),
    preferredSectors: z.array(z.string()),
    preferredEngagements: z.array(z.string()),
    preferredRegions: z.array(z.string()),
    spanishShare: z.number().min(0).max(100),
    weeklyApplicationTarget: z.number().int().min(0),
    hoursPerWeekAvailable: z.number().int().min(0),
  }),
  scoring: z.object({
    weights: scoringWeightsSchema,
    unfamiliarTech: z.array(z.string()),
  }),
  ai: z.object({
    enabled: z.boolean(),
    model: z.string(),
    timeoutMs: z.number().int().min(1000).max(120000),
    maxDailyCalls: z.number().int().min(0),
  }),
  sync: z.object({
    getonboard: z.object({
      enabled: z.boolean(),
      intervalMinutes: z.number().int().min(30),
      queries: z.array(z.string().min(1)).max(20),
      maxPagesPerQuery: z.number().int().min(1).max(5),
      remoteOnly: z.boolean(),
    }),
  }),
  security: z.object({
    blockAttachmentDownloads: z.literal(true),
    blockRepositoryExecution: z.literal(true),
    requireApprovalForExternalActions: z.literal(true),
  }),
});

export type AppSettings = z.infer<typeof appSettingsSchema>;
export type Skill = z.infer<typeof skillSchema>;
export type Experience = z.infer<typeof experienceSchema>;

export const DEFAULT_SETTINGS: AppSettings = {
  // Generic example profile. Put your real profile in config/profile.local.json (git-ignored);
  // `npm run db:seed` loads it automatically, and everything is editable later in Settings.
  profile: {
    name: "Alex Example",
    headline: "Senior Product Engineer · Full-Stack · Applied AI",
    yearsExperience: 7,
    location: "LATAM (remote)",
    languages: [
      { code: "es", level: "native" },
      { code: "en", level: "conversational" },
    ],
    skills: [
      { name: "TypeScript", level: "core", aliases: ["ts"] },
      { name: "JavaScript", level: "core", aliases: ["js", "ecmascript"] },
      { name: "Node.js", level: "core", aliases: ["node", "nodejs", "express"] },
      { name: "NestJS", level: "core", aliases: ["nest"] },
      { name: "React", level: "core", aliases: ["reactjs", "react.js"] },
      { name: "Next.js", level: "core", aliases: ["nextjs", "next"] },
      { name: "PostgreSQL", level: "core", aliases: ["postgres", "sql"] },
      { name: "MongoDB", level: "secondary", aliases: ["mongo", "mongoose"] },
      { name: "Redis", level: "secondary", aliases: [] },
      { name: "GraphQL", level: "core", aliases: ["apollo"] },
      { name: "REST APIs", level: "core", aliases: ["rest", "api rest", "restful"] },
      { name: "Docker", level: "core", aliases: ["containers"] },
      { name: "AWS", level: "secondary", aliases: ["amazon web services", "s3", "lambda", "ec2"] },
      { name: "WebSockets", level: "core", aliases: ["websocket", "socket.io", "socketio", "real-time", "realtime"] },
      { name: "Python", level: "secondary", aliases: [] },
      { name: "FastAPI", level: "secondary", aliases: [] },
      { name: "LLM integrations", level: "core", aliases: ["llm", "openai", "gpt", "langchain", "ai agents"] },
      { name: "RAG", level: "core", aliases: ["retrieval augmented", "embeddings", "pgvector", "vector database"] },
      { name: "Stripe", level: "secondary", aliases: [] },
    ],
    experiences: [
      {
        key: "b2b-saas",
        name: "B2B SaaS platform (example)",
        summary: "Multi-tenant SaaS with workspaces, permissions, documents, Stripe billing and real-time collaboration.",
        tags: ["saas", "b2b", "stripe", "realtime", "permissions", "collaboration"],
      },
      {
        key: "fintech-dashboards",
        name: "Fintech dashboards (example)",
        summary: "Operator tooling with live market data, configurable dashboards and WebSockets.",
        tags: ["fintech", "dashboards", "websockets", "python", "market data"],
      },
      {
        key: "ai-assistant",
        name: "Conversational AI product (example)",
        summary: "LLM-powered assistant with RAG over a knowledge base, integrations and bookings.",
        tags: ["ai", "rag", "llm", "chatbot", "pgvector", "saas"],
      },
    ],
  },
  preferences: {
    minHourlyRate: 30,
    targetHourlyRate: 45,
    currency: "USD",
    preferredClientTypes: ["founder", "startup", "smb", "agency"],
    preferredSectors: ["saas", "fintech", "healthtech", "b2b", "ai"],
    preferredEngagements: ["fractional", "freelance", "contract"],
    preferredRegions: ["US", "LATAM", "Remote"],
    spanishShare: 70,
    weeklyApplicationTarget: 10,
    hoursPerWeekAvailable: 30,
  },
  scoring: {
    weights: { tech: 3, client: 2.5, commercial: 3, practical: 1.5 },
    unfamiliarTech: [
      "java",
      "spring",
      ".net",
      "c#",
      "ruby on rails",
      "golang",
      "rust",
      "swift",
      "kotlin",
      "flutter",
      "angular",
      "salesforce",
      "sap",
      "abap",
      "unity",
      "c++",
      "scala",
      "elixir",
      "cobol",
    ],
  },
  ai: { enabled: false, model: "anthropic/claude-sonnet-5.5", timeoutMs: 45000, maxDailyCalls: 40 },
  sync: {
    getonboard: {
      enabled: true,
      intervalMinutes: 360,
      queries: ["react", "node", "typescript", "full stack", "next.js", "python", "product engineer"],
      maxPagesPerQuery: 2,
      remoteOnly: true,
    },
  },
  security: {
    blockAttachmentDownloads: true,
    blockRepositoryExecution: true,
    requireApprovalForExternalActions: true,
  },
};
