import { z } from "zod";
import type { AppSettings, Experience } from "@/features/settings/types";
import { containsTerm } from "@/server/normalization/text";
import { completeJson, UNTRUSTED_CONTENT_RULES, untrustedBlock } from "@/server/ai/openrouter";

export type ProposalStyle = "brief" | "standard" | "detailed";
export type ProposalLanguage = "es" | "en";

export interface ProposalContext {
  opportunityId?: string;
  title: string;
  description: string;
  companyName: string | null;
  skills: string[];
  sourceKey: string;
}

/** Picks experiences whose tags appear in the opportunity text. Only real, configured experiences are ever used. */
export function selectExperiences(ctx: ProposalContext, settings: AppSettings, max = 2): Experience[] {
  const text = `${ctx.title}\n${ctx.description}\n${ctx.skills.join(" ")}`.toLowerCase();
  return settings.profile.experiences
    .map((e) => ({ e, hits: e.tags.filter((t) => containsTerm(text, t)).length }))
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, max)
    .map((x) => x.e);
}

function matchedSkills(ctx: ProposalContext, settings: AppSettings): string[] {
  const text = `${ctx.title}\n${ctx.description}\n${ctx.skills.join(" ")}`.toLowerCase();
  return settings.profile.skills
    .filter((s) => s.level !== "complementary" && [s.name, ...s.aliases].some((t) => containsTerm(text, t.toLowerCase())))
    .map((s) => s.name)
    .slice(0, 6);
}

/**
 * Deterministic draft used when AI is not available. It is explicitly a TEMPLATE with
 * bracketed sections the user must complete — it does not pretend to understand the post.
 */
export function buildTemplateProposal(ctx: ProposalContext, settings: AppSettings, lang: ProposalLanguage, style: ProposalStyle): string {
  const exps = selectExperiences(ctx, settings, style === "brief" ? 1 : 2);
  const skills = matchedSkills(ctx, settings);
  const p = settings.profile;
  if (lang === "es") {
    const lines = [
      "Hola,",
      "",
      `Leí la propuesta "${ctx.title}". [Resume en 1–2 frases el problema del cliente con tus palabras.]`,
      "",
      `Soy ${p.headline.split("·")[0].trim()} con ${p.yearsExperience}+ años construyendo producto${skills.length ? `, trabajando con ${skills.join(", ")}` : ""}.`,
    ];
    if (exps.length) {
      lines.push("", "Experiencia relacionada:");
      for (const e of exps) lines.push(`- ${e.name}: ${e.summary}`);
    }
    if (style !== "brief") lines.push("", "Cómo lo abordaría: [2–3 pasos concretos, sin prometer plazos que no puedas cumplir.]");
    lines.push("", "Preguntas:", "- [Pregunta útil sobre alcance o prioridades]");
    if (style === "detailed") lines.push("- [Pregunta sobre equipo, stack actual o criterio de éxito]");
    lines.push("", "¿Te parece si hacemos una llamada corta de 15–20 minutos para revisar el alcance?", "", "Saludos,", p.name);
    return lines.join("\n");
  }
  const lines = [
    "Hi,",
    "",
    `I read your post "${ctx.title}". [Summarize the client's problem in 1–2 sentences in your own words.]`,
    "",
    `I'm a ${p.headline.split("·")[0].trim()} with ${p.yearsExperience}+ years building products${skills.length ? `, working with ${skills.join(", ")}` : ""}.`,
  ];
  if (exps.length) {
    lines.push("", "Related work:");
    for (const e of exps) lines.push(`- ${e.name}: [describe in English] ${e.summary}`);
  }
  if (style !== "brief") lines.push("", "How I'd approach it: [2–3 concrete steps; no promises you can't keep.]");
  lines.push("", "Questions:", "- [One useful question about scope or priorities]");
  if (style === "detailed") lines.push("- [Question about team, current stack or success criteria]");
  lines.push("", "Would a short 15–20 minute call work to go over the scope?", "", "Best,", p.name);
  return lines.join("\n");
}

const aiProposalSchema = z.object({
  proposal: z.string().min(80).max(6000),
  questions: z.array(z.string()).max(3).default([]),
  usedExperienceKeys: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
});

export async function generateAiProposal(ctx: ProposalContext, settings: AppSettings, lang: ProposalLanguage, style: ProposalStyle, rate: number | null) {
  const p = settings.profile;
  const experiences = p.experiences.map((e) => `- [${e.key}] ${e.name}: ${e.summary}`).join("\n");
  const skills = p.skills.map((s) => `${s.name} (${s.level})`).join(", ");
  const length = style === "brief" ? "90–140 words" : style === "detailed" ? "250–350 words" : "160–230 words";
  const system = `You draft freelance/job proposals for ${p.name}, a ${p.headline} with ${p.yearsExperience} years of experience.
Write in ${lang === "es" ? "Spanish (neutral LATAM)" : "English (clear, conversational professional)"}; length ${length}.
STRICT RULES:
- Use ONLY the experiences and skills listed below. Never invent projects, clients, metrics, certifications or years.
- Skills marked "complementary" must not be presented as a main specialization.
- Show understanding of the client's problem, explain concretely how he can help, ask 1–2 useful questions, propose a next step.
- Sound natural and senior. No hype, no impossible promises, no guaranteed timelines.
- If the post lacks information, ask instead of assuming.
${rate ? `- If mentioning rate, use exactly ${rate} ${settings.preferences.currency}/hour.` : "- Do not mention a rate."}
${UNTRUSTED_CONTENT_RULES}
Return JSON: {"proposal": string, "questions": string[], "usedExperienceKeys": string[], "warnings": string[]}.

PROFILE SKILLS: ${skills}
PROFILE EXPERIENCES:
${experiences}`;
  const user = `Opportunity on ${ctx.sourceKey}. Title: ${ctx.title}. Company: ${ctx.companyName ?? "unknown"}.
${untrustedBlock("job_post", ctx.description)}`;

  const { data, model, cached } = await completeJson({ opportunityId: ctx.opportunityId, purpose: "proposal", system, user, schema: aiProposalSchema, settings, maxTokens: 1400 });
  const validKeys = new Set(p.experiences.map((e) => e.key));
  const invalid = data.usedExperienceKeys.filter((k) => !validKeys.has(k));
  const warnings = [...data.warnings];
  if (invalid.length) warnings.push(`La IA citó experiencias no configuradas (${invalid.join(", ")}): revisa el texto.`);
  return { content: data.proposal, model, cached, warnings };
}
