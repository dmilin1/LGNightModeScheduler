(function () {
  'use strict';
  var SERVICE = 'luna://io.github.dmilin1.nightmodescheduler.service/';
  var pending = {}, requestId = 0, state = null, draft = null, dirty = false, ready = false, busy = false;
  var preview = !window.PalmServiceBridge;
  function $(id) { return document.getElementById(id); }
  function text(id, value) { $(id).textContent = value; }
  function copy(value) { return JSON.parse(JSON.stringify(value)); }
  function call(uri, payload) {
    if (preview) return demoCall(uri, payload);
    return new Promise(function (resolve, reject) {
      var id = ++requestId, bridge = new PalmServiceBridge(), done = false;
      pending[id] = bridge;
      var timer = setTimeout(function () { finish(new Error('TV service timed out. Try opening the app again.')); }, 12000);
      function finish(error, data) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        bridge.cancel();
        delete pending[id];
        if (error) reject(error); else resolve(data);
      }
      bridge.onservicecallback = function (raw) {
        try {
          var result = JSON.parse(raw);
          if (result.returnValue === false || result.errorCode) finish(new Error(result.errorText || 'TV request failed.'));
          else finish(null, result);
        } catch (error) { finish(error); }
      };
      bridge.call(uri, JSON.stringify(payload || {}));
    });
  }
  function api(method, payload) { return call(SERVICE + method, payload).then(function (result) { return result.status; }); }
  function timeLabel(value) {
    var parts = value.split(':'), hour = Number(parts[0]);
    return (hour % 12 || 12) + ':' + parts[1] + (hour >= 12 ? ' PM' : ' AM');
  }
  function dateLabel(value) { return new Date(value).toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'}); }
  function error(err) { $('error').hidden = false; text('error', err.message || String(err)); }
  function clearError() { $('error').hidden = true; }
  function notice(message) { text('notice', message); }
  function renderDraft() {
    if (!draft) return;
    ['enabled', 'manageBrightness'].forEach(function (id) { $(id).setAttribute('aria-checked', String(draft[id])); });
    text('start', timeLabel(draft.start)); text('end', timeLabel(draft.end));
    text('nightBrightness', draft.nightBrightness); text('dayBrightness', draft.dayBrightness);
    $('brightness-settings').hidden = !draft.manageBrightness;
    $('save').disabled = !dirty || busy; $('discard').disabled = !dirty || busy;
  }
  function render(next) {
    if (!next) return;
    state = next;
    if (!dirty) draft = copy(state.config);
    var actual = state.actual || {}, blue = actual.eyeComfortMode === 'on';
    var known = actual.eyeComfortMode === 'on' || actual.eyeComfortMode === 'off';
    text('blue-toggle', known ? blue ? 'On' : 'Off' : '—');
    $('blue-toggle').setAttribute('aria-checked', String(blue));
    // Busy requests are guarded by action(); leave the focused switch enabled.
    $('blue-toggle').disabled = !known;
    var level = actual.backlight;
    var validLevel = level !== '' && level !== null && level !== undefined && isFinite(Number(level));
    text('currentBrightness', validLevel ? level : '—');
    $('dim-now').disabled = !validLevel || Number(level) <= 0;
    $('brighten-now').disabled = !validLevel || Number(level) >= 100;
    var override = state.override && state.override.until > state.localTime;
    $('resume').disabled = !state.config.enabled || !override || busy;
    $('autostart').setAttribute('aria-checked', String(state.autostartEnabled));
    text('control-status', !state.config.enabled ? 'Schedule paused. Manual controls are available.' : override ? 'Manual until ' + dateLabel(state.override.until) : 'Following schedule');
    text('next-change', !state.config.enabled ? 'Paused' : 'Next change: blue light ' + (state.nextChange.night ? 'on' : 'off') + ' at ' + dateLabel(state.nextChange.at));
    var dimension = actual.dimension || {};
    var input = /^hdmi[1-4]/.test(dimension.input || '') ? dimension.input.replace(/^hdmi([1-4])/, 'HDMI $1').replace('_pc', ' (PC)') : 'Current input';
    var mode = dimension.pictureMode === 'normal' ? 'Standard' : dimension.pictureMode ? dimension.pictureMode.charAt(0).toUpperCase() + dimension.pictureMode.slice(1) : '';
    text('picture-mode', known ? input + (mode ? ' · ' + mode : '') : 'Reading the TV’s settings…');
    text('clock', dateLabel(state.localTime));
    text('connection', preview ? 'Simulated TV' : 'Connected');
    $('health-dot').classList.toggle('good', !state.error);
    if (state.error) error(new Error(state.error));
    renderDraft();
  }
  function change() { dirty = true; renderDraft(); notice('Unsaved changes. Save to apply your schedule.'); }
  function action(job, message) {
    if (busy || !ready) return;
    var focusBefore = document.activeElement;
    busy = true; document.body.classList.add('busy'); clearError();
    render(state);
    job().then(function (result) { render(result); notice(message); }).catch(error).then(function () {
      busy = false; document.body.classList.remove('busy'); render(state);
      // Disabling a focused button blurs it on webOS. Restore it after the
      // request, unless the viewer has moved focus elsewhere in the meantime.
      var active = document.activeElement;
      if (focusBefore && focusBefore.tagName === 'BUTTON' &&
          (active === document.body || active === document.documentElement || active === focusBefore)) {
        var target = focusBefore;
        if (target.disabled) {
          if (target.id === 'dim-now') target = $('brighten-now');
          else if (target.id === 'brighten-now') target = $('dim-now');
          else if (target.id === 'save' || target.id === 'discard') target = $('enabled');
          else target = $('blue-toggle');
        }
        if (!target.disabled) target.focus();
      }
    });
  }
  function poll() {
    if (!ready || busy || document.hidden) return;
    api('getStatus').then(render).catch(error);
  }
  function bootstrap() {
    clearError(); text('connection', 'Starting background service…');
    var begin = preview ? Promise.resolve() : call('luna://org.webosbrew.hbchannel.service/getConfiguration', {}).then(function (config) {
      if (!config.root) throw new Error('Homebrew Channel needs root access. Open Homebrew Channel and check its root status.');
      text('connection', 'Preparing TV permissions…');
      return call('luna://org.webosbrew.hbchannel.service/exec', {command: '/media/developer/apps/usr/palm/services/org.webosbrew.hbchannel.service/elevate-service io.github.dmilin1.nightmodescheduler.service'}).then(function (result) {
        if (result.code && result.code !== 0) throw new Error('Service elevation failed: ' + (result.stderrString || result.stdoutString || result.code));
      });
    });
    function start(attempt) {
      return api('start').catch(function (err) {
        if (attempt >= 3) throw err;
        text('connection', 'Waiting for the TV service… (' + attempt + '/3)');
        return new Promise(function (resolve) { setTimeout(resolve, 1500); }).then(function () { return start(attempt + 1); });
      });
    }
    begin.then(function () { return start(1); }).then(function (result) {
      render(result);
      // First launch enables boot startup. Later launches preserve the user's choice.
      if (!result.autostartConfigured) return api('setAutostart', {enabled: true});
      return result;
    }).then(function (result) {
      ready = true; render(result); clearError();
      notice(preview ? 'Preview only. Changes affect simulated settings.' : 'Arrows to move · OK to select · Back to close');
      $('blue-toggle').focus();
    }).catch(function (err) { error(err); text('connection', 'Setup needs attention'); });
  }
  document.addEventListener('click', function (event) {
    var target = event.target;
    while (target && target.tagName !== 'BUTTON') target = target.parentElement;
    if (!target || target.disabled || !ready || busy) return;
    var key = target.getAttribute('data-config');
    if (key) { draft[key] = !draft[key]; change(); return; }
    key = target.getAttribute('data-time');
    if (key) {
      var parts = draft[key].split(':'), value = (Number(parts[0]) * 60 + Number(parts[1]) + Number(target.getAttribute('data-step')) + 1440) % 1440;
      draft[key] = ('0' + Math.floor(value / 60)).slice(-2) + ':' + ('0' + value % 60).slice(-2);
      change(); return;
    }
    key = target.getAttribute('data-brightness');
    if (key) { draft[key] = Math.max(0, Math.min(100, draft[key] + Number(target.getAttribute('data-step')))); change(); return; }
    if (target.id === 'discard') { dirty = false; draft = copy(state.config); renderDraft(); notice('Changes discarded.'); }
    if (target.id === 'save') {
      if (draft.start === draft.end) { error(new Error('Choose different start and end times.')); return; }
      var settings = copy(draft);
      action(function () { return api('saveConfig', {config: settings}).then(function (result) { dirty = false; return result; }); }, 'Schedule saved and applied.');
    }
    if (target.id === 'blue-toggle') action(function () { return api('setManual', {settings: {eyeComfortMode: state.actual.eyeComfortMode === 'on' ? 'off' : 'on'}}); }, 'Blue light setting updated.');
    if (target.id === 'resume') action(function () { return api('resumeSchedule'); }, 'Following your schedule again.');
    if (target.id === 'autostart') action(function () { return api('setAutostart', {enabled: !state.autostartEnabled}); }, 'Startup preference saved.');
    if (target.id === 'dim-now' || target.id === 'brighten-now') {
      var brightness = Math.max(0, Math.min(100, Number(state.actual.backlight) + (target.id === 'dim-now' ? -5 : 5)));
      action(function () { return api('setManual', {settings: {backlight: brightness}}); }, 'Pixel brightness updated.');
    }
  });
  // Spatial navigation works with IR remotes, Magic Remote arrows, and keyboards.
  document.addEventListener('keydown', function (event) {
    var code = event.keyCode;
    if (code === 461 || code === 27) {
      event.preventDefault();
      if (dirty) { dirty = false; draft = copy(state.config); renderDraft(); notice('Unsaved changes discarded. Press Back again to close.'); }
      else if (window.webOS && window.webOS.platformBack) window.webOS.platformBack();
      else if (window.PalmSystem && window.PalmSystem.platformBack) window.PalmSystem.platformBack();
      else window.close();
      return;
    }
    if (code === 13 && document.activeElement.tagName === 'BUTTON') { event.preventDefault(); document.activeElement.click(); return; }
    if (code < 37 || code > 40) return;
    event.preventDefault();
    var buttons = Array.prototype.slice.call(document.querySelectorAll('button:not(:disabled)')).filter(function (button) { return button.offsetWidth > 0; });
    var current = document.activeElement;
    if (buttons.indexOf(current) < 0) { if (buttons[0]) buttons[0].focus(); return; }
    var rect = current.getBoundingClientRect(), x = rect.left + rect.width / 2, y = rect.top + rect.height / 2, best = null, score = Infinity;
    buttons.forEach(function (button) {
      if (button === current) return;
      var r = button.getBoundingClientRect(), dx = r.left + r.width / 2 - x, dy = r.top + r.height / 2 - y;
      var primary = code === 37 ? -dx : code === 39 ? dx : code === 38 ? -dy : dy;
      var cross = code === 37 || code === 39 ? Math.abs(dy) : Math.abs(dx);
      if (primary <= 5) return;
      var distance = primary + cross * 3;
      if (distance < score) { score = distance; best = button; }
    });
    if (best) { best.focus(); best.scrollIntoView({block: 'nearest'}); }
  });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) poll(); });
  setInterval(poll, 5000);

  var demo = {
    config: {enabled: true, start: '21:00', end: '06:00', manageBrightness: false, nightBrightness: 100, dayBrightness: 100},
    actual: {eyeComfortMode: 'on', backlight: 100, dimension: {pictureMode: 'normal', input: 'hdmi1'}},
    autostartEnabled: true, autostartConfigured: true, override: null, error: null, version: '1.0.1'
  };
  function demoCall(uri, payload) {
    return new Promise(function (resolve) {
      setTimeout(function () {
        var method = uri.split('/').pop();
        if (method === 'saveConfig') { demo.config = copy(payload.config); demo.override = null; }
        if (method === 'setManual') {
          Object.keys(payload.settings).forEach(function (key) { demo.actual[key] = payload.settings[key]; });
          demo.override = {until: Date.now() + 3600000, source: 'App'};
        }
        if (method === 'resumeSchedule') demo.override = null;
        if (method === 'setAutostart') demo.autostartEnabled = payload.enabled;
        demo.localTime = Date.now(); demo.lastChecked = demo.localTime;
        var next = new Date(); next.setHours(21, 0, 0, 0); if (next.getTime() <= Date.now()) next.setDate(next.getDate() + 1);
        demo.nextChange = demo.config.enabled ? {at: next.getTime(), night: true} : null;
        resolve({returnValue: true, status: copy(demo)});
      }, 100);
    });
  }
  bootstrap();
}());
