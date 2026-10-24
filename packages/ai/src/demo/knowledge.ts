import type { QuestionDifficulty, QuestionType } from "@repo/shared";

/**
 * Small curated question library used by DEMO_MODE so generated interviews look
 * realistic without calling a model. Unknown skills fall back to generic,
 * domain-neutral templates.
 */
export interface DemoQuestionSeed {
  text: string;
  difficulty: QuestionDifficulty;
  type: QuestionType;
  expectedTopics: string[];
  idealAnswer: string;
  redFlags: string[];
  followUpGuidance: string;
}

const LIBRARY: Record<string, DemoQuestionSeed[]> = {
  java: [
    {
      text: "Can you walk me through the main differences between an interface and an abstract class in Java, and when you'd choose each?",
      difficulty: "EASY",
      type: "TECHNICAL",
      expectedTopics: [
        "multiple inheritance of type",
        "default methods",
        "state",
        "constructors",
        "is-a vs can-do",
      ],
      idealAnswer:
        "Interfaces define contracts and support multiple inheritance of type (with default/static methods since Java 8); abstract classes can hold state and constructors and share implementation. Choose an interface for capabilities, an abstract class for a common base with shared state.",
      redFlags: ["Claims interfaces can hold instance state", "Cannot name any practical use case"],
      followUpGuidance: "Ask for a concrete example from their own code.",
    },
    {
      text: "How do equals and hashCode work together in Java, and what goes wrong if you override only one of them?",
      difficulty: "MEDIUM",
      type: "TECHNICAL",
      expectedTopics: ["hash-based collections", "contract", "HashMap", "HashSet", "consistency"],
      idealAnswer:
        "Equal objects must have equal hash codes. Overriding only equals breaks HashMap/HashSet lookups because objects land in different buckets; both must be consistent and based on the same fields.",
      redFlags: ["Thinks hashCode must be unique"],
      followUpGuidance: "Probe how they would implement them for an entity class.",
    },
    {
      text: "Explain how you would make a piece of Java code thread-safe when several threads update a shared counter.",
      difficulty: "HARD",
      type: "TECHNICAL",
      expectedTopics: ["synchronized", "AtomicInteger", "race condition", "visibility", "locks"],
      idealAnswer:
        "Identify the race condition, then use AtomicInteger/LongAdder or synchronized blocks/locks; mention visibility (volatile/happens-before) and the trade-offs of contention.",
      redFlags: ["Suggests volatile alone fixes increments"],
      followUpGuidance: "Ask about trade-offs between synchronized and atomic classes.",
    },
  ],
  "spring-boot": [
    {
      text: "What is dependency injection in Spring, and why is it useful?",
      difficulty: "EASY",
      type: "TECHNICAL",
      expectedTopics: [
        "inversion of control",
        "IoC container",
        "beans",
        "loose coupling",
        "testability",
      ],
      idealAnswer:
        "Spring's IoC container creates beans and supplies their dependencies instead of classes constructing them, which reduces coupling and makes components easy to test and swap.",
      redFlags: ["Confuses DI with inheritance"],
      followUpGuidance: "Ask about injection styles: constructor, setter, field.",
    },
    {
      text: "What are the differences between constructor, setter and field injection, and which do you prefer?",
      difficulty: "MEDIUM",
      type: "TECHNICAL",
      expectedTopics: [
        "constructor injection",
        "immutability",
        "required dependencies",
        "testability",
        "field injection drawbacks",
      ],
      idealAnswer:
        "Constructor injection makes dependencies explicit and final, supports immutability and testing without a container; setter injection suits optional dependencies; field injection hides dependencies and complicates testing.",
      redFlags: ["Prefers field injection without acknowledging drawbacks"],
      followUpGuidance: "Ask why constructor injection improves testability and object validity.",
    },
    {
      text: "Explain what happens when an HTTP request reaches a Spring Boot REST controller, from the servlet container to the response.",
      difficulty: "HARD",
      type: "TECHNICAL",
      expectedTopics: [
        "DispatcherServlet",
        "handler mapping",
        "message converters",
        "filters",
        "exception handling",
      ],
      idealAnswer:
        "The embedded container hands the request through filters to the DispatcherServlet, which uses handler mappings to find the controller method, binds and converts arguments, invokes it and serialises the return value with HttpMessageConverters; exceptions go through @ControllerAdvice handlers.",
      redFlags: ["No mention of DispatcherServlet or serialisation"],
      followUpGuidance: "Probe how they'd add cross-cutting concerns like authentication.",
    },
  ],
  sql: [
    {
      text: "What's the difference between an INNER JOIN and a LEFT JOIN? Can you give an example of when you'd use each?",
      difficulty: "EASY",
      type: "TECHNICAL",
      expectedTopics: ["matching rows", "null for missing", "example query"],
      idealAnswer:
        "INNER JOIN returns only matching rows; LEFT JOIN returns all rows from the left table with NULLs where no match exists — e.g. customers with or without orders.",
      redFlags: ["Cannot describe NULL behaviour"],
      followUpGuidance: "Ask how they'd find customers with no orders.",
    },
    {
      text: "How would you investigate and fix a query that has become slow as a table grew?",
      difficulty: "MEDIUM",
      type: "TECHNICAL",
      expectedTopics: ["EXPLAIN plan", "indexes", "selectivity", "N+1", "pagination"],
      idealAnswer:
        "Reproduce and inspect the execution plan, look for sequential scans, add or adjust indexes on filtered/joined columns, avoid functions on indexed columns, paginate, and verify with measurements.",
      redFlags: ["Only suggests adding more hardware"],
      followUpGuidance: "Ask about the downsides of adding indexes.",
    },
    {
      text: "Explain transaction isolation levels and give an example of an anomaly each one prevents.",
      difficulty: "HARD",
      type: "TECHNICAL",
      expectedTopics: [
        "read committed",
        "repeatable read",
        "serializable",
        "dirty read",
        "phantom read",
      ],
      idealAnswer:
        "Read uncommitted allows dirty reads; read committed prevents them; repeatable read prevents non-repeatable reads; serializable prevents phantoms and write skew at a performance cost.",
      redFlags: ["Confuses isolation with durability"],
      followUpGuidance: "Ask which level their database uses by default.",
    },
  ],
  "rest-api": [
    {
      text: "Which HTTP methods have you commonly used in REST APIs, and what would you typically use each one for?",
      difficulty: "EASY",
      type: "TECHNICAL",
      expectedTopics: ["GET", "POST", "PUT", "PATCH", "DELETE", "idempotency"],
      idealAnswer:
        "GET reads, POST creates, PUT replaces, PATCH partially updates, DELETE removes; GET/PUT/DELETE are idempotent while POST is not.",
      redFlags: ["Uses GET for state changes"],
      followUpGuidance: "Ask what idempotency means and why it matters.",
    },
    {
      text: "How do you design error responses and status codes for a REST API?",
      difficulty: "MEDIUM",
      type: "TECHNICAL",
      expectedTopics: ["4xx vs 5xx", "consistent error body", "validation errors", "404", "409"],
      idealAnswer:
        "Use accurate status codes (400/422 validation, 401/403 auth, 404, 409 conflicts, 5xx server faults) with a consistent machine-readable error body and no internal details leaked.",
      redFlags: ["Returns 200 for errors"],
      followUpGuidance: "Probe how they'd version the API.",
    },
    {
      text: "How would you secure a REST API, and what's the difference between authentication and authorization?",
      difficulty: "HARD",
      type: "TECHNICAL",
      expectedTopics: [
        "authentication vs authorization",
        "JWT or sessions",
        "HTTPS",
        "roles",
        "rate limiting",
      ],
      idealAnswer:
        "Authentication verifies identity (sessions, OAuth2/JWT); authorization decides what that identity may do (roles, scopes, ownership checks). Add HTTPS, input validation, rate limiting and least privilege.",
      redFlags: ["Treats authentication and authorization as the same thing"],
      followUpGuidance: "Ask how they'd implement it in Spring Security.",
    },
  ],
  git: [
    {
      text: "Describe the Git workflow you've used on a team, from creating a branch to getting your change merged.",
      difficulty: "EASY",
      type: "EXPERIENCE",
      expectedTopics: ["feature branches", "pull requests", "code review", "rebase or merge", "CI"],
      idealAnswer:
        "Create a feature branch, commit in small steps, push and open a pull request, address review feedback, keep the branch current, and merge after CI passes.",
      redFlags: ["Commits directly to main without review"],
      followUpGuidance: "Ask how they resolve merge conflicts.",
    },
    {
      text: "What's the difference between git merge and git rebase, and when would you avoid rebasing?",
      difficulty: "MEDIUM",
      type: "TECHNICAL",
      expectedTopics: ["history rewriting", "linear history", "shared branches", "merge commit"],
      idealAnswer:
        "Merge preserves history with a merge commit; rebase replays commits for a linear history but rewrites it, so avoid rebasing branches others share.",
      redFlags: ["Unaware rebase rewrites history"],
      followUpGuidance: "Ask how they'd recover from a bad rebase.",
    },
  ],
  docker: [
    {
      text: "What problem do containers solve, and how have you used Docker in your projects?",
      difficulty: "EASY",
      type: "EXPERIENCE",
      expectedTopics: ["consistent environments", "images vs containers", "Dockerfile", "compose"],
      idealAnswer:
        "Containers package an application with its dependencies for consistent environments; images are built from Dockerfiles and run as containers, often orchestrated locally with Compose.",
      redFlags: ["Confuses containers with virtual machines entirely"],
      followUpGuidance: "Ask them to describe a Dockerfile they wrote.",
    },
  ],
};

const ALIASES: Record<string, string> = {
  spring: "spring-boot",
  "spring-framework": "spring-boot",
  "rest-apis": "rest-api",
  rest: "rest-api",
  apis: "rest-api",
  postgresql: "sql",
  mysql: "sql",
};

export function demoSkillKey(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return ALIASES[slug] ?? slug;
}

export function libraryFor(skillName: string): DemoQuestionSeed[] | undefined {
  return LIBRARY[demoSkillKey(skillName)];
}

export function genericSeeds(skillName: string): DemoQuestionSeed[] {
  return [
    {
      text: `Could you describe a recent project or situation where you used ${skillName}? What was your role?`,
      difficulty: "EASY",
      type: "EXPERIENCE",
      expectedTopics: ["context", "personal contribution", "tools used", "outcome"],
      idealAnswer: `A specific example showing hands-on use of ${skillName}, the candidate's own contribution, and the result.`,
      redFlags: ["Only vague or second-hand involvement"],
      followUpGuidance: "Ask what they personally did and what they would do differently.",
    },
    {
      text: `What are the most important best practices you follow when working with ${skillName}, and why?`,
      difficulty: "MEDIUM",
      type: "TECHNICAL",
      expectedTopics: ["best practices", "trade-offs", "quality", "examples"],
      idealAnswer: `Concrete best practices for ${skillName} with reasons and trade-offs, illustrated with examples.`,
      redFlags: ["Generic statements without examples"],
      followUpGuidance: "Ask for an example where a best practice was hard to apply.",
    },
    {
      text: `Tell me about a difficult problem you solved involving ${skillName}. How did you approach it?`,
      difficulty: "HARD",
      type: "PROBLEM_SOLVING",
      expectedTopics: [
        "problem definition",
        "approach",
        "alternatives considered",
        "result",
        "learning",
      ],
      idealAnswer:
        "A structured account: the problem, the analysis, options considered, the chosen solution, and the measurable outcome.",
      redFlags: ["Cannot explain their reasoning"],
      followUpGuidance: "Ask what alternatives they considered.",
    },
  ];
}

export const BEHAVIORAL_SEEDS: DemoQuestionSeed[] = [
  {
    text: "Tell me about a time you had a disagreement with a teammate. How did you handle it?",
    difficulty: "MEDIUM",
    type: "BEHAVIORAL",
    expectedTopics: ["situation", "own actions", "communication", "outcome", "reflection"],
    idealAnswer:
      "A STAR-structured example showing respectful communication, personal ownership, a constructive resolution and reflection.",
    redFlags: ["Blames others entirely", "No resolution"],
    followUpGuidance: "Ask what they personally did and what the outcome was.",
  },
  {
    text: "Tell me about a time you had to solve a difficult technical problem under time pressure.",
    difficulty: "MEDIUM",
    type: "BEHAVIORAL",
    expectedTopics: ["situation", "task", "actions", "result", "prioritisation"],
    idealAnswer:
      "A concrete STAR example with clear personal actions, prioritisation and a measurable result.",
    redFlags: ["Vague, no personal actions"],
    followUpGuidance: "Ask what made it difficult and what the outcome was.",
  },
];

export const INTRO_SEED: DemoQuestionSeed = {
  text: "To start, could you briefly introduce yourself and tell me about your recent experience that's most relevant to this role?",
  difficulty: "EASY",
  type: "INTRODUCTION",
  expectedTopics: ["background", "relevant experience", "technologies", "motivation"],
  idealAnswer: "A concise overview of relevant background, recent experience and key technologies.",
  redFlags: [],
  followUpGuidance: "Pick a project they mention and ask about their role in it.",
};

export const CLOSING_SEED: DemoQuestionSeed = {
  text: "Is there anything else you'd like to add about your experience, or any questions for the hiring team?",
  difficulty: "EASY",
  type: "CLOSING",
  expectedTopics: [],
  idealAnswer: "",
  redFlags: [],
  followUpGuidance: "",
};
