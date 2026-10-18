import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import { settings } from './config.js';

export const pitchSchema = z.object({
  title: z.string().trim().min(1).max(80),
  audience: z.string().trim().min(1).max(160),
  problem: z.string().trim().min(1).max(240),
  benefit: z.string().trim().min(1).max(240),
  text: z.string().trim().min(1).max(1800).describe('Only the words to speak, based on the supplied project facts.'),
  targetSeconds: z.number().int().min(10).max(60),
});
export type Pitch = z.infer<typeof pitchSchema>;
export type Draft = Pitch & { version: number; wordCount: number; estimatedSeconds: number; createdAt: string };

// A timing estimate, not an audio measurement or a factual-accuracy verdict.
export function checkPitch(pitch: Pitch) {
  const wordCount = pitch.text.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
  const maxWords = Math.floor(pitch.targetSeconds * 2.5);
  const minWords = Math.ceil(pitch.targetSeconds * 1.4);
  const issues: string[] = [];
  if (wordCount > maxWords) issues.push(`Too long: ${wordCount} words; use at most ${maxWords}.`);
  if (wordCount < minWords) issues.push(`Too short for this target: ${wordCount} words; aim for at least ${minWords}.`);
  if (/\*\*|^#{1,6}\s|https?:\/\//m.test(pitch.text)) issues.push('Keep Markdown and links out of the spoken pitch.');
  if (/\b(?:instantly|in seconds|every detail|everything you need)\b/i.test(pitch.text)) issues.push('Remove broad speed/completeness promises such as "in seconds" or "every detail". Describe the concrete behavior instead. This wording check is not factual verification.');
  return { passed: issues.length === 0, wordCount, estimatedSeconds: Math.round(wordCount / 2.5 * 10) / 10, targetSeconds: pitch.targetSeconds, minWords, maxWords, issues, note: 'Timing is estimated at 150 words/minute. Check factual claims against the supplied brief; this tool does not verify them.' };
}

// Tools can access only this owned draft folder, never arbitrary user-supplied paths.
export function createDraftStore(directory = settings.outputDir) {
  async function list() {
    let files: string[];
    try { files = await readdir(directory); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
    return files.filter(file => /^draft-\d{4}\.json$/.test(file)).sort();
  }
  return {
    directory,
    async all(): Promise<Draft[]> {
      const files = (await list()).slice(-40);
      return Promise.all(files.map(async file => {
        const draft = JSON.parse(await readFile(resolve(directory, file), 'utf8'));
        return { ...pitchSchema.parse(draft), version: z.number().int().positive().parse(draft.version), wordCount: draft.wordCount, estimatedSeconds: draft.estimatedSeconds, createdAt: draft.createdAt };
      }));
    },
    async read(version?: number): Promise<Draft | null> {
      const files = await list();
      const file = version === undefined ? files.at(-1) : `draft-${String(version).padStart(4, '0')}.json`;
      if (!file || !files.includes(file)) return null;
      const draft = JSON.parse(await readFile(resolve(directory, file), 'utf8'));
      return { ...pitchSchema.parse(draft), version: z.number().int().positive().parse(draft.version), wordCount: draft.wordCount, estimatedSeconds: draft.estimatedSeconds, createdAt: draft.createdAt };
    },
    async save(pitch: Pitch) {
      const checked = checkPitch(pitch);
      if (!checked.passed) throw new Error('The pitch must pass check_pitch before it can be saved.');
      await mkdir(directory, { recursive: true });
      const files = await list();
      const version = files.length ? Number(files.at(-1)!.slice(6, 10)) + 1 : 1;
      if (version > 9999) throw new Error('This workspace has reached its draft limit.');
      const stem = `draft-${String(version).padStart(4, '0')}`;
      const draft: Draft = { ...pitch, version, wordCount: checked.wordCount, estimatedSeconds: checked.estimatedSeconds, createdAt: new Date().toISOString() };
      const jsonPath = resolve(directory, `${stem}.json`);
      const markdownPath = resolve(directory, `${stem}.md`);
      await writeFile(jsonPath, JSON.stringify(draft, null, 2), { flag: 'wx' });
      await writeFile(markdownPath, `# ${pitch.title}\n\n${pitch.text}\n\n---\nAudience: ${pitch.audience}\n\nProblem: ${pitch.problem}\n\nBenefit: ${pitch.benefit}\n\n${checked.wordCount} words · estimated ${checked.estimatedSeconds}s · target ${pitch.targetSeconds}s\n`, { flag: 'wx' });
      return { ...draft, jsonPath, markdownPath };
    },
  };
}
