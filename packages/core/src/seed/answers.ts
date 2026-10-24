/**
 * Scripted candidate answers for seed interviews. Matched by keywords in the
 * interviewer's question so they work with any generated question order.
 */
export interface ScriptedAnswerSet {
  rules: Array<{ match: RegExp; answer: string }>;
  followUp: string;
  fallback: string;
}

export const STRONG_CANDIDATE: ScriptedAnswerSet = {
  rules: [
    {
      match: /introduce yourself|background|relevant experience/i,
      answer:
        "I'm Sarah. I've used Java professionally for about three years, mostly building Spring Boot REST services for a logistics company. I built an order tracking API with PostgreSQL, wrote integration tests with Testcontainers, and used Git with pull requests and code review every day.",
    },
    {
      match: /interface and an abstract class/i,
      answer:
        "An interface defines a contract and supports multiple inheritance of type; since Java 8 it can have default and static methods but no instance state. An abstract class can hold state, have constructors and share implementation code, but a class can only extend one. I use interfaces for capabilities like a PaymentGateway, and abstract classes for a common base with shared state.",
    },
    {
      match: /equals and hashCode/i,
      answer:
        "Equal objects must have the same hashCode — that's the contract. Hash-based collections like HashMap and HashSet use hashCode to pick the bucket and then equals to compare. If you override only equals, two equal objects land in different buckets and lookups fail. Both should use the same fields, ideally immutable ones.",
    },
    {
      match: /thread-safe|shared counter/i,
      answer:
        "There's a race condition because increment is a read-modify-write. I'd use an AtomicInteger or LongAdder under contention, or a synchronized block or a lock if the update spans several fields. AtomicInteger uses compare-and-set so it avoids blocking; synchronized also gives visibility through the happens-before relationship.",
    },
    {
      match: /dependency injection/i,
      answer:
        "Dependency injection means the Spring IoC container creates beans and supplies their dependencies instead of classes constructing them. That's inversion of control: it gives loose coupling, makes configuration central, and improves testability because I can pass mocks into constructors in unit tests.",
    },
    {
      match: /constructor, setter and field injection/i,
      answer:
        "Constructor injection makes required dependencies explicit and lets fields be final, so objects are always valid and immutable, and they're easy to unit test without a container. Setter injection suits optional dependencies. Field injection hides dependencies and makes testing harder, so I avoid it — I prefer constructor injection, often with Lombok's RequiredArgsConstructor.",
    },
    {
      match: /HTTP request reaches|REST controller/i,
      answer:
        "The embedded Tomcat passes the request through the servlet filter chain, including security filters, to the DispatcherServlet. Handler mappings find the controller method, argument resolvers bind path variables and the body via HttpMessageConverters, the method runs, and the return value is serialized to JSON. Exceptions go to @ControllerAdvice handlers.",
    },
    {
      match: /HTTP methods/i,
      answer:
        "GET to read resources, POST to create, PUT to replace a resource, PATCH for partial updates and DELETE to remove. GET, PUT and DELETE are idempotent while POST isn't, which matters for retries, so for payments we used idempotency keys on POST.",
    },
    {
      match: /error responses|status codes/i,
      answer:
        "I use accurate status codes: 400 or 422 for validation errors with field details, 401 and 403 for auth, 404 for missing resources, 409 for conflicts, and 5xx only for server faults. The error body is consistent and machine-readable, and never leaks stack traces.",
    },
    {
      match: /secure a REST API|authentication and authorization/i,
      answer:
        "Authentication verifies who the caller is, for example with OAuth2 and JWT bearer tokens; authorization decides what they can do, with roles, scopes and ownership checks. In Spring Security I configure a SecurityFilterChain, validate JWTs, use method-level @PreAuthorize, and add HTTPS, input validation and rate limiting.",
    },
    {
      match: /INNER JOIN|LEFT JOIN/i,
      answer:
        "An INNER JOIN returns only matching rows from both tables. A LEFT JOIN returns all rows from the left table, with NULL for the right side where there's no match — for example listing all customers including those without orders, then filtering WHERE order_id IS NULL to find customers with no orders.",
    },
    {
      match: /query.*slow|slow.*query|investigate and fix/i,
      answer:
        "I'd reproduce it and read the execution plan with EXPLAIN ANALYZE, look for sequential scans on large tables, and add or adjust indexes on filtered and joined columns while checking selectivity. I'd also look for N+1 queries from the ORM and add pagination, then measure again.",
    },
    {
      match: /isolation levels/i,
      answer:
        "Read committed prevents dirty reads, repeatable read prevents non-repeatable reads, and serializable prevents phantom reads and write skew at a performance cost. PostgreSQL defaults to read committed, so for a balance transfer I'd use row locks or serializable with retries.",
    },
    {
      match: /Git workflow/i,
      answer:
        "We used feature branches from main, small commits, then a pull request with at least one reviewer and CI running tests and linting. I rebase on main to keep history clean, resolve conflicts locally, and squash-merge after approval.",
    },
    {
      match: /merge and git rebase|rebase/i,
      answer:
        "Merge preserves history and adds a merge commit; rebase replays my commits on top for a linear history but rewrites them. I never rebase a shared branch that others have pulled; I only rebase my own feature branch before merging.",
    },
    {
      match: /disagreement/i,
      answer:
        "On my last team, a colleague wanted to cache an API response for an hour, and I was worried about stale stock levels. My task was to agree on a design before the release. I set up a short call, we listed the data freshness requirements, and I proposed a five-minute cache with event-based invalidation. We tried it in staging, and the result was a 70% drop in load with no stale-data complaints. I learned to start from shared requirements rather than solutions.",
    },
    {
      match: /difficult technical problem|under time pressure/i,
      answer:
        "Two days before a release our order API started timing out. I was responsible for the fix. I profiled it and found an N+1 query introduced by a lazy-loaded collection. I rewrote it with a fetch join, added an index, and wrote a regression test. Response time dropped from three seconds to 120 milliseconds and we shipped on time.",
    },
    {
      match: /anything else|anything you'd like to add|questions for the hiring team/i,
      answer:
        "Thank you — I'd just add that I enjoy mentoring juniors on testing practices. I'd love to hear more about the team's deployment process later.",
    },
    {
      match: /project|role in|structure/i,
      answer:
        "On the order tracking API I owned the shipment module: I split it into controllers, services and repositories, kept business rules in the service layer, used DTOs at the API boundary, and wrote both unit tests and Testcontainers integration tests.",
    },
  ],
  followUp:
    "To give a concrete example: in our order service I applied that directly — I wrote the change, covered it with unit and integration tests, and we measured the improvement in production metrics afterwards.",
  fallback:
    "In my experience I approach this by first clarifying the requirements, then choosing a simple, well-tested design, and measuring the result. For example, in our Spring Boot services I applied that with clear layering, tests and code review.",
};

export const AVERAGE_CANDIDATE: ScriptedAnswerSet = {
  rules: [
    {
      match: /introduce yourself|background|relevant experience/i,
      answer:
        "I'm John. I finished a bootcamp last year and I've used Java for about one year, mostly for small projects. I built a simple library management app.",
    },
    {
      match: /interface and an abstract class/i,
      answer:
        "An interface is like a contract that classes implement, and an abstract class can have some code. I think you can implement many interfaces.",
    },
    { match: /equals and hashCode/i, answer: "I don't know." },
    { match: /thread-safe|shared counter/i, answer: "Maybe use synchronized on the method." },
    {
      match: /dependency injection/i,
      answer: "Spring creates the objects for you with @Autowired so you don't call new yourself.",
    },
    {
      match: /constructor, setter and field injection/i,
      answer: "I usually put @Autowired on fields. I'm not sure about the differences.",
    },
    {
      match: /HTTP request reaches|REST controller/i,
      answer: "The request goes to the controller and it returns the response as JSON.",
    },
    {
      match: /HTTP methods/i,
      answer: "GET to read data and POST to send data. DELETE to remove things.",
    },
    {
      match: /secure a REST API|authentication and authorization/i,
      answer: "You can add a login with a password. I haven't used Spring Security much.",
    },
    {
      match: /INNER JOIN|LEFT JOIN/i,
      answer: "Inner join gives the matching rows, left join gives all rows from the left table.",
    },
    {
      match: /Git workflow/i,
      answer:
        "I use git add, commit and push. On my project I worked mostly alone on the main branch.",
    },
    {
      match: /disagreement/i,
      answer:
        "In a group project we disagreed on the database. We talked about it and used MySQL in the end.",
    },
    {
      match: /difficult technical problem|under time pressure/i,
      answer: "I had a bug in my project that I fixed by searching online.",
    },
    {
      match: /anything else|anything you'd like to add|questions for the hiring team/i,
      answer: "No, thank you.",
    },
  ],
  followUp: "I'm not completely sure, I would need to look it up.",
  fallback: "I'm not very familiar with that yet, but I'm learning.",
};

export function scriptedAnswer(
  set: ScriptedAnswerSet,
  question: string,
  isFollowUp: boolean,
): string {
  if (isFollowUp) return set.followUp;
  return set.rules.find((r) => r.match.test(question))?.answer ?? set.fallback;
}
