import { createActivity } from './activity.js';
import { demoInputs } from './demo-inputs.js';
const $ = (selector) => document.querySelector(selector);
const chat = $('#chat');
const messages = $('#messages');
const prompt = $('#prompt');
let pendingImage;
let controller;
let busy = false;
const takeIds = new Set();
const renderedVersions = new Set();
const renderedProductions = new Set();
const drafts = new Map();
let selectedScript;
let runtimeState = {};
let toastTimer;
let selectedDemo = 'campus';
const activity = createActivity(() => revealStudio());

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function toast(text) {
  $('#toast').textContent = text;
  $('#toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 9000);
}

function scrollToLatest() { chat.scrollTop = chat.scrollHeight; }

function formatReply(body) {
  // Render basic emphasis without treating model-generated text as HTML.
  const parts = body.textContent.split(/(\*\*[^*]+\*\*)/g);
  body.replaceChildren(...parts.map(part => part.startsWith('**') && part.endsWith('**')
    ? element('strong', '', part.slice(2, -2)) : document.createTextNode(part)));
}

function setBusy(value) {
  busy = value;
  document.body.classList.toggle('busy', value);
  $('#send').hidden = value;
  $('#stop').hidden = !value;
  $('#stop').disabled = value && !controller;
  $('#reset').disabled = value;
  $('#file').disabled = value;
  $('#run-demo').disabled = value;
  document.querySelectorAll('.suggestions button, #sample, [data-refine], .script-actions button, #draft-version').forEach(button => { button.disabled = value; });
}

function addMessage(role, text = '', image, failed = false) {
  $('#welcome').hidden = true;
  const article = element('article', `message ${role}${failed ? ' failed' : ''}`);
  article.append(element('div', 'message-label', role === 'user' ? 'YOU' : 'YOUR DIRECTOR'));
  if (image) {
    const thumbnail = element('img', 'message-image');
    thumbnail.src = image;
    thumbnail.alt = 'Image sent to your director';
    article.append(thumbnail);
  }
  const body = element('div', 'message-text', text);
  if (role === 'assistant') formatReply(body);
  article.append(body);
  messages.append(article);
  scrollToLatest();
  return { article, body };
}

function revealStudio() {
  $('#studio').hidden = false;
  document.body.classList.add('has-work');
}

function showSources(sources, query = '') {
  const panel = $('#sources-panel');
  panel.replaceChildren();
  panel.hidden = !sources.length && !query;
  if (panel.hidden) return;
  revealStudio();
  const heading = element('div', 'sources-title');
  heading.append(element('span', '', 'RESEARCH SOURCES'), element('span', '', sources.length ? `${sources.length} ${sources.length === 1 ? 'source' : 'sources'}` : 'No results'));
  panel.append(heading);
  if (query) panel.append(element('p', 'sources-query', query));
  for (const source of sources) {
    const article = element('article', 'source');
    const link = element('a');
    link.href = source.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    const label = element('div');
    label.append(element('div', 'source-title', source.title), element('div', 'source-domain', new URL(source.url).hostname));
    link.append(element('span', 'source-number', source.id), label);
    const details = element('details');
    details.append(element('summary', '', 'Read excerpt'), element('p', '', source.content));
    details.append(element('p', '', `Retrieved ${new Date(source.retrievedAt).toLocaleString('en-US')}${source.publishedAt ? ` · Published ${source.publishedAt}` : ''}`));
    article.append(link, details);
    panel.append(article);
  }
}

function prettyModel(model) {
  return model === 'step-5-preview' ? 'Step 5 Preview' : model;
}

function updateRuntime(info) {
  runtimeState = { ...runtimeState, ...info };
  $('#runtime-model').textContent = prettyModel(runtimeState.reportedModel || runtimeState.model || 'Model unavailable');
  const details = $('#runtime-details');
  details.replaceChildren();
  const rows = [
    ['Provider', runtimeState.provider || 'StepFun'],
    ['Configured model', runtimeState.model || 'Not loaded'],
    ['API-reported model', runtimeState.reportedModel || 'Available after your first reply'],
    ['Speech model', runtimeState.audioModel || 'Not loaded'],
    ['Music model', runtimeState.musicModel || 'Not loaded'],
    ['Optional effects model', runtimeState.productionModel || 'Not loaded'],
    ['Final mix', runtimeState.mixer || 'Node.js PCM overlay'],
    ['Agent framework', runtimeState.sdk || 'Vercel AI SDK'],
    ['Application runtime', runtimeState.runtime || 'Node.js'],
    ['Web search', runtimeState.search?.configured ? 'Tavily · configured' : 'Tavily · not configured'],
  ];
  for (const [label, value] of rows) details.append(element('dt', '', label), element('dd', '', value));
  $('#search-note').textContent = runtimeState.search?.configured
    ? 'Web research is available. Searches return source excerpts; Step 5 Preview writes the answer.'
    : 'To enable web research, add TAVILY_API_KEY to your local .env and restart the server. Chat, images, and speech are available without it.';
}

function showScript(script) {
  revealStudio();
  selectedScript = script;
  drafts.set(script.version, script);
  $('#refinements').hidden = false;
  const versions = $('#draft-version');
  versions.hidden = false;
  versions.replaceChildren(...[...drafts.keys()].sort((a, b) => b - a).map(version => {
    const option = element('option', '', `Draft ${String(version).padStart(2, '0')}`);
    option.value = version;
    return option;
  }));
  versions.value = script.version;
  const panel = $('#script-panel');
  panel.hidden = false;
  panel.replaceChildren();
  const topline = element('div', 'script-topline');
  topline.append(element('span', '', `DRAFT ${String(script.version).padStart(2, '0')}`), element('span', '', script.language === 'zh' ? 'Chinese' : 'English'));
  panel.append(topline, element('h3', '', script.title), element('div', 'script-text', script.text));
  if (script.check) panel.append(element('p', 'script-direction', `${script.check.wordCount} words · estimated ${script.check.estimatedSeconds}s narration`));
  const delivery = element('details', 'script-direction');
  delivery.append(element('summary', '', 'Production direction'), element('p', '', script.direction));
  if (script.production?.musicReason) delivery.append(element('p', '', `Why this music: ${script.production.musicReason}`));
  if (script.production) delivery.append(element('p', '', `Music: ${script.production.music}`), element('p', '', `Music level: ${script.production.musicLevel || 'balanced'}`), element('p', '', `Opening effect: ${script.production.soundEffects}`));
  panel.append(delivery);
  const actions = element('div', 'script-actions');
  const openTake = kind => {
    const take = document.querySelector(`[data-take-version="${script.version}"][data-take-kind="${kind}"]`);
    if (take?.parentElement.id === 'older-takes') $('#take-history').open = true;
    take?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };
  const hear = element('button', 'pill primary', renderedProductions.has(script.version) ? 'Open production ↗' : 'Produce audio ↗');
  hear.disabled = busy;
  hear.addEventListener('click', () => {
    if (renderedProductions.has(script.version)) {
      openTake('production');
      return;
    }
    submit(`Produce the audio pitch for saved script version ${script.version}, with restrained background music matched to the story and voice. Keep its words unchanged and use the saved production settings or choose sensible defaults. Use create_production.`);
  });
  const voice = element('button', 'pill', renderedVersions.has(script.version) ? 'Open voiceover' : 'Voice only');
  voice.disabled = busy;
  voice.addEventListener('click', () => {
    if (renderedVersions.has(script.version)) openTake('voiceover');
    else submit(`Generate a voice-only take of saved script version ${script.version}, with no music or sound effects. Keep its words and voice settings unchanged.`);
  });
  const copy = element('button', 'pill', 'Copy');
  copy.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(script.text); toast('Script copied.'); }
    catch { toast('Select the script text to copy it.'); }
  });
  actions.append(hear, voice, copy);
  panel.append(actions);
  showSources(script.sources || []);
}

function showTake(take) {
  if (takeIds.has(take.id)) return;
  revealStudio();
  takeIds.add(take.id);
  (take.kind === 'production' ? renderedProductions : renderedVersions).add(take.version);
  $('#refinements').hidden = false;
  const previous = $('#takes').firstElementChild;
  if (previous) {
    $('#older-takes').prepend(previous);
    $('#take-history').hidden = false;
  }
  const article = element('article', 'take');
  article.dataset.takeVersion = take.version;
  article.dataset.takeKind = take.kind || 'voiceover';
  const top = element('div', 'take-name');
  const download = element('a', '', 'Download ↓');
  download.href = take.url;
  download.download = `frame-and-voice-${take.kind || 'voiceover'}-${take.version}.${take.format || 'wav'}`;
  top.append(element('span', '', `TAKE ${String(take.version).padStart(2, '0')} · READY`), download);
  const voices = { 'lively-girl': 'Bright voice', 'magnetic-voiced-male': 'Deep voice', 'soft-spoken-gentleman': 'Calm voice' };
  article.append(top, element('h3', 'take-title', take.title), element('div', 'take-meta', `${take.language === 'zh' ? 'Chinese' : 'English'} · ${take.mix ? 'Mixed audio · separate tracks' : take.kind === 'production' ? 'Generated audio' : voices[take.voice] || take.voice}`));
  const audio = element('audio');
  audio.controls = true;
  audio.preload = 'metadata';
  audio.src = take.url;
  audio.setAttribute('aria-label', `Play ${take.kind === 'production' ? 'produced audio' : 'voiceover'} take ${take.version}: ${take.title}`);
  audio.addEventListener('play', () => document.querySelectorAll('audio').forEach(other => { if (other !== audio) other.pause(); }));
  audio.addEventListener('error', () => toast('This audio is unavailable. Generate a new take if the server was restarted.'));
  const details = element('details', 'take-details');
  details.append(element('summary', '', 'Script and sources'), element('p', '', take.text));
  if (take.kind === 'production' && take.production) details.append(
    element('p', '', `Requested music: ${take.production.music}\nRequested effects: ${take.production.soundEffects}`),
    ...(take.score ? [element('p', '', `Music direction: ${take.score.style} · ${take.score.tempoBpm} BPM requested. ${take.score.rationale}`)] : []),
    element('p', '', take.mix ? take.stems?.some(stem => stem.kind === 'music') ? `Voice and music are overlaid in code. Music level: ${take.production.musicLevel || 'balanced'}.` : 'Accompaniment was omitted as requested.' : 'Listen to check the generated result.'),
  );
  let tracks;
  if (take.stems?.length) {
    tracks = element('details', 'take-details');
    tracks.append(element('summary', '', 'Listen to individual tracks'));
    if (take.mix) tracks.append(element('p', '', `Voice starts at ${take.mix.voiceStartSeconds.toFixed(1)}s · mix ${take.mix.durationSeconds.toFixed(1)}s · fades and levels applied in code`));
    for (const stem of take.stems) {
      tracks.append(element('p', '', `${({ voice: 'Narration', music: 'Background music', effects: 'Opening effect' })[stem.kind]} · ${stem.model}`));
      const player = element('audio');
      player.controls = true; player.preload = 'metadata'; player.src = stem.url;
      player.setAttribute('aria-label', `Play ${stem.kind} track for take ${take.version}`);
      player.addEventListener('play', () => document.querySelectorAll('audio').forEach(other => { if (other !== player) other.pause(); }));
      player.addEventListener('error', () => toast('This track is unavailable. Generate a new take if the server was restarted.'));
      tracks.append(player);
    }
  }
  if (take.sources?.length) {
    const links = element('div', 'source-links');
    for (const source of take.sources) {
      const link = element('a', '', `[${source.id}] ${source.title}`);
      link.href = source.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; links.append(link);
    }
    details.append(links);
  }
  article.append(audio, details);
  if (tracks) article.append(tracks);
  $('#takes').prepend(article);
  if (selectedScript?.version === take.version) showScript(selectedScript);
}

function makeTrace(article) {
  const details = element('details', 'trace');
  details.append(element('summary', '', 'View tool activity'));
  const list = element('div', 'trace-list');
  details.append(list);
  article.append(details);
  const active = new Map();
  return (event) => {
    if (event.type === 'tool-start') {
      const entry = element('div', 'trace-entry');
      const label = element('strong', '', `◌ ${event.tool}`);
      entry.append(label, element('pre', '', JSON.stringify(event.input, null, 2)));
      active.set(event.tool, label);
      list.append(entry);
    } else {
      const label = active.get(event.tool);
      if (label) label.textContent = `${event.ok ? '✓' : '×'} ${event.tool}${event.cached ? (event.tool === 'search_web' ? ' · reused results' : ' · existing take') : ''}`;
      if (!event.ok) list.append(element('p', '', event.error));
    }
  };
}

async function submit(text) {
  if (busy) return;
  text = text.trim();
  if (!text && pendingImage) text = 'Create a concise, credible 20-second English introduction from this image. Use only visible facts. Save the pitch, then produce audio with restrained background music matched to the story and voice. Choose the production settings yourself.';
  if (!text) return;
  if (text.length > 4000) { toast('Keep your message under 4,000 characters.'); return; }
  const image = pendingImage?.data;
  prompt.value = '';
  clearAttachment();
  addMessage('user', text, image);
  const reply = addMessage('assistant');
  let trace;
  let completed = false;
  let receivedTerminalEvent = false;
  controller = new AbortController();
  setBusy(true);
  $('#status').textContent = image ? 'Looking at your image…' : 'Thinking…';
  const processEvent = (event) => {
    activity.process(event);
    if (event.type === 'text') { reply.body.textContent += event.text; scrollToLatest(); }
    if (event.type === 'status') $('#status').textContent = event.message;
    if (event.type === 'runtime') updateRuntime(event.runtime);
    if (event.type === 'sources') showSources(event.research.sources, event.research.query);
    if (event.type === 'script') showScript(event.script);
    if (event.type === 'audio') showTake(event.take);
    if (event.type === 'tool-start' || event.type === 'tool-end') {
      trace ??= makeTrace(reply.article);
      trace(event);
      if (event.type === 'tool-start') $('#status').textContent = ({ set_goal: 'Setting the task contract…', search_web: 'Researching sources…', save_script: 'Checking and saving your pitch…', create_voiceover: 'Generating your voiceover…', create_production: 'Generating separate tracks for your mix…' })[event.tool] || 'Working…';
      if (event.type === 'tool-end' && !event.ok) toast(event.error);
      scrollToLatest();
    }
    if (event.type === 'notice') toast(event.message);
    if (event.type === 'done') {
      formatReply(reply.body);
      completed = true;
      receivedTerminalEvent = true;
      $('#status').textContent = 'Keep shaping it. Every version stays yours.';
    }
    if (event.type === 'error') {
      receivedTerminalEvent = true;
      reply.article.classList.add('failed');
      reply.body.textContent += `\n${event.message}`;
      $('#status').textContent = 'Your saved scripts and completed audio are still here.';
      toast(event.message);
    }
  };
  try {
    const response = await fetch('/api/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, ...(image ? { image } : {}) }), signal: controller.signal,
    });
    if (!response.ok) throw new Error((await response.json()).error ?? `HTTP ${response.status}`);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pending = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      pending += decoder.decode(value, { stream: true });
      const lines = pending.split('\n');
      pending = lines.pop();
      for (const line of lines) if (line.trim()) processEvent(JSON.parse(line));
    }
    pending += decoder.decode();
    if (pending.trim()) processEvent(JSON.parse(pending));
    if (!receivedTerminalEvent) throw new Error('The connection ended before the reply finished.');
  } catch (error) {
    const stopped = error.name === 'AbortError';
    const message = stopped ? 'Stopped. Your completed work is still in the studio.' : error.message;
    activity.process({ type: 'error', message });
    reply.body.textContent += `\n${message}`;
    reply.article.classList.add('failed');
    $('#status').textContent = message;
    if (!stopped) toast(message);
  } finally {
    controller = undefined;
    setBusy(false);
    if (!completed && !prompt.value) prompt.value = text;
    scrollToLatest();
    prompt.focus();
  }
}

async function attachFile(file) {
  if (busy) return;
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { toast('Choose a PNG, JPEG, or WebP image.'); return; }
  if (file.size > 5_000_000) { toast('Choose an image smaller than 5 MB.'); return; }
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    pendingImage = { data: canvas.toDataURL('image/jpeg', 0.88), name: file.name };
    $('#attachment-image').src = pendingImage.data;
    $('#attachment-name').textContent = file.name;
    $('#attachment').hidden = false;
    prompt.focus();
  } catch { toast('That image could not be opened. Try another PNG or JPEG.'); }
}

function clearAttachment() {
  pendingImage = undefined;
  $('#attachment').hidden = true;
  $('#attachment-image').removeAttribute('src');
  $('#file').value = '';
}

$('#composer').addEventListener('submit', event => { event.preventDefault(); submit(prompt.value); });
prompt.addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); submit(prompt.value); }
});
$('#file').addEventListener('change', event => { if (event.target.files[0]) attachFile(event.target.files[0]); });
$('#remove-image').addEventListener('click', clearAttachment);
$('#stop').addEventListener('click', () => controller?.abort());
document.addEventListener('dragover', event => { event.preventDefault(); document.body.classList.add('dragging'); });
document.addEventListener('dragleave', event => { if (!event.relatedTarget) document.body.classList.remove('dragging'); });
document.addEventListener('drop', event => {
  event.preventDefault(); document.body.classList.remove('dragging');
  if (event.dataTransfer.files[0]) attachFile(event.dataTransfer.files[0]);
});

const ideas = {
  launch: 'Create a clear, credible 20-second English pitch from my project notes or attached screenshot. Use only supplied or visible facts. Save the pitch, then produce audio with restrained music matched to the story and voice. Choose the production settings yourself.',
  research: 'Research Griffith Observatory using reliable sources. Save a 20-second English audio-guide script with supporting sources, but do not generate audio yet.',
  trailer: 'Turn my photo into a fictional 20-second movie trailer. Make it suspenseful, use a deep voice, and save a draft first.',
};
document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => {
  prompt.value = ideas[button.dataset.mode];
  prompt.focus();
  if (button.dataset.mode === 'research' && !runtimeState.search?.configured) toast('Web search needs TAVILY_API_KEY in your local .env. You can still write, use images, and generate speech.');
  if (button.dataset.mode !== 'research' && !pendingImage) $('#status').textContent = 'Attach an image with the + button, or describe your idea.';
}));
document.querySelectorAll('[data-refine]').forEach(button => button.addEventListener('click', () => {
  if (!selectedScript) return;
  const action = renderedProductions.has(selectedScript.version) ? 'Save a new version and produce its audio with story-matched background music; preserve the requested effect preference.' : renderedVersions.has(selectedScript.version) ? 'Save a new version and generate its voice-only take.' : 'Save a new version without generating audio.';
  submit(`Revise saved script version ${selectedScript.version}. ${button.dataset.refine} ${action}`);
}));
$('#draft-version').addEventListener('change', event => {
  const draft = drafts.get(Number(event.target.value));
  if (draft) showScript(draft);
});
$('#runtime-button').addEventListener('click', () => $('#runtime-dialog').showModal());
$('#workspace-jump').addEventListener('click', () => $('#studio').scrollIntoView({ behavior: 'smooth', block: 'start' }));
$('#close-runtime').addEventListener('click', () => $('#runtime-dialog').close());
$('#runtime-dialog').addEventListener('click', event => { if (event.target === $('#runtime-dialog')) $('#runtime-dialog').close(); });
$('#sample').addEventListener('click', async () => {
  try {
    const response = await fetch('/sample.png');
    if (!response.ok) throw new Error();
    await attachFile(new File([await response.blob()], 'LA-Hacks-2026.png', { type: 'image/png' }));
    prompt.value = 'Write a 15-second English invitation based on this poster. Use only visible facts and save a draft, but do not generate audio yet.';
  } catch { toast('Could not load the sample poster. Attach your own image instead.'); }
});

document.querySelectorAll('[data-demo]').forEach(button => button.addEventListener('click', () => {
  selectedDemo = button.dataset.demo;
  clearAttachment();
  submit(demoInputs[selectedDemo].prompt);
}));
function showDemoInput() {
  const sample = demoInputs[selectedDemo];
  $('#demo-select').value = selectedDemo;
  $('#demo-description').textContent = sample.description;
  $('#demo-output').textContent = sample.output;
  $('#demo-prompt').textContent = sample.prompt;
}
$('#view-demo-input').addEventListener('click', () => { showDemoInput(); $('#demo-dialog').showModal(); });
$('#demo-select').addEventListener('change', event => { selectedDemo = event.target.value; showDemoInput(); });
$('#close-demo').addEventListener('click', () => $('#demo-dialog').close());
$('#copy-demo').addEventListener('click', () => navigator.clipboard.writeText(demoInputs[selectedDemo].prompt).then(() => toast('Prompt copied.'), () => toast('Select the prompt text to copy it.')));
$('#edit-demo').addEventListener('click', () => { clearAttachment(); prompt.value = demoInputs[selectedDemo].prompt; $('#demo-dialog').close(); prompt.focus(); });
$('#run-demo').addEventListener('click', () => { if (busy) return; clearAttachment(); $('#demo-dialog').close(); submit(demoInputs[selectedDemo].prompt); });

function restoreView(state) {
  activity.reset();
  messages.replaceChildren();
  $('#takes').replaceChildren();
  $('#older-takes').replaceChildren();
  $('#take-history').hidden = true;
  $('#take-history').open = false;
  takeIds.clear(); renderedVersions.clear(); renderedProductions.clear(); drafts.clear(); selectedScript = undefined;
  $('#welcome').hidden = state.chat.length > 0;
  document.body.classList.remove('has-work');
  $('#studio').hidden = true;
  $('#script-panel').hidden = true;
  $('#sources-panel').hidden = true;
  $('#draft-version').hidden = true;
  $('#refinements').hidden = true;
  for (const entry of state.chat) addMessage(entry.role, entry.text, entry.image, entry.failed);
  for (const script of state.scripts) drafts.set(script.version, script);
  for (const take of state.takes) showTake(take);
  if (state.scripts.length) showScript(state.scripts.at(-1));
  else if (state.research?.length) {
    const research = state.research.at(-1);
    showSources(research.sources, research.query);
  }
  for (const event of state.activity || []) activity.process(event);
  updateRuntime({ reportedModel: state.reportedModel || null });
  scrollToLatest();
}

// A reload or another tab can attach while the shared conversation is still running.
async function recoverConversation() {
  setBusy(true);
  $('#status').textContent = 'An earlier reply is finishing. Your workspace will update automatically.';
  const deadline = Date.now() + 620_000;
  try {
    while (Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 1200));
      const response = await fetch('/api/session');
      if (!response.ok) throw new Error('Could not restore this conversation. Reload the page.');
      const state = await response.json();
      if (!state.busy) {
        restoreView(state);
        $('#status').textContent = 'Your conversation is up to date. Keep shaping it.';
        return;
      }
    }
    throw new Error('The earlier reply has not finished. Reload the page to check again.');
  } finally { setBusy(false); }
}

$('#reset').addEventListener('click', async () => {
  if (busy) return;
  try {
    const response = await fetch('/api/reset', { method: 'POST' });
    const state = await response.json();
    if (!response.ok) throw new Error(state.error);
    restoreView(state);
    clearAttachment();
    prompt.value = '';
    $('#status').textContent = 'A fresh start. What should we make?';
  } catch (error) { toast(error.message); }
});

try {
  const [healthResponse, stateResponse] = await Promise.all([fetch('/api/health'), fetch('/api/session')]);
  if (!stateResponse.ok) throw new Error('Could not restore this conversation. Reload the page.');
  const state = await stateResponse.json();
  restoreView(state);
  const health = await healthResponse.json();
  updateRuntime(health);
  if (!health.configured) {
    $('#status').textContent = 'Add STEP_API_KEY to your .env file, then restart the server.';
    toast('API key missing. Add STEP_API_KEY to this stage’s .env or the workshop root (voice-agent/.env), then restart.');
  }
  if (state.busy) await recoverConversation();
} catch (error) {
  $('#status').textContent = error.message;
  toast(error.message);
}
