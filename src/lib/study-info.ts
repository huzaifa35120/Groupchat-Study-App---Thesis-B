// Participant information statement (from the approved information and consent form).

export const STUDY_TITLE = "Measuring how closely AI-generated messages match human communication in group chat";
export const INVESTIGATOR = "Huzaifa Faizan, Bachelor of Engineering (Software Engineering), School of Computing, Macquarie University";
export const INVESTIGATOR_EMAIL = "huzaifa.faizan1@students.mq.edu.au";
export const SUPERVISOR = "Dr Qiongkai Xu";

export const INFO_SECTIONS: { heading: string; body: string[] }[] = [
  {
    heading: "What's this about?",
    body: [
      "AI is getting good at writing text, but nobody really knows how well it handles group conversation — the short replies, the running jokes, the way people talk when they're not being formal.",
      "I'm testing this by collecting real group chats, hiding some of the messages, and asking an AI to fill the gaps using only the messages around them. Comparing what the AI writes to what was actually said shows how close it gets.",
    ],
  },
  {
    heading: "What do I have to do?",
    body: [
      "Three group chat sessions with two other participants. Ten minutes each, same three people every time, on a topic I'll give you. Around thirty minutes total.",
      "You join through the link I emailed you and pick a made-up name to use in the chat.",
    ],
  },
  {
    heading: "Is there AI in the chat?",
    body: [
      "No. All three people in the chat are real. The AI part happens afterwards, once the conversation is finished. I may post short messages as the moderator (for example to say the session is starting or how much time is left); those aren't part of the study data.",
    ],
  },
  {
    heading: "What happens to my messages?",
    body: [
      "I save the messages, the timestamps, and your made-up name. Nothing else.",
      "After the sessions I hide about one in five messages and get Claude Opus 5 to write a replacement using the surrounding conversation. I score how close each replacement is to the original. Only message text is sent to the AI — nothing that identifies you.",
    ],
  },
  {
    heading: "What do you collect about me?",
    body: [
      "Collected: made-up name, message text, timestamps.",
      "Not collected: your real name, student number, email (kept separately), IP address, device info, age, gender, or any other personal details.",
    ],
  },
  {
    heading: "Who can see it?",
    body: [
      "Only me and my supervisor. Everything is stored in a secure database with access controls.",
      "If you ask for a results summary, your email is kept on a separate list, never linked to your messages, and deleted once the summaries are sent. The data is kept for the standard university retention period after I submit, then deleted.",
    ],
  },
  {
    heading: "Will anyone see what I wrote?",
    body: [
      "Only overall results go in the thesis — averages and patterns, not transcripts. If I use an example message it'll be reworded so it can't be traced back to you, including by the other two people in your group. You won't be shown any assessment of your own messages, and neither will anyone else.",
    ],
  },
  {
    heading: "Are there any risks?",
    body: [
      "Low. Topics are neutral, so you're not asked to share anything personal, medical, or financial. You can leave a session at any point without explaining why.",
    ],
  },
  {
    heading: "Do I have to?",
    body: [
      "No. Taking part is completely voluntary. You can stop at any time, and you can withdraw your data afterwards without giving a reason — there's a withdraw button on your study page.",
      "Because your conversations feed into everything that comes after, withdrawing means all of your sessions get deleted entirely. There's no consequence for saying no or pulling out. I'm not your tutor or marker and have no academic authority over you.",
    ],
  },
  { heading: "Do I get anything for it?", body: ["A $20 gift card."] },
  {
    heading: "Complaints",
    body: [
      "If you have any concerns about how the study is being conducted, contact the Director, Research Ethics & Integrity, Macquarie University — phone +61 (2) 9850 4430, email ethics.secretariat@mq.edu.au.",
    ],
  },
];
