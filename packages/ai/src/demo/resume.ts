import type { ParsedResume } from "../schemas";

const KNOWN_SKILLS = [
  "Java",
  "Spring Boot",
  "Spring",
  "Hibernate",
  "SQL",
  "PostgreSQL",
  "MySQL",
  "MongoDB",
  "Redis",
  "REST",
  "GraphQL",
  "Git",
  "Docker",
  "Kubernetes",
  "AWS",
  "Azure",
  "GCP",
  "JavaScript",
  "TypeScript",
  "React",
  "Node.js",
  "Python",
  "Django",
  "Flask",
  "C#",
  ".NET",
  "Go",
  "Rust",
  "Kotlin",
  "Linux",
  "CI/CD",
  "Jenkins",
  "Terraform",
  "Kafka",
  "JUnit",
  "Maven",
  "Gradle",
  "HTML",
  "CSS",
  "Figma",
  "Excel",
  "Salesforce",
  "Tableau",
  "Power BI",
];

/** Lightweight resume extraction used in DEMO_MODE. Never infers protected attributes. */
export function parseResumeHeuristically(text: string): ParsedResume {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const email = /[\w.+-]+@[\w-]+\.[\w.-]+/.exec(text)?.[0] ?? null;
  const phone = /\+?\d[\d\s().-]{7,}\d/.exec(text)?.[0]?.trim() ?? null;
  const name = lines.find((l) => /^[A-Z][a-z]+(\s+[A-Z][a-z'-]+){1,3}$/.test(l)) ?? null;
  const lower = text.toLowerCase();
  const skills = KNOWN_SKILLS.filter((s) =>
    new RegExp(`(^|[^a-z])${s.toLowerCase().replace(/[.+#/]/g, "\\$&")}([^a-z]|$)`).test(lower),
  );

  const experience = lines
    .filter(
      (l) =>
        /\b(engineer|developer|intern|analyst|manager|consultant|designer)\b/i.test(l) &&
        l.length < 160,
    )
    .slice(0, 6)
    .map((line) => {
      const [title, company] = line.split(/\s+(?:at|@|-|–|\|)\s+/);
      const years = /(\d{4})\s*[-–]\s*(\d{4}|present|now)/i.exec(line);
      return {
        company: (company ?? "").slice(0, 200) || "Not specified",
        title: (title ?? line).slice(0, 200),
        startDate: years?.[1] ?? null,
        endDate: years?.[2] ?? null,
        description: "",
        technologies: skills.filter((s) => line.toLowerCase().includes(s.toLowerCase())),
      };
    });

  const education = lines
    .filter((l) =>
      /\b(university|college|institute|bachelor|master|b\.?sc|m\.?sc|phd|degree)\b/i.test(l),
    )
    .slice(0, 4)
    .map((l) => ({
      institution: l.slice(0, 200),
      degree: null,
      field: null,
      startDate: null,
      endDate: null,
    }));

  const projects = lines
    .filter((l) => /\b(project|built|developed|implemented)\b/i.test(l) && l.length > 20)
    .slice(0, 5)
    .map((l) => ({
      name: l.split(/[:–-]/)[0]!.slice(0, 120),
      description: l.slice(0, 600),
      technologies: skills.filter((s) => l.toLowerCase().includes(s.toLowerCase())),
    }));

  const yearsMatch = /(\d{1,2})\+?\s*years?\s+of\s+(professional\s+)?experience/i.exec(text);
  const certifications = lines
    .filter((l) => /\b(certified|certification|certificate)\b/i.test(l))
    .slice(0, 6)
    .map((l) => l.slice(0, 200));
  const languages = lines
    .filter((l) => /^languages?\s*:/i.test(l))
    .flatMap((l) => l.replace(/^languages?\s*:/i, "").split(/[,;]/))
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 8);

  return {
    name,
    email,
    phone,
    location: null,
    headline: lines[1] && lines[1] !== name && lines[1].length < 120 ? lines[1] : null,
    totalYearsExperience: yearsMatch ? Number.parseInt(yearsMatch[1]!, 10) : null,
    education,
    experience,
    skills,
    projects,
    certifications,
    languages,
  };
}
