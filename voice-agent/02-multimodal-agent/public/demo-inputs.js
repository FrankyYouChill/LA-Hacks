// The sample buttons and preview dialog use the same exact prompt strings.
const task =
  'Create a clear, credible 20-second English pitch from this included sample brief, save it, and produce an audio pitch with gentle, story-matched background music underneath the narration; omit opening effects unless meaningful. Choose all production settings yourself and do not ask me to record audio or answer questions.';
const briefs = {
  campus:
    'CampusMate is a workshop prototype for students arriving at a hackathon. Event details are scattered across posters. The demo accepts an uploaded poster image, uses Step 5 Preview to explain visible information, and creates a spoken invitation using StepAudio. No live-camera feature, mobile app, creator background, customers, or measured performance results are claimed.',
  launch:
    'LaunchLens is a sample prototype for small teams preparing product demos. It turns a product screenshot and a short brief into a concise project introduction, saves draft versions, and creates an audio pitch. These are sample project facts, not a claim about a launched business.',
};
export const demoInputs = Object.fromEntries(
  Object.entries(briefs).map(([id, brief]) => [
    id,
    {
      title: id === 'campus' ? 'CampusMate' : 'LaunchLens',
      description:
        'Input: a bundled text brief about a sample project. The project is being pitched; no poster, screenshot or recording is attached to this demo.',
      output:
        'Output: a saved 20-second English pitch and an audio mix with narration and music. For a real image input, use “Try the LA Hacks poster” or attach your own image.',
      prompt: `${task}\n\nInput type: text project brief. No image is attached.\n\nBrief: ${brief}`,
    },
  ]),
);
