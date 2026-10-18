const $ = (selector) => document.querySelector(selector);
const node = (tag, className = '', text) => {
  const el = document.createElement(tag);
  el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
};
let examples = {};
let drafts = [];
let selected;
let controller;
let busy = false;
let entries = [];
let runtime = {};
let reply;
let selectedDemo = 'demo';
function toast(message) {
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  setTimeout(() => {
    $('#toast').hidden = true;
  }, 6000);
}
function setBusy(value) {
  busy = value;
  $('#run').hidden = value;
  $('#stop').hidden = !value;
  $('#stop').disabled = value && !controller;
  $('#run-demo').disabled = value;
  for (const el of document.querySelectorAll('#demo,#repair,#reset,#version,[data-revise]'))
    el.disabled = value;
}
function state(label, kind = '') {
  $('#run-state').textContent = label;
  $('#run-state').className = `badge ${kind}`;
}
function message(role, text) {
  const article = node('div', 'message');
  article.append(node('strong', '', role === 'user' ? 'YOU' : 'DEMO COACH'));
  const content = node('div', '', text);
  article.append(content);
  $('#messages').append(article);
  return content;
}
function modelDetails() {
  $('#runtime').textContent = runtime.model || 'StepFun';
  const dl = $('#model-details');
  dl.replaceChildren();
  for (const [label, value] of Object.entries({
    Provider: runtime.provider,
    'Configured model': runtime.model,
    'API-reported model': runtime.reportedModel || 'No reply yet',
    Framework: runtime.sdk,
    Runtime: runtime.runtime,
  }))
    dl.append(node('dt', '', label), node('dd', '', value));
}
function showDraft(draft) {
  selected = draft;
  $('#empty-result').hidden = true;
  $('#draft').hidden = false;
  $('#result-jump').hidden = false;
  $('#draft-title').textContent = draft.title;
  $('#pitch-text').textContent = draft.text;
  $('#draft-meta').textContent =
    `Draft ${String(draft.version).padStart(2, '0')} · ${draft.wordCount} words · estimated ${draft.estimatedSeconds}s · target ${draft.targetSeconds}s`;
  $('#facts').replaceChildren();
  for (const key of ['audience', 'problem', 'benefit'])
    $('#facts').append(
      node('dt', '', key[0].toUpperCase() + key.slice(1)),
      node('dd', '', draft[key]),
    );
  $('#download-md').href = `/drafts/${draft.version}.md`;
  $('#download-json').href = `/drafts/${draft.version}.json`;
  $('#version').hidden = false;
  $('#version').replaceChildren(
    ...drafts.map((d) => {
      const option = node('option', '', `Draft ${String(d.version).padStart(2, '0')}`);
      option.value = d.version;
      return option;
    }),
  );
  $('#version').value = draft.version;
}
function upsertDraft(draft) {
  drafts = [...drafts.filter((d) => d.version !== draft.version), draft].sort(
    (a, b) => a.version - b.version,
  );
  showDraft(draft);
}
const names = {
  set_goal: 'Set the task contract',
  read_draft: 'Read saved work',
  check_pitch: 'Check the candidate',
  save_pitch: 'Save a checked version',
};
function toolEvent(event) {
  if (event.phase === 'start') {
    if (!entries.length) $('#activity').replaceChildren();
    const item = node('li', 'action running');
    const details = node('details');
    const summary = node('summary');
    const label = node('span', '', names[event.tool] || event.tool);
    const tag = node('span', 'action-tag', 'Running');
    summary.append(label, tag);
    const body = node('div', 'action-body');
    body.append(node('span', 'tool-name', event.tool));
    details.append(summary, body);
    item.append(details);
    $('#activity').append(item);
    entries.push({
      tool: event.tool,
      input: event.input,
      item,
      details,
      label,
      tag,
      body,
      finished: false,
    });
    $('#action-count').textContent =
      `${entries.length} tool ${entries.length === 1 ? 'action' : 'actions'}`;
    $('#status').textContent = names[event.tool] || 'Working…';
    return;
  }
  const entry = entries.findLast((e) => e.tool === event.tool && !e.finished);
  if (!entry) return;
  entry.finished = true;
  const result = event.result || {};
  const failed = Boolean(
    result.error || result.passed === false || result.saved === false || result.accepted === false,
  );
  entry.item.className = `action ${failed ? 'failed' : 'done'}`;
  entry.tag.textContent = failed
    ? result.passed === false
      ? 'Needs revision'
      : 'Could not finish'
    : 'Done';
  entry.details.open = failed;
  if (event.tool === 'set_goal' && result.accepted) {
    $('#mission-title').textContent = result.goal.objective;
    $('#goal-text').textContent =
      `Deliver a checked ${result.goal.targetSeconds}-second English pitch.`;
    $('#criteria').replaceChildren(...result.goal.criteria.map((text) => node('li', '', text)));
  }
  if (event.tool === 'check_pitch') {
    entry.body.append(
      node(
        'p',
        '',
        `${result.wordCount} words · budget ${result.minWords}–${result.maxWords} · estimated ${result.estimatedSeconds}s`,
      ),
    );
    if (result.issues?.length) {
      const list = node('ul');
      list.append(...result.issues.map((issue) => node('li', '', issue)));
      entry.body.append(list);
    }
    if (entry.input?.text) entry.body.append(node('p', 'candidate', entry.input.text));
    if (result.passed) entry.tag.textContent = 'Passed';
  }
  if (event.tool === 'read_draft')
    entry.body.append(
      node(
        'p',
        '',
        result.draft
          ? `Read Draft ${result.draft.version}: ${result.draft.title}`
          : result.note || result.error,
      ),
    );
  if (event.tool === 'save_pitch' && result.saved) {
    entry.tag.textContent = `Draft ${result.version} saved`;
    entry.body.append(
      node(
        'p',
        '',
        `Created draft-${String(result.version).padStart(4, '0')}.md and matching JSON. Earlier versions remain.`,
      ),
    );
    upsertDraft(result);
  }
  if (result.error) entry.body.append(node('p', '', result.error));
}
function processEvent(event) {
  if (event.type === 'run-start') {
    entries = [];
    $('#activity').replaceChildren(
      node('li', 'activity-empty', 'Agent is choosing its next action…'),
    );
    $('#action-count').textContent = 'Waiting for tools';
    $('#mission-title').textContent = 'A new task is underway.';
    $('#goal-text').textContent =
      event.request.length > 180 ? `${event.request.slice(0, 180)}…` : event.request;
    $('#criteria').replaceChildren();
    state('Working', 'working');
  }
  if (event.type === 'tool') toolEvent(event);
  if (event.type === 'text' && reply) reply.textContent += event.text;
  if (event.type === 'done') {
    if (event.outcome === 'saved') for (const entry of entries) entry.details.open = false;
    runtime.reportedModel = event.reportedModel;
    modelDetails();
    state(
      event.outcome === 'saved'
        ? 'Delivered'
        : event.outcome === 'incomplete'
          ? 'Needs attention'
          : 'Answered',
      event.outcome === 'saved' ? 'saved' : event.outcome === 'incomplete' ? 'failed' : '',
    );
    $('#status').textContent =
      event.outcome === 'saved'
        ? 'Checked pitch saved. Try a revision or download your files.'
        : event.outcome === 'incomplete'
          ? 'Inspect the feedback before continuing.'
          : 'Ready for your next task.';
  }
  if (event.type === 'error') {
    for (const entry of entries.filter((e) => !e.finished)) {
      entry.finished = true;
      entry.item.className = 'action failed';
      entry.tag.textContent = 'Incomplete';
    }
    state('Stopped / incomplete', 'failed');
    $('#status').textContent = event.message;
    toast(event.message);
  }
}
function restore(view) {
  $('#messages').replaceChildren();
  for (const entry of view.chat) message(entry.role, entry.text);
  drafts = view.drafts;
  if (drafts.length) showDraft(drafts.at(-1));
  for (const event of view.activity || []) processEvent(event);
  runtime.reportedModel = view.reportedModel;
  modelDetails();
}
async function recover() {
  const deadline = Date.now() + 200000;
  while (Date.now() < deadline) {
    const response = await fetch('/api/session');
    if (!response.ok) throw new Error('Could not restore your workspace.');
    const view = await response.json();
    restore(view);
    if (!view.busy) return;
    setBusy(true);
    $('#status').textContent = 'A task is running in this browser workspace…';
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error('The task is still running. Reload to check its status.');
}
async function submit(text) {
  text = text.trim();
  if (!text || busy) return;
  $('#prompt').value = '';
  message('user', text);
  reply = message('assistant', '');
  controller = new AbortController();
  setBusy(true);
  let terminal = false;
  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error((await response.json()).error || 'Request failed.');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pending = '';
    const event = (line) => {
      if (!line.trim()) return;
      const data = JSON.parse(line);
      processEvent(data);
      if (data.type === 'done' || data.type === 'error') terminal = true;
    };
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      pending += decoder.decode(value, { stream: true });
      const lines = pending.split('\n');
      pending = lines.pop();
      for (const line of lines) event(line);
    }
    pending += decoder.decode();
    if (pending.trim()) event(pending);
    if (!terminal) throw new Error('The connection ended early. Reload to inspect saved work.');
  } catch (error) {
    const text =
      error.name === 'AbortError'
        ? 'Stopped. Any completed saves remain available.'
        : error.message;
    processEvent({ type: 'error', message: text });
  } finally {
    reply = undefined;
    controller = undefined;
    setBusy(false);
  }
}
$('#composer').addEventListener('submit', (event) => {
  event.preventDefault();
  submit($('#prompt').value);
});
$('#prompt').addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    submit($('#prompt').value);
  }
});
$('#demo').addEventListener('click', () => {
  selectedDemo = 'demo';
  submit(examples.demo || '');
});
$('#repair').addEventListener('click', () => {
  selectedDemo = 'repair';
  submit(examples.repair || '');
});
function showDemoInput() {
  const sample = examples.details?.[selectedDemo];
  if (!sample) {
    toast('Reload after restarting the server to load the demo inputs.');
    return false;
  }
  $('#demo-select').value = selectedDemo;
  $('#demo-description').textContent = sample.description;
  $('#demo-output').textContent = sample.output;
  $('#demo-prompt').textContent = sample.prompt;
  return true;
}
$('#view-demo-input').addEventListener('click', () => {
  if (showDemoInput()) $('#demo-dialog').showModal();
});
$('#demo-select').addEventListener('change', (event) => {
  selectedDemo = event.target.value;
  showDemoInput();
});
$('#close-demo').addEventListener('click', () => $('#demo-dialog').close());
$('#copy-demo').addEventListener('click', () =>
  navigator.clipboard.writeText(examples.details[selectedDemo].prompt).then(
    () => toast('Prompt copied.'),
    () => toast('Select the prompt text to copy it.'),
  ),
);
$('#edit-demo').addEventListener('click', () => {
  $('#prompt').value = examples.details[selectedDemo].prompt;
  $('#demo-dialog').close();
  $('#prompt').focus();
});
$('#run-demo').addEventListener('click', () => {
  if (busy) return;
  $('#demo-dialog').close();
  submit(examples.details[selectedDemo].prompt);
});
$('#stop').addEventListener('click', () => controller?.abort());
$('#version').addEventListener('change', (event) => {
  const draft = drafts.find((d) => d.version === Number(event.target.value));
  if (draft) showDraft(draft);
});
$('#copy').addEventListener('click', () =>
  navigator.clipboard.writeText(selected?.text || '').then(
    () => toast('Pitch copied.'),
    () => toast('Select the pitch text to copy it.'),
  ),
);
for (const button of document.querySelectorAll('[data-revise]'))
  button.addEventListener('click', () => {
    if (selected)
      submit(
        `Read saved draft version ${selected.version}. ${button.dataset.revise} Set the new goal, check the revision, and save a new version.`,
      );
  });
$('#runtime').addEventListener('click', () => $('#model-dialog').showModal());
$('#close-model').addEventListener('click', () => $('#model-dialog').close());
$('#reset').addEventListener('click', async () => {
  try {
    const response = await fetch('/api/reset', { method: 'POST' });
    const view = await response.json();
    if (!response.ok) throw new Error(view.error);
    restore(view);
    entries = [];
    $('#activity').replaceChildren(
      node('li', 'activity-empty', 'Tool calls and their feedback appear here as the agent works.'),
    );
    $('#action-count').textContent = 'No actions yet';
    $('#mission-title').textContent = 'Ready for a new goal.';
    $('#goal-text').textContent = 'Your saved drafts remain in this workspace.';
    $('#criteria').replaceChildren();
    state('Ready');
  } catch (error) {
    toast(error.message);
  }
});
setBusy(true);
try {
  const [health, samples] = await Promise.all([fetch('/api/health'), fetch('/api/examples')]);
  runtime = await health.json();
  examples = await samples.json();
  modelDetails();
  await recover();
  if (!runtime.configured)
    toast('Set STEP_API_KEY in this stage’s .env or voice-agent/.env, then restart.');
} catch (error) {
  toast(error.message);
} finally {
  setBusy(false);
}
