// Default coping-skill library. Descriptions are intentionally general —
// the user (or their EMDR therapist) can edit the instructions in Settings
// to match exactly what they were taught in session.
const DEFAULT_SKILLS = {
  pendulum: {
    name: "Pendulum Eye Roll",
    icon: "\ud83d\udc41\ufe0f",
    instructions:
      "Slowly roll your eyes in a smooth, gentle arc — like a pendulum swinging — from one side to the other, without moving your head. Keep it slow and easy, not fast. Do a few rounds and notice if your body settles.",
  },
  safeplace: {
    name: "Safe Place",
    icon: "\ud83c\udf32",
    instructions:
      "Bring to mind (or open the Safe Place experience in this app) a place that feels calm and secure. Notice what you'd see, hear, smell, and feel there. Let yourself rest in that image for a minute or two.",
  },
  grounding: {
    name: "5-4-3-2-1 Grounding",
    icon: "\ud83d\udd0d",
    instructions:
      "Name, in turn: 5 things you can see, 4 things you can feel/touch, 3 things you can hear, 2 things you can smell, and 1 thing you can taste. Go slowly — this pulls attention into the present moment.",
  },
  tapping: {
    name: "Tapping",
    icon: "\ud83d\udc4b",
    instructions:
      "Cross your arms over your chest and gently, alternately tap your hands on your upper arms (a butterfly hug), or tap your knees left-right-left-right at a slow, steady pace. Keep breathing normally as you tap.",
  },
  acupressure: {
    name: "Acupressure Breathing",
    icon: "\ud83e\uddd8",
    instructions:
      "Press your thumb gently into the fleshy point between your other thumb and index finger (or another acupressure point you've been shown). Breathe in slowly for 4 counts, hold for 4, and out for 6, while keeping steady pressure.",
  },
};

function loadSkills(data) {
  // Merge saved overrides on top of defaults so new default skills still show up.
  const saved = (data && data.skills) || {};
  const merged = {};
  for (const key of Object.keys(DEFAULT_SKILLS)) {
    merged[key] = { ...DEFAULT_SKILLS[key], ...(saved[key] || {}) };
  }
  return merged;
}

// A short branching questionnaire. Framed as a personal triage helper,
// not a clinical assessment — the user can always pick a skill manually.
const SKILL_PICKER_TREE = {
  start: {
    question: "What's most present for you right now?",
    options: [
      { label: "Racing thoughts, can't focus", next: "racing" },
      { label: "Body feels tense or wound up", next: "tense" },
      { label: "Feeling frozen, foggy, or far away", next: "foggy" },
      { label: "A memory or image keeps intruding", next: "intrusive" },
    ],
  },
  racing: {
    question: "Do you have a couple of quiet minutes, or do you need something fast?",
    options: [
      { label: "Fast — right now", result: "grounding" },
      { label: "I have a few minutes", result: "safeplace" },
    ],
  },
  tense: {
    question: "Would movement/touch help more, or slow breathing?",
    options: [
      { label: "Movement or touch", result: "tapping" },
      { label: "Slow breathing", result: "acupressure" },
    ],
  },
  foggy: {
    question: "Do you want something that engages your eyes, or your senses more broadly?",
    options: [
      { label: "My eyes", result: "pendulum" },
      { label: "My senses generally", result: "grounding" },
    ],
  },
  intrusive: {
    question: "Would it help to set it aside first, or ground yourself first?",
    options: [
      { label: "Set it aside (use my Container)", result: "container" },
      { label: "Ground myself first", result: "grounding" },
    ],
  },
};
