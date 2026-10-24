import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

loadEnv({
  path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../.env"),
  quiet: true,
});

/**
 * Development seed (spec §100): Nova Technologies, a Junior Java Developer job,
 * a published AI-generated interview, three candidates — two of whom complete a
 * full interview through the real engine and evaluation pipeline (demo AI).
 *
 * Usage: pnpm db:seed            (refuses to run twice; use pnpm db:reset to start over)
 * Login password for seeded users: SEED_USER_PASSWORD in .env (see .env.example).
 */
async function main(): Promise<void> {
  const { hashPassword } = await import("better-auth/crypto");
  const { DemoInterviewAI } = await import("@repo/ai");
  const { asJson, db, disconnectDb } = await import("@repo/database");
  const { generateSecureToken, hashToken } = await import("@repo/shared/server");
  const { getStorage } = await import("@repo/storage");
  const core = await import("../index");
  const { scriptedAnswer, STRONG_CANDIDATE, AVERAGE_CANDIDATE } = await import("./answers");
  const { seedSalesDemo } = await import("./sales");

  core.setInterviewAIForTesting(new DemoInterviewAI());
  const password = process.env.SEED_USER_PASSWORD;
  if (!password || password.length < 10)
    throw new Error("Set SEED_USER_PASSWORD (10+ characters) in .env before seeding.");

  // ── Users ──
  const passwordHash = await hashPassword(password);
  async function createUser(
    email: string,
    name: string,
    platformRole: "USER" | "SUPER_ADMIN" = "USER",
  ) {
    const existing = await db.user.findUnique({ where: { email } });
    if (existing) return existing;
    const id = core.createId("u");
    const user = await db.user.create({
      data: { id, email, name, emailVerified: true, platformRole },
    });
    await db.authAccount.create({
      data: {
        id: core.createId("acc"),
        accountId: id,
        providerId: "credential",
        userId: id,
        password: passwordHash,
      },
    });
    return user;
  }

  /** AI Sales Agent: sales team + demo pipeline (idempotent; safe on an existing seed). */
  async function seedSales(companyId: string, invitedById: string) {
    const manager = await createUser("sales@nova.test", "Samir Sales");
    const rep = await createUser("rep@nova.test", "Rita Rep");
    for (const [user, role] of [
      [manager, "SALES_MANAGER"],
      [rep, "SALES_REP"],
    ] as const) {
      await db.companyMember.upsert({
        where: { companyId_userId: { companyId, userId: user.id } },
        update: {},
        create: { companyId, userId: user.id, role, invitedById },
      });
      await db.user.update({ where: { id: user.id }, data: { activeCompanyId: companyId } });
    }
    return seedSalesDemo(companyId, {
      userId: manager.id,
      userName: manager.name,
      companyId,
      role: "SALES_MANAGER",
      platformRole: "USER",
    });
  }

  const existingNova = await db.company.findFirst({ where: { slug: "nova-technologies" } });
  if (existingNova) {
    const adminMember = await db.companyMember.findFirst({
      where: { companyId: existingNova.id, role: "COMPANY_ADMIN" },
    });
    const sales = await seedSales(existingNova.id, adminMember?.userId ?? existingNova.id);
    console.log(
      sales.skipped
        ? "Seed data already present (Nova Technologies). Run `pnpm db:reset` to recreate it."
        : `Added the AI Sales Agent demo to the existing Nova Technologies workspace (${sales.created} leads).\n   Sales users: sales@nova.test · rep@nova.test (password: SEED_USER_PASSWORD)`,
    );
    await disconnectDb();
    return;
  }

  const admin = await createUser("admin@nova.test", "Nora Admin");
  const recruiter = await createUser("recruiter@nova.test", "Rachel Recruiter");
  const reviewer = await createUser("reviewer@nova.test", "Rob Reviewer");
  await createUser("superadmin@platform.test", "Platform Admin", "SUPER_ADMIN");

  // ── Company & team ──
  const company = await core.createCompany(
    { id: admin.id, name: admin.name },
    {
      name: "Nova Technologies",
      website: "https://nova.example",
      industry: "Software",
      size: "SIZE_51_200",
      country: "Jordan",
      timezone: "Asia/Amman",
    },
  );
  const plan = await db.plan.upsert({
    where: { key: "professional" },
    update: {},
    create: {
      key: "professional",
      name: "Professional",
      monthlyInterviewLimit: 1000,
      monthlyAiBudgetUsd: 1500,
      seats: 25,
      priceMonthlyCents: 49_900,
    },
  });
  await db.company.update({
    where: { id: company.id },
    data: {
      planId: plan.id,
      welcomeText:
        "Thanks for your interest in joining Nova Technologies! This short interview helps us get to know you.",
    },
  });
  await db.companyMember.createMany({
    data: [
      { companyId: company.id, userId: recruiter.id, role: "RECRUITER", invitedById: admin.id },
      { companyId: company.id, userId: reviewer.id, role: "REVIEWER", invitedById: admin.id },
    ],
  });
  await db.user.updateMany({
    where: { id: { in: [recruiter.id, reviewer.id] } },
    data: { activeCompanyId: company.id },
  });
  // Nova subscribes to the AI Interviewer (paid, active).
  await core.ensureProductPlans();
  await db.productSubscription.create({
    data: {
      companyId: company.id,
      productKey: "interviewer",
      planId: plan.id,
      status: "ACTIVE",
      currentPeriodStart: new Date(),
    },
  });

  const actor = {
    userId: recruiter.id,
    userName: recruiter.name,
    companyId: company.id,
    role: "RECRUITER" as const,
    platformRole: "USER" as const,
  };

  // ── Job ──
  const job = await core.createJob(actor, {
    title: "Junior Java Developer",
    department: "Engineering",
    location: "Amman, Jordan",
    employmentType: "FULL_TIME",
    workMode: "HYBRID",
    experienceLevel: "JUNIOR",
    minExperienceYears: 0,
    maxExperienceYears: 2,
    description:
      "Join our platform team building Spring Boot services that power logistics for thousands of businesses.",
    responsibilities:
      "Build and maintain REST APIs with Spring Boot\nWrite unit and integration tests\nParticipate in code review",
    requirements: "Java fundamentals, Spring Boot, REST APIs, SQL and Git.",
    preferredQualifications: "Docker, cloud experience.",
    status: "ACTIVE",
    skills: [
      { name: "Java", weight: 30, expectedLevel: "INTERMEDIATE", isCritical: true },
      { name: "Spring Boot", weight: 30, expectedLevel: "INTERMEDIATE", isCritical: true },
      { name: "REST API", weight: 15, expectedLevel: "INTERMEDIATE" },
      { name: "SQL", weight: 15, expectedLevel: "BEGINNER" },
      { name: "Git", weight: 10, expectedLevel: "BEGINNER" },
    ],
  });

  // ── Interview (generated with the demo AI, then published) ──
  const document = await core.generateTemplateDraft(actor, {
    jobId: job.id,
    durationMinutes: 30,
    interviewType: "TECHNICAL",
  });
  document.name = "Junior Java Developer — AI Technical Screening";
  const template = await core.createTemplate(actor, job.id, document, { generatedByAi: true });
  await core.publishTemplate(actor, template.id);

  // ── Candidates & interviews ──
  async function invite(firstName: string, lastName: string, email: string) {
    const result = await core.createInvitation(actor, {
      templateId: template.id,
      candidate: { firstName, lastName, email },
      sendEmail: false,
      expiresInDays: 14,
    });
    return { ...result, token: result.url.split("/i/")[1]! };
  }

  async function runInterview(token: string, answers: typeof STRONG_CANDIDATE, minutesAgo: number) {
    const begun = await core.beginCandidateSession(
      token,
      { confirmedName: "Candidate", consents: { terms: true, privacy: true, aiInterview: true } },
      {},
    );
    let loaded = await core.authenticateCandidateSession(begun.sessionId, begun.credential);
    let view = await core.startCandidateSession(loaded);
    for (let turn = 0; turn < 40 && !view.completed; turn += 1) {
      const last = view.messages.at(-1)!;
      const action = (
        await db.interviewMessage.findUnique({ where: { id: last.id }, select: { action: true } })
      )?.action;
      const content =
        turn === 0
          ? "Yes, I can hear you clearly and I'm ready."
          : scriptedAnswer(answers, last.content, action === "ASK_FOLLOW_UP");
      loaded = await core.authenticateCandidateSession(begun.sessionId, begun.credential);
      const res = await core.submitCandidateMessage(loaded, {
        clientMessageId: core.createId("m"),
        content,
        source: turn % 3 === 0 ? "TEXT" : "VOICE",
      });
      view = res.view;
    }
    // Spread timestamps over a realistic interview length for the transcript view.
    const messages = await db.interviewMessage.findMany({
      where: { sessionId: begun.sessionId },
      orderBy: { sequenceNumber: "asc" },
    });
    const end = new Date(Date.now() - minutesAgo * 60_000);
    const start = new Date(end.getTime() - 24 * 60_000);
    for (const [i, m] of messages.entries()) {
      await db.interviewMessage.update({
        where: { id: m.id },
        data: {
          createdAt: new Date(
            start.getTime() +
              (i / Math.max(1, messages.length - 1)) * (end.getTime() - start.getTime()),
          ),
        },
      });
    }
    await db.interviewSession.update({
      where: { id: begun.sessionId },
      data: { startedAt: start, endedAt: end, createdAt: start },
    });
    await core.runFinalEvaluation(begun.sessionId);
    return begun.sessionId;
  }

  const omar = await invite("Omar", "Test", "omar@example.com");
  const sarah = await invite("Sarah", "Chen", "sarah.chen@example.com");
  const john = await invite("John", "Miller", "john.miller@example.com");

  // A parsed resume for Sarah (stored file + structured data) enables resume-aware questions and alignment.
  const pdf = new TextEncoder().encode(
    "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF",
  );
  const resumeKey = `companies/${company.id}/resumes/seed-sarah-chen.pdf`;
  await getStorage().put({ key: resumeKey, body: pdf, contentType: "application/pdf" });
  await db.candidateResume.create({
    data: {
      candidateId: sarah.candidate.id,
      storageKey: resumeKey,
      originalFilename: "Sarah_Chen_Resume.pdf",
      mimeType: "application/pdf",
      sizeBytes: pdf.byteLength,
      parseStatus: "COMPLETED",
      parsedAt: new Date(),
      promptVersion: "resume_parser_v1",
      parsedData: asJson({
        name: "Sarah Chen",
        email: "sarah.chen@example.com",
        phone: null,
        location: "Amman, Jordan",
        headline: "Backend developer — Java & Spring Boot",
        totalYearsExperience: 3,
        education: [
          {
            institution: "University of Jordan",
            degree: "BSc",
            field: "Computer Science",
            startDate: "2017",
            endDate: "2021",
          },
        ],
        experience: [
          {
            company: "ShipFast Logistics",
            title: "Backend Developer",
            startDate: "2022",
            endDate: "Present",
            description: "Built the order tracking REST API with Spring Boot and PostgreSQL.",
            technologies: ["Java", "Spring Boot", "PostgreSQL", "Docker"],
          },
        ],
        skills: ["Java", "Spring Boot", "SQL", "REST API", "Git", "Docker"],
        projects: [
          {
            name: "Order Tracking API",
            description: "Spring Boot service tracking shipments in real time",
            technologies: ["Spring Boot", "PostgreSQL"],
          },
        ],
        certifications: ["Oracle Certified Associate, Java SE"],
        languages: ["Arabic", "English"],
      }),
    },
  });

  const sarahSession = await runInterview(sarah.token, STRONG_CANDIDATE, 60 * 26);
  const johnSession = await runInterview(john.token, AVERAGE_CANDIDATE, 60 * 5);
  await core.addRecruiterNote(actor, sarah.candidate.id, {
    content: "Strong Spring fundamentals. Suggest a technical deep-dive with the platform team.",
    sessionId: sarahSession,
  });

  // ── AI Sales Agent ──
  const sales = await seedSales(company.id, admin.id);

  // Keep seeded invitation links usable: rotate Omar's token and print it.
  const omarToken = generateSecureToken();
  await db.interviewInvitation.update({
    where: { id: omar.invitation.id },
    data: { tokenHash: hashToken(omarToken) },
  });

  const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  console.log("\n✅ Seed complete");
  console.log("   Company:      Nova Technologies");
  console.log(
    "   Job:          Junior Java Developer (published 30-minute AI technical screening)",
  );
  console.log(
    "   Users:        admin@nova.test · recruiter@nova.test · reviewer@nova.test · superadmin@platform.test",
  );
  console.log(
    `   Sales Agent:  sales@nova.test (manager) · rep@nova.test (rep) — ${sales.created} demo leads`,
  );
  console.log("   Password:     value of SEED_USER_PASSWORD in your .env");
  console.log(`   Completed:    Sarah Chen → ${appUrl}/interviews/${sarahSession}`);
  console.log(`                 John Miller → ${appUrl}/interviews/${johnSession}`);
  console.log(`   Invite link for Omar Test (not started): ${appUrl}/i/${omarToken}\n`);
  await disconnectDb();
}

main().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
