import type { ModelMessage } from 'ai';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

export const productionSchema = z.object({
  music: z.string().trim().min(1).max(240).describe('A sparse instrumental accompaniment supporting this specific story and vocal delivery. Describe mood and instruments, avoiding a dominant lead or busy drums. Use "none" for no music.'),
  musicStyle: z.enum(['warm-acoustic', 'light-electronic', 'cinematic-soft']).optional().describe('Choose warm-acoustic for friendly human explanations, light-electronic for playful technical demos, cinematic-soft for reflective stories. Default warm-acoustic. Respect user style requests.'),
  musicReason: z.string().trim().min(1).max(180).optional().describe('Explain briefly how this music supports the actual pitch, audience and voice. Do not claim to have listened.'),
  soundEffects: z.string().trim().min(1).max(120).describe('Default "none". Only add a brief opening effect when requested or specifically meaningful to the story. It is generated separately and cropped to 1.5 seconds.'),
  musicLevel: z.enum(['soft', 'balanced', 'present']).optional().describe('Music RMS before speech ducking: soft (-22 dB), balanced (-16 dB), present (-10 dB), relative to narration. Default balanced; reserve present for an explicit louder-music request.'),
});

export const scriptSchema = z.object({
  title: z.string().min(1).max(80).describe('A short title for this take.'),
  text: z.string().min(1).max(900).describe('Only the words to speak. No markdown or parenthesized stage directions.'),
  language: z.enum(['en', 'zh']).describe('Language of the spoken script.'),
  voice: z.enum(['lively-girl', 'magnetic-voiced-male', 'soft-spoken-gentleman']),
  direction: z.string().min(1).max(450).describe('Natural-language voice direction: emotion, pacing, delivery. No SFX or music.'),
  speed: z.number().min(0.7).max(1.3).describe('Playback speaking rate. Usually 1.0.'),
  targetSeconds: z.number().int().min(10).max(60).optional().describe('Target narration duration, default 20 seconds. Actual produced audio may include a short musical lead-in or ending.'),
  production: productionSchema.optional().describe('Agent-chosen music and sound-effect direction for a produced pitch. Do not ask the user to fill these settings.'),
  sourceIds: z.array(z.string()).max(6).optional().describe('IDs such as S1 returned by search_web that support this script. Use an empty array for an original or image-only draft. Never invent IDs.'),
});

export type Source = { id: string; title: string; url: string; content: string; retrievedAt: string; publishedAt?: string };
export type SearchRun = { query: string; sources: Source[] };
export type Script = z.infer<typeof scriptSchema> & { version: number; sources?: Source[]; check?: { wordCount: number; estimatedSeconds: number; targetSeconds: number } };
export type AudioTake = Script & {
  id: string; url: string; bytes: number; createdAt: string; model: string; kind?: 'voiceover' | 'production'; format?: 'wav' | 'mp3';
  stems?: { kind: 'voice' | 'music' | 'effects'; url: string; model: string }[];
  score?: { style: string; rationale: string; tempoBpm: number; targetSeconds: number; narrationWordsPerMinute: number; direction: string };
  mix?: { method: 'pcm-overlay-v1' | 'pcm-overlay-v2'; sampleRate: number; channels: number; durationSeconds: number; voiceStartSeconds: number; voiceEndSeconds: number; voiceRms: number; musicRmsDuringVoice: number; masterGain: number; musicLooped?: boolean; musicCrossfadeSeconds?: number; speechDucking?: boolean };
};
export type ChatEntry = { role: 'user' | 'assistant'; text: string; image?: string; failed?: boolean };
export type AgentEvent = { type: string; [key: string]: unknown };
export type Emit = (event: AgentEvent) => void;
export const goalSchema = z.object({
  objective: z.string().trim().min(1).max(100).describe('A short outcome title, about 8–12 words. Put constraints in criteria.'),
  deliverable: z.enum(['pitch', 'voiceover', 'production']),
  criteria: z.array(z.string().trim().min(1).max(140)).min(1).max(3),
});

export interface Session {
  id: string;
  messages: ModelMessage[];
  chat: ChatEntry[];
  scripts: Script[];
  takes: AudioTake[];
  sources: Source[];
  research: SearchRun[];
  goal?: z.infer<typeof goalSchema>;
  activity: AgentEvent[];
  reportedModel?: string;
  busy: boolean;
  turns: number;
  touchedAt: number;
}

export function newSession(): Session {
  return { id: randomUUID(), messages: [], chat: [], scripts: [], takes: [], sources: [], research: [], activity: [], busy: false, turns: 0, touchedAt: Date.now() };
}

export function sessionView(session: Session) {
  return { chat: session.chat, scripts: session.scripts, takes: session.takes, sources: session.sources, research: session.research, goal: session.goal, activity: session.activity, reportedModel: session.reportedModel, busy: session.busy, turns: session.turns };
}

const imagePattern = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
export const turnSchema = z.object({
  text: z.string().trim().min(1).max(4000),
  image: z.string().max(7_000_000).regex(imagePattern, 'Use a PNG, JPEG, or WebP image (up to 5 MB).').optional(),
});

export function userMessage(text: string, image?: string): ModelMessage {
  return {
    role: 'user',
    content: image
      ? [{ type: 'file', data: new URL(image), mediaType: image.slice(5, image.indexOf(';')) }, { type: 'text', text }]
      : text,
  };
}
