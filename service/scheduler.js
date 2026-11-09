'use strict';

var DEFAULTS = {
  enabled: true, start: '21:00', end: '06:00',
  manageBrightness: false, nightBrightness: 100, dayBrightness: 100
};

function validTime(value) {
  return typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}
function minutes(value) {
  var parts = value.split(':');
  return Number(parts[0]) * 60 + Number(parts[1]);
}
function brightness(value) {
  return typeof value === 'number' && isFinite(value) && Math.floor(value) === value && value >= 0 && value <= 100;
}
function validate(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('Invalid settings.');
  if (typeof config.enabled !== 'boolean' || typeof config.manageBrightness !== 'boolean') throw new Error('Switches must be on or off.');
  if (!validTime(config.start) || !validTime(config.end)) throw new Error('Use a valid 24-hour time.');
  if (config.start === config.end) throw new Error('Start and end times must be different.');
  if (!brightness(config.nightBrightness) || !brightness(config.dayBrightness)) throw new Error('Brightness must be a whole number from 0 to 100.');
  var clean = {};
  Object.keys(DEFAULTS).forEach(function (key) { clean[key] = config[key]; });
  return clean;
}
function isNight(config, now) {
  var current = now.getHours() * 60 + now.getMinutes();
  var start = minutes(config.start), end = minutes(config.end);
  return start < end ? current >= start && current < end : current >= start || current < end;
}
function nextBoundary(config, now) {
  var candidates = [];
  ['start', 'end'].forEach(function (key) {
    var parts = config[key].split(':');
    for (var day = 0; day <= 2; day++) {
      var date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + day, Number(parts[0]), Number(parts[1]), 0, 0);
      if (date.getTime() > now.getTime()) candidates.push({at: date.getTime(), night: key === 'start'});
    }
  });
  candidates.sort(function (a, b) { return a.at - b.at; });
  return candidates[0];
}
function same(actual, desired) {
  return Object.keys(desired).every(function (key) { return String(actual[key]) === String(desired[key]); });
}
function context(actual) { return JSON.stringify(actual.dimension || {}); }
function picture(actual) {
  return {eyeComfortMode: actual.eyeComfortMode, backlight: actual.backlight, dimension: actual.dimension};
}
function Scheduler(options) {
  this.driver = options.driver;
  this.store = options.store;
  this.clock = options.clock || function () { return new Date(); };
  this.delay = options.delay || function (ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); };
  var saved = this.store.load() || {};
  this.config = validate(Object.assign({}, DEFAULTS, saved.config || {}));
  this.override = saved.override || null;
  this.actual = null;
  this.error = null;
  this.lastApplied = null;
  this.previousTick = null;
  this.previousBoundary = null;
  this.previousOffset = null;
  this.queue = Promise.resolve();
}
Scheduler.prototype.persist = function () {
  this.store.save({config: this.config, override: this.override});
};
Scheduler.prototype.run = function (job) {
  var self = this;
  var pending = this.queue.then(function () { return job.call(self); });
  this.queue = pending.catch(function (err) { self.error = err.message; });
  return pending;
};
Scheduler.prototype.desired = function (night) {
  var value = {eyeComfortMode: night ? 'on' : 'off'};
  if (this.config.manageBrightness) value.backlight = night ? this.config.nightBrightness : this.config.dayBrightness;
  return value;
};
Scheduler.prototype.apply = function (actual, desired) {
  var self = this;
  if (same(actual, desired)) return Promise.resolve(actual);
  return this.driver.write(desired).then(function () {
    function verify(attempt) {
      return self.delay(200).then(function () { return self.driver.read(); }).then(function (readback) {
        if (context(actual) !== context(readback)) throw new Error('Input or picture mode changed. Try again.');
        if (same(readback, desired)) {
          self.lastApplied = self.clock().getTime();
          return readback;
        }
        if (attempt < 3) return verify(attempt + 1);
        throw new Error('The TV did not retain the requested picture settings.');
      });
    }
    return verify(1);
  });
};
Scheduler.prototype.tick = function (force) {
  var self = this;
  return this.run(function () {
    var now = self.clock(), next = nextBoundary(self.config, now);
    var wake = self.previousTick === null || now.getTime() - self.previousTick > 90000 || now.getTime() < self.previousTick;
    var boundaryChanged = self.previousBoundary !== next.at;
    var zoneChanged = self.previousOffset !== now.getTimezoneOffset();
    if (self.override && (self.override.until <= now.getTime() || zoneChanged && self.previousOffset !== null)) {
      self.override = null;
      self.persist();
    }
    return self.driver.read().then(function (actual) {
      var changedContext = self.actual && context(self.actual) !== context(actual);
      // Honor settings changed in LG's menus or by the remote script until the next boundary.
      if (self.config.enabled && self.actual && !force && !wake && !boundaryChanged && !zoneChanged && !changedContext) {
        var old = {eyeComfortMode: self.actual.eyeComfortMode};
        if (self.config.manageBrightness) old.backlight = self.actual.backlight;
        if (!same(actual, old)) {
          var settings = {eyeComfortMode: actual.eyeComfortMode};
          if (self.config.manageBrightness && brightness(Number(actual.backlight)) && actual.backlight !== '') settings.backlight = Number(actual.backlight);
          self.override = {settings: settings, until: next.at, source: 'TV or remote'};
          self.persist();
        }
      }
      var desired = self.override ? self.override.settings : self.desired(isNight(self.config, now));
      return self.config.enabled ? self.apply(actual, desired) : actual;
    }).then(function (actual) {
      self.actual = picture(actual);
      self.previousTick = now.getTime();
      self.previousBoundary = next.at;
      self.previousOffset = now.getTimezoneOffset();
      self.error = null;
      return self.status();
    });
  });
};
Scheduler.prototype.status = function () {
  var now = this.clock();
  return {
    config: Object.assign({}, this.config), actual: this.actual,
    override: this.override, nextChange: this.config.enabled ? nextBoundary(this.config, now) : null,
    localTime: now.getTime(), timezoneOffset: now.getTimezoneOffset(),
    lastApplied: this.lastApplied, lastChecked: this.previousTick, error: this.error
  };
};
Scheduler.prototype.saveConfig = function (config) {
  var clean = validate(config), self = this;
  return this.run(function () {
    self.config = clean;
    self.override = null;
    self.persist();
  }).then(function () { return self.tick(true); });
};
Scheduler.prototype.setManual = function (settings) {
  var self = this, clean = {};
  if (!settings || typeof settings !== 'object') return Promise.reject(new Error('Invalid manual settings.'));
  if (settings.eyeComfortMode !== undefined) {
    if (settings.eyeComfortMode !== 'on' && settings.eyeComfortMode !== 'off') return Promise.reject(new Error('Invalid blue light mode.'));
    clean.eyeComfortMode = settings.eyeComfortMode;
  }
  if (settings.backlight !== undefined) {
    if (!brightness(settings.backlight)) return Promise.reject(new Error('Brightness must be 0 to 100.'));
    clean.backlight = settings.backlight;
  }
  if (!Object.keys(clean).length) return Promise.reject(new Error('Choose a picture setting.'));
  return this.run(function () {
    return self.driver.read().then(function (actual) {
      return self.apply(actual, clean);
    }).then(function (actual) {
      var overrideSettings = {eyeComfortMode: actual.eyeComfortMode};
      if (self.config.manageBrightness || clean.backlight !== undefined) {
        if (actual.backlight !== '' && brightness(Number(actual.backlight))) overrideSettings.backlight = Number(actual.backlight);
      }
      self.override = {settings: overrideSettings, until: nextBoundary(self.config, self.clock()).at, source: 'App'};
      self.actual = picture(actual);
      self.persist();
      self.error = null;
      return self.status();
    });
  });
};
Scheduler.prototype.resume = function () {
  var self = this;
  return this.run(function () { self.override = null; self.persist(); }).then(function () { return self.tick(true); });
};

module.exports = {Scheduler: Scheduler, defaults: DEFAULTS, validate: validate, isNight: isNight, nextBoundary: nextBoundary};
