import type { InterviewerPersonality } from "@repo/shared";

/**
 * Deterministic interviewer phrases (greeting, closing, fallbacks) per language.
 * English is complete; other languages are ready for review by native speakers.
 */
export interface InterviewerPhrases {
  greeting: (p: {
    firstName: string;
    jobTitle: string;
    companyName: string;
    interviewerName: string;
    minutes: number;
    personality: InterviewerPersonality;
  }) => string;
  closing: (p: { firstName: string; jobTitle: string }) => string;
  unclear: string;
  injectionDecline: string;
  repeatPrefix: string;
  continueGeneric: (skill: string | null) => string;
  closingQuestion: string;
  acknowledgements: string[];
  moveOnTo: (section: string) => string;
  timeUp: string;
}

const en: InterviewerPhrases = {
  greeting: ({ firstName, jobTitle, companyName, interviewerName, minutes, personality }) => {
    const hello = personality === "FORMAL" ? `Good day, ${firstName}.` : `Hello ${firstName}.`;
    const warm =
      personality === "FRIENDLY" || personality === "CONVERSATIONAL"
        ? " It's nice to meet you."
        : "";
    return `${hello}${warm} Welcome, and thank you for taking the time to interview for the ${jobTitle} position at ${companyName}. I'm ${interviewerName}, an AI interviewer assisting the hiring team. This interview should take approximately ${minutes} minutes. I'll ask you about your experience and several role-related topics. Take your time when answering, and if you need me to repeat or clarify a question, just ask. Before we begin, can you hear me clearly, and are you ready to start?`;
  },
  closing: ({ firstName, jobTitle }) =>
    `Thank you for your time today, ${firstName}. That concludes the interview for the ${jobTitle} position. Your responses have been recorded and will be reviewed by the hiring team. We appreciate your interest in the role.`,
  unclear: "Sorry, I didn't fully catch that. Could you repeat or rephrase your answer?",
  injectionDecline:
    "I can't share internal interview configuration, but I'm happy to clarify the question.",
  repeatPrefix: "Of course.",
  continueGeneric: (skill) =>
    skill
      ? `Let's continue with another question. Could you describe a recent project where you used ${skill}?`
      : "Let's continue with another question. Could you describe a recent project you're proud of and the role you played in it?",
  closingQuestion:
    "Before we finish, is there anything you'd like to add about your experience, or any questions for the hiring team?",
  acknowledgements: ["Thank you.", "Understood.", "That's helpful.", "Thanks for explaining that."],
  moveOnTo: (section) => `Let's move on to ${section.toLowerCase()}.`,
  timeUp: "We've reached the end of our scheduled time.",
};

const fr: InterviewerPhrases = {
  greeting: ({ firstName, jobTitle, companyName, interviewerName, minutes }) =>
    `Bonjour ${firstName}. Bienvenue, et merci de prendre le temps de passer cet entretien pour le poste de ${jobTitle} chez ${companyName}. Je suis ${interviewerName}, une intervieweuse IA qui assiste l'équipe de recrutement. Cet entretien devrait durer environ ${minutes} minutes. Prenez votre temps pour répondre, et si vous souhaitez que je répète ou clarifie une question, n'hésitez pas. Avant de commencer, m'entendez-vous bien et êtes-vous prêt à commencer ?`,
  closing: ({ firstName, jobTitle }) =>
    `Merci pour votre temps aujourd'hui, ${firstName}. Ceci conclut l'entretien pour le poste de ${jobTitle}. Vos réponses ont été enregistrées et seront examinées par l'équipe de recrutement.`,
  unclear: "Désolée, je n'ai pas bien compris. Pourriez-vous répéter ou reformuler votre réponse ?",
  injectionDecline:
    "Je ne peux pas partager la configuration interne de l'entretien, mais je peux clarifier la question.",
  repeatPrefix: "Bien sûr.",
  continueGeneric: (skill) =>
    skill
      ? `Passons à une autre question. Pourriez-vous décrire un projet récent où vous avez utilisé ${skill} ?`
      : "Passons à une autre question. Pourriez-vous décrire un projet récent dont vous êtes fier et votre rôle ?",
  closingQuestion:
    "Avant de terminer, souhaitez-vous ajouter quelque chose ou poser une question à l'équipe de recrutement ?",
  acknowledgements: ["Merci.", "Compris.", "C'est utile."],
  moveOnTo: (section) => `Passons maintenant à : ${section}.`,
  timeUp: "Nous avons atteint la fin du temps prévu.",
};

const es: InterviewerPhrases = {
  greeting: ({ firstName, jobTitle, companyName, interviewerName, minutes }) =>
    `Hola ${firstName}. Bienvenido y gracias por dedicar tu tiempo a esta entrevista para el puesto de ${jobTitle} en ${companyName}. Soy ${interviewerName}, una entrevistadora de IA que ayuda al equipo de selección. La entrevista durará aproximadamente ${minutes} minutos. Tómate tu tiempo para responder y, si necesitas que repita o aclare una pregunta, solo dímelo. Antes de empezar, ¿me escuchas bien y estás listo para comenzar?`,
  closing: ({ firstName, jobTitle }) =>
    `Gracias por tu tiempo hoy, ${firstName}. Con esto concluye la entrevista para el puesto de ${jobTitle}. Tus respuestas han sido registradas y serán revisadas por el equipo de selección.`,
  unclear: "Perdona, no te he entendido bien. ¿Podrías repetir o reformular tu respuesta?",
  injectionDecline:
    "No puedo compartir la configuración interna de la entrevista, pero con gusto aclaro la pregunta.",
  repeatPrefix: "Por supuesto.",
  continueGeneric: (skill) =>
    skill
      ? `Sigamos con otra pregunta. ¿Podrías describir un proyecto reciente en el que usaste ${skill}?`
      : "Sigamos con otra pregunta. ¿Podrías describir un proyecto reciente del que estés orgulloso y tu papel en él?",
  closingQuestion:
    "Antes de terminar, ¿hay algo que quieras añadir o alguna pregunta para el equipo de selección?",
  acknowledgements: ["Gracias.", "Entendido.", "Eso es útil."],
  moveOnTo: (section) => `Pasemos ahora a: ${section}.`,
  timeUp: "Hemos llegado al final del tiempo previsto.",
};

const ar: InterviewerPhrases = {
  greeting: ({ firstName, jobTitle, companyName, interviewerName, minutes }) =>
    `مرحباً ${firstName}. أهلاً بك، وشكراً لتخصيص وقتك لإجراء مقابلة لوظيفة ${jobTitle} في ${companyName}. أنا ${interviewerName}، مُحاورة بالذكاء الاصطناعي أساعد فريق التوظيف. ستستغرق هذه المقابلة حوالي ${minutes} دقيقة. خذ وقتك في الإجابة، وإذا احتجت إلى تكرار السؤال أو توضيحه فأخبرني. قبل أن نبدأ، هل تسمعني بوضوح، وهل أنت مستعد للبدء؟`,
  closing: ({ firstName, jobTitle }) =>
    `شكراً لوقتك اليوم يا ${firstName}. بهذا تنتهي المقابلة لوظيفة ${jobTitle}. تم تسجيل إجاباتك وسيراجعها فريق التوظيف.`,
  unclear: "عذراً، لم ألتقط إجابتك بالكامل. هل يمكنك تكرارها أو صياغتها بطريقة أخرى؟",
  injectionDecline: "لا يمكنني مشاركة إعدادات المقابلة الداخلية، لكن يسعدني توضيح السؤال.",
  repeatPrefix: "بالتأكيد.",
  continueGeneric: (skill) =>
    skill
      ? `لننتقل إلى سؤال آخر. هل يمكنك وصف مشروع حديث استخدمت فيه ${skill}؟`
      : "لننتقل إلى سؤال آخر. هل يمكنك وصف مشروع حديث تفخر به ودورك فيه؟",
  closingQuestion: "قبل أن ننتهي، هل هناك ما تود إضافته أو أي أسئلة لفريق التوظيف؟",
  acknowledgements: ["شكراً لك.", "مفهوم.", "هذا مفيد."],
  moveOnTo: (section) => `لننتقل الآن إلى: ${section}.`,
  timeUp: "لقد وصلنا إلى نهاية الوقت المحدد.",
};

const PHRASES: Record<string, InterviewerPhrases> = { en, fr, es, ar };

export function phrasesFor(language: string): InterviewerPhrases {
  return PHRASES[language] ?? en;
}
