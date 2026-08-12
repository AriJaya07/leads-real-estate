import type { Phrase } from "../lexicon";

/**
 * Courses-vertical intent lexicon — same shape as `../lexicon.ts`'s
 * real-estate phrase lists, selected via `../lexicon-registry.ts` when a
 * company's `category` is `"courses"`. Starter set, tune from observed
 * conversion the same way the real-estate lexicon's own doc comment
 * describes — not exhaustive.
 */

export const COURSES_BUYER_PHRASES: Phrase[] = [
  { text: "looking for a course", weight: 28, lang: "en" },
  { text: "want to learn", weight: 22, lang: "en" },
  { text: "need certification in", weight: 26, lang: "en" },
  { text: "any recommendations for a course", weight: 18, lang: "en" },
  { text: "where can i study", weight: 16, lang: "en" },
  { text: "looking to enroll", weight: 26, lang: "en" },
  { text: "my budget for this course", weight: 24, lang: "en" },
  { text: "looking for a class in", weight: 24, lang: "en" },

  { text: "mau belajar", weight: 24, lang: "id" },
  { text: "cari kursus", weight: 28, lang: "id" },
  { text: "butuh sertifikasi", weight: 26, lang: "id" },
  { text: "cari pelatihan", weight: 26, lang: "id" },
  { text: "budget kursus", weight: 22, lang: "id" },
];

export const COURSES_SELLER_PHRASES: Phrase[] = [
  { text: "enrolling now", weight: 20, lang: "en" },
  { text: "new batch starting", weight: 20, lang: "en" },
  { text: "limited seats", weight: 18, lang: "en" },
  { text: "early bird price", weight: 18, lang: "en" },
  { text: "kelas baru dibuka", weight: 20, lang: "id" },
  { text: "pendaftaran dibuka", weight: 20, lang: "id" },
];

export const COURSES_AGENT_PHRASES: Phrase[] = [
  { text: "course consultant", weight: 20, lang: "en" },
  { text: "education agent", weight: 20, lang: "en" },
  { text: "konsultan pendidikan", weight: 20, lang: "id" },
];

export const COURSES_INVESTOR_PHRASES: Phrase[] = [
  { text: "corporate training", weight: 20, lang: "en" },
  { text: "bulk enrollment", weight: 18, lang: "en" },
  { text: "company training program", weight: 18, lang: "en" },
  { text: "pelatihan karyawan", weight: 18, lang: "id" },
];

export const COURSES_BROKER_PHRASES: Phrase[] = [
  { text: "accredited provider", weight: 20, lang: "en" },
  { text: "certified institution", weight: 20, lang: "en" },
  { text: "terakreditasi", weight: 18, lang: "id" },
];
