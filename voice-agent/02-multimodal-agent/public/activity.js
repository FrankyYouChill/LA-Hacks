// A public execution log, built exclusively from actual backend events.
export function createActivity(reveal) {
  const $ = (selector) => document.querySelector(selector);
  const make = (tag, cls = '', text) => {
    const el = document.createElement(tag);
    el.className = cls;
    if (text !== undefined) el.textContent = text;
    return el;
  };
  const labels = {
    set_goal: 'Set the task contract',
    search_web: 'Research sources',
    save_script: 'Check & save the pitch',
    create_voiceover: 'Generate the voiceover',
    create_production: 'Produce the audio mix',
  };
  let actions = [];
  let stages = [];
  const badge = (text, kind = '') => {
    $('#agent-state').textContent = text;
    $('#agent-state').className = `run-badge ${kind}`;
  };
  const finishStage = (ok) => {
    const active = stages.findLast((s) => !s.done);
    if (active) {
      active.done = true;
      active.item.className = `production-step ${ok ? 'done' : 'failed'}`;
    }
  };
  function reset() {
    actions = [];
    stages = [];
    $('#agent-run').hidden = true;
    $('#agent-actions').replaceChildren();
    $('#agent-criteria').replaceChildren();
    $('#goal-criteria').hidden = true;
  }
  function process(event) {
    if (event.type === 'run-start') {
      reset();
      reveal();
      $('#agent-run').hidden = false;
      $('#agent-goal').textContent =
        event.request.length > 150 ? `${event.request.slice(0, 150)}…` : event.request;
      badge('Working', 'working');
    }
    if (event.type === 'goal') {
      $('#agent-goal').textContent = event.goal.objective;
      $('#agent-criteria').replaceChildren(
        ...event.goal.criteria.map((text) => make('li', '', text)),
      );
      $('#goal-criteria').hidden = false;
    }
    if (event.type === 'tool-start') {
      const item = make('li', 'agent-action running');
      const details = make('details');
      const summary = make('summary');
      const tag = make('span', 'action-result', 'Running');
      summary.append(make('span', '', labels[event.tool] || event.tool), tag);
      const body = make('div', 'agent-action-body');
      body.append(make('span', 'tool-code', event.tool));
      if (event.input?.query) body.append(make('p', '', event.input.query));
      details.append(summary, body);
      item.append(details);
      $('#agent-actions').append(item);
      actions.push({ tool: event.tool, input: event.input, item, details, tag, body, done: false });
    }
    if (event.type === 'status' && event.stage) {
      const action = actions.findLast((a) => a.tool === 'create_production' && !a.done);
      if (!action) return;
      finishStage(true);
      const item = make('p', 'production-step running', event.message);
      action.body.append(item);
      action.details.open = true;
      stages.push({ item, done: false });
    }
    if (event.type === 'script') {
      const action = actions.findLast((a) => a.tool === 'save_script' && !a.done);
      if (action) {
        action.body.append(
          make(
            'p',
            '',
            `Draft ${event.script.version} · ${event.script.check?.wordCount ?? '—'} words · estimated ${event.script.check?.estimatedSeconds ?? '—'}s`,
          ),
        );
        if (event.script.production?.musicReason)
          action.body.append(make('p', '', `Score choice: ${event.script.production.musicReason}`));
      }
    }
    if (event.type === 'sources') {
      const action = actions.findLast((a) => a.tool === 'search_web' && !a.done);
      if (action)
        action.body.append(
          make('p', '', `${event.research.sources.length} source excerpts returned`),
        );
    }
    if (event.type === 'audio') {
      const action = actions.findLast(
        (a) => ['create_production', 'create_voiceover'].includes(a.tool) && !a.done,
      );
      if (action)
        action.body.append(
          make(
            'p',
            '',
            event.take.mix
              ? `Mixed WAV saved · ${event.take.mix.durationSeconds.toFixed(1)}s · ${event.take.stems?.length || 1} aligned tracks`
              : 'Voice-only WAV saved.',
          ),
        );
    }
    if (event.type === 'tool-end') {
      const action = actions.findLast((a) => a.tool === event.tool && !a.done);
      if (!action) return;
      action.done = true;
      action.item.className = `agent-action ${event.ok ? 'done' : 'failed'}`;
      action.tag.textContent = event.cached
        ? 'Reused'
        : event.ok
          ? 'Done'
          : event.tool === 'save_script'
            ? 'Needs revision'
            : 'Failed';
      if (!event.ok) {
        action.details.open = true;
        action.body.append(make('p', '', event.error || 'Could not finish this action.'));
      }
      if (event.tool === 'create_production') finishStage(event.ok);
    }
    if (event.type === 'done') {
      const names = {
        rendered: 'Audio delivered',
        saved: 'Draft saved',
        researched: 'Research returned',
        incomplete: 'Needs attention',
        answered: 'Answered',
      };
      badge(
        names[event.outcome] || 'Reply finished',
        event.outcome === 'incomplete' ? 'failed' : 'done',
      );
      if (['rendered', 'saved'].includes(event.outcome))
        for (const action of actions) action.details.open = false;
    }
    if (event.type === 'error') {
      for (const action of actions.filter((a) => !a.done)) {
        action.item.className = 'agent-action failed';
        action.tag.textContent = 'Incomplete';
      }
      finishStage(false);
      badge('Incomplete', 'failed');
    }
  }
  return { process, reset };
}
