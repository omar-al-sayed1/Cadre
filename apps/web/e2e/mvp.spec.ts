import { randomBytes } from "node:crypto";
import { expect, test, type Browser, type Page } from "@playwright/test";

/**
 * MVP success test (spec §153): a recruiter registers, creates Nova Technologies
 * and a Junior Java Developer job, generates and publishes a 20-minute AI
 * interview, invites Omar Test, Omar completes the interview by text, and the
 * recruiter reviews the report and compares him with a second candidate.
 */

const STRONG: Array<[RegExp, string]> = [
  [
    /introduce yourself|relevant experience/i,
    "I'm Omar. I've used Java for about two years, mostly building Spring Boot REST services for an inventory system, with PostgreSQL and Git.",
  ],
  [
    /interface and an abstract class/i,
    "An interface defines a contract and a class can implement many of them; an abstract class can hold state and constructors but only one can be extended. I use interfaces for capabilities and abstract classes for shared base behaviour.",
  ],
  [
    /equals and hashCode/i,
    "Equal objects must have equal hash codes. HashMap uses hashCode to find the bucket and equals to compare keys, so overriding only equals breaks lookups.",
  ],
  [
    /thread-safe|shared counter/i,
    "Increment is a read-modify-write race, so I'd use an AtomicInteger or LongAdder, or synchronize the method if several fields change together.",
  ],
  [
    /dependency injection/i,
    "The Spring container creates beans and injects their dependencies, which reduces coupling and makes testing with mocks easy.",
  ],
  [
    /constructor, setter and field injection/i,
    "Constructor injection makes dependencies explicit and final, so it's my default; setter injection suits optional dependencies; field injection hides them and is harder to test.",
  ],
  [
    /HTTP request reaches|REST controller/i,
    "Tomcat receives it, the servlet filter chain runs, the DispatcherServlet picks the handler, message converters deserialize JSON, the controller runs and Jackson serializes the response.",
  ],
  [
    /HTTP methods/i,
    "GET to read, POST to create, PUT to replace, PATCH for partial updates and DELETE to remove; GET, PUT and DELETE are idempotent.",
  ],
  [
    /error responses|status codes/i,
    "400 for validation errors with field details, 401 and 403 for auth, 404 when missing, 409 for conflicts and 500 for unexpected errors, with one JSON error format from a ControllerAdvice.",
  ],
  [
    /secure a REST API|authentication and authorization/i,
    "Authentication proves who the caller is, for example with JWT bearer tokens; authorization decides what they may do, like role checks in Spring Security. Always HTTPS and validated input.",
  ],
  [
    /INNER JOIN|LEFT JOIN/i,
    "INNER JOIN returns only matching rows; LEFT JOIN keeps every left row with nulls when nothing matches, for example customers with no orders.",
  ],
  [
    /slow|investigate and fix/i,
    "I'd read the plan with EXPLAIN ANALYZE, look for sequential scans, add a suitable index, fix N+1 queries and select only the needed columns.",
  ],
  [
    /isolation levels/i,
    "Read committed prevents dirty reads, repeatable read prevents non-repeatable reads and serializable prevents phantom reads.",
  ],
  [
    /Git workflow/i,
    "Feature branches from main, small commits, a pull request with review and CI before squash-merging.",
  ],
  [
    /merge and git rebase|rebase/i,
    "Merge keeps history with a merge commit; rebase replays commits for a linear history, and I never rebase shared branches.",
  ],
  [
    /disagreement/i,
    "A teammate wanted to cache stock levels for an hour; I worried about stale data, so I wrote a test showing stale reads, we agreed on five minutes with invalidation, and load dropped 40 percent.",
  ],
  [
    /difficult technical problem|time pressure/i,
    "Before a release our order API timed out. I profiled it, found an N+1 query, added a fetch join and an index, and latency fell from 3 seconds to 200 milliseconds so we shipped on time.",
  ],
  [
    /anything else|questions for the hiring team/i,
    "Thank you, I'd like to know how code reviews and onboarding work for juniors.",
  ],
];
const STRONG_FOLLOW_UP =
  "For example, in the inventory service I validated input, returned clear error responses and covered the endpoint with integration tests using Testcontainers.";

const WEAK: Array<[RegExp, string]> = [
  [
    /introduce yourself|relevant experience/i,
    "Hi, I finished a bootcamp last year and did some small Java projects.",
  ],
  [/anything else|questions for the hiring team/i, "No, thank you."],
];
const WEAK_DEFAULT = "I'm not sure, sorry.";

function answerFor(question: string, script: Array<[RegExp, string]>, fallback: string): string {
  return script.find(([pattern]) => pattern.test(question))?.[1] ?? fallback;
}

async function createJobAndInterview(page: Page) {
  // Register (email verification is disabled for the E2E server).
  const email = `e2e-${Date.now()}@nova.test`;
  await page.goto("/register");
  await page.getByLabel("Full name").fill("Rachel Recruiter");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill(`E2e-${randomBytes(9).toString("base64url")}1`);
  await page.getByRole("button", { name: "Create account" }).click();

  // Onboarding: company.
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByLabel("Company name").fill("Nova Technologies");
  await page.getByRole("button", { name: "Create company" }).click();

  // Hire the AI Interviewer: start its free trial from the onboarding product choice.
  const interviewerCard = page
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name: "AI Interviewer" }) });
  await interviewerCard.getByRole("button", { name: /free trial/i }).click();
  await expect(page.getByRole("list", { name: "AI Interviewer setup" })).toBeVisible();

  // Job with the five MVP skills.
  await page.getByRole("link", { name: "Start", exact: true }).click();
  await expect(page).toHaveURL(/\/jobs\/new$/);
  await page.getByLabel("Job title").fill("Junior Java Developer");
  const skills = ["Java", "Spring Boot", "REST API", "SQL", "Git"];
  for (let i = 1; i < skills.length; i += 1)
    await page.getByRole("button", { name: "Add skill" }).click();
  for (const [i, skill] of skills.entries())
    await page.getByLabel(`Skill ${i + 1} name`).fill(skill);
  await page.getByRole("button", { name: "Balance weights" }).click();
  await expect(page.getByText("Total: 100%")).toBeVisible();
  await page.getByRole("button", { name: "Create job" }).click();
  await expect(page).toHaveURL(/\/jobs\/[a-z0-9]+$/);

  // AI-generated 20-minute interview, reviewed and published.
  await page.getByRole("link", { name: "Generate interview with AI" }).click();
  await page.getByLabel("Duration (minutes)").fill("20");
  await page.getByRole("button", { name: "Generate interview" }).click();
  await page.getByRole("button", { name: "Review & publish" }).click();
  await page.getByRole("button", { name: "Publish interview" }).click();
  await expect(page.getByRole("dialog", { name: "Invite a candidate" })).toBeVisible();
}

async function inviteCandidate(
  page: Page,
  firstName: string,
  lastName: string,
  email: string,
): Promise<string> {
  const dialog = page.getByRole("dialog", { name: "Invite a candidate" });
  if (!(await dialog.isVisible()))
    await page.getByRole("button", { name: "Invite candidate" }).first().click();
  await dialog.getByLabel("First name").fill(firstName);
  await dialog.getByLabel("Last name").fill(lastName);
  await dialog.getByRole("textbox", { name: "Email", exact: true }).fill(email);
  // Create a copyable link instead of emailing (switch state persists between invites).
  const emailSwitch = dialog.getByRole("switch", { name: "Email the invitation" });
  if ((await emailSwitch.getAttribute("aria-checked")) === "true") await emailSwitch.click();
  await expect(emailSwitch).toHaveAttribute("aria-checked", "false");
  await dialog.getByRole("button", { name: "Create link" }).click();
  const link = await dialog.getByLabel("Interview link").inputValue();
  expect(link).toMatch(/\/i\/[A-Za-z0-9_-]{40,}$/);
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(dialog).toBeHidden();
  return new URL(link).pathname;
}

async function takeInterview(
  browser: Browser,
  path: string,
  script: Array<[RegExp, string]>,
  fallback: string,
  options: { camera?: boolean } = {},
) {
  // A fresh context: the candidate shares nothing with the recruiter's session.
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(path);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("welcome to your interview");
  await page.getByRole("link", { name: "Continue" }).click();

  await page
    .getByRole("checkbox", { name: /I understand this interview is conducted by an AI/ })
    .check();
  await page.getByRole("checkbox", { name: /I accept the/ }).check();
  await page.getByRole("checkbox", { name: /I have read the/ }).check();
  if (options.camera) await page.getByRole("checkbox", { name: /turn on my camera/i }).check();
  await page.getByRole("button", { name: "Agree and continue" }).click();

  await page.getByRole("link", { name: "Continue with text" }).click();
  await page.getByRole("button", { name: "Begin interview" }).click();

  // Optional self-view: the tile appears for candidates who opted in (no camera in CI is fine).
  if (options.camera)
    await expect(page.getByRole("button", { name: /Turn camera (off|on)/ })).toBeVisible();

  const message = page.getByTestId("interviewer-message");
  const answerBox = page.getByLabel("Your answer");
  await expect(message).toContainText("ready to start");
  let previous = "";
  for (let turn = 0; turn < 45; turn += 1) {
    if (page.url().endsWith("/complete")) break;
    const question = (await message.textContent()) ?? "";
    if (/concludes the interview/i.test(question)) break;
    const isPrimary = script.some(([pattern]) => pattern.test(question));
    const answer =
      turn === 0
        ? "Yes, I can hear you and I'm ready."
        : isPrimary || question === previous
          ? answerFor(question, script, fallback)
          : script === STRONG
            ? STRONG_FOLLOW_UP
            : fallback;
    previous = question;
    await answerBox.fill(answer);
    await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes("/message") && r.request().method() === "POST" && r.ok(),
      ),
      page.getByRole("button", { name: "Send answer" }).click(),
    ]);
    await expect(message).not.toHaveText(question);
  }
  await expect(page).toHaveURL(/\/complete$/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: /your interview is complete/i })).toBeVisible();
  await context.close();
}

test("MVP: create job → AI interview → candidate completes → report → compare", async ({
  page,
  browser,
}) => {
  await createJobAndInterview(page);

  // Offer candidates the optional camera preview (privacy settings), then return to the job.
  const jobUrl = page.url();
  await page.goto("/settings/privacy");
  await page.getByLabel("Optional camera preview").click();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText(/saved/i).first()).toBeVisible();
  await page.goto(jobUrl);

  const omarPath = await inviteCandidate(page, "Omar", "Test", "omar@example.com");
  const linaPath = await inviteCandidate(page, "Lina", "Haddad", "lina@example.com");

  await takeInterview(browser, omarPath, STRONG, STRONG_FOLLOW_UP, { camera: true });
  await takeInterview(browser, linaPath, WEAK, WEAK_DEFAULT);

  // The evaluation runs in the background queue; wait for both scores.
  await expect(async () => {
    await page.goto("/interviews");
    await expect(page.getByRole("row", { name: /Omar Test.*Completed.*\d+/ })).toBeVisible({
      timeout: 2_000,
    });
    await expect(page.getByRole("row", { name: /Lina Haddad.*Completed.*\d+/ })).toBeVisible({
      timeout: 2_000,
    });
  }).toPass({ timeout: 90_000, intervals: [2_000] });

  // Report: evidence-based evaluation with a human-review disclaimer.
  await page.getByRole("link", { name: "Omar Test" }).click();
  await expect(page.getByText("Overall score")).toBeVisible();
  await expect(page.getByText("Skill scores")).toBeVisible();
  for (const skill of ["Java", "Spring Boot", "REST API", "SQL", "Git"])
    await expect(page.getByRole("meter", { name: `${skill} score` })).toBeVisible();
  await expect(page.getByText(/AI-generated evaluation/).first()).toBeVisible();

  // Comparison ranks the stronger interview first.
  await page.goto("/compare");
  const rows = page.getByRole("row").filter({ hasText: /Omar Test|Lina Haddad/ });
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText("Omar Test");
});
