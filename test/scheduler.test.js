'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {Scheduler, defaults, validate, isNight, nextBoundary} = require('../service/scheduler');
function config(changes) { return Object.assign({}, defaults, changes); }
function at(hour, minute = 0, day = 8) { return new Date(2026, 10, day, hour, minute); }
function fixture(options = {}) {
  let now = options.now || at(20), actual = Object.assign({eyeComfortMode: 'off', backlight: 73, dimension: {input: 'hdmi1', pictureMode: 'normal'}}, options.actual);
  let saved = options.saved || null, writes = [], failWrite = false, ignoreWrite = false;
  const scheduler = new Scheduler({clock: () => now, delay: () => Promise.resolve(), store: {
    load: () => saved,
    save: value => { saved = JSON.parse(JSON.stringify(value)); }
  }, driver: {
    read: () => Promise.resolve(JSON.parse(JSON.stringify(actual))),
    write: value => {
      writes.push(value);
      if (failWrite) return Promise.reject(new Error('Write rejected'));
      if (!ignoreWrite) Object.assign(actual, value);
      return Promise.resolve();
    }
  }});
  return {scheduler, writes, get actual() { return actual; }, get saved() { return saved; },
    time: value => { now = value; }, external: value => Object.assign(actual, value),
    fail: value => { failWrite = value; }, ignore: value => { ignoreWrite = value; }};
}
test('overnight defaults use exact inclusive start and exclusive end', () => {
  assert.equal(isNight(defaults, at(20, 59)), false);
  assert.equal(isNight(defaults, at(21)), true);
  assert.equal(isNight(defaults, at(0)), true);
  assert.equal(isNight(defaults, at(5, 59)), true);
  assert.equal(isNight(defaults, at(6)), false);
  assert.equal(nextBoundary(defaults, at(21)).at, at(6, 0, 9).getTime());
});
test('same-day and midnight schedules work', () => {
  const c = config({start: '09:00', end: '17:00'});
  assert.equal(isNight(c, at(8, 59)), false);
  assert.equal(isNight(c, at(9)), true);
  assert.equal(isNight(c, at(17)), false);
  assert.equal(isNight(config({start: '00:00'}), at(0)), true);
});
test('invalid times, booleans, equal endpoints and brightness are rejected', () => {
  for (const patch of [{start: '25:00'}, {start: '9:00'}, {end: '21:00'}, {enabled: 1}, {nightBrightness: ''}, {dayBrightness: 101}, {nightBrightness: 0.5}]) {
    assert.throws(() => validate(config(patch)));
  }
  assert.equal(validate(config({nightBrightness: 0})).nightBrightness, 0);
});
test('startup catches up and repeated polling never toggles or rewrites', async () => {
  const f = fixture({now: at(23)});
  await f.scheduler.tick(true);
  assert.equal(f.actual.eyeComfortMode, 'on');
  assert.equal(f.actual.backlight, 73);
  assert.deepEqual(f.writes, [{eyeComfortMode: 'on'}]);
  await f.scheduler.tick(false);
  assert.equal(f.writes.length, 1);
});
test('morning restores 100 as a number when brightness scheduling is enabled', async () => {
  const f = fixture({now: at(23), saved: {config: config({manageBrightness: true, nightBrightness: 0})}});
  await f.scheduler.tick(true);
  assert.equal(f.actual.backlight, 0);
  f.time(at(6, 0, 9));
  await f.scheduler.tick(false);
  assert.equal(f.actual.backlight, 100);
  assert.equal(f.actual.eyeComfortMode, 'off');
});
test('manual changes survive polling and end at the next transition', async () => {
  const f = fixture({now: at(22)});
  await f.scheduler.tick(true);
  await f.scheduler.setManual({eyeComfortMode: 'off', backlight: 45});
  await f.scheduler.tick(false);
  assert.equal(f.actual.eyeComfortMode, 'off');
  assert.equal(f.actual.backlight, 45);
  assert.equal(f.scheduler.status().override.until, at(6, 0, 9).getTime());
  f.time(at(6, 0, 9)); await f.scheduler.tick(false);
  assert.equal(f.scheduler.status().override, null);
  assert.equal(f.actual.backlight, 45); // unmanaged brightness is never reset
});
test('external remote script changes are adopted rather than immediately fought', async () => {
  const f = fixture({now: at(22)});
  await f.scheduler.tick(true);
  f.external({eyeComfortMode: 'off'});
  f.time(at(22, 1)); await f.scheduler.tick(false);
  assert.equal(f.actual.eyeComfortMode, 'off');
  assert.equal(f.scheduler.status().override.source, 'TV or remote');
  await f.scheduler.resume();
  assert.equal(f.actual.eyeComfortMode, 'on');
});
test('disabled schedule leaves both settings alone across time boundaries', async () => {
  const f = fixture({now: at(23), saved: {config: config({enabled: false, manageBrightness: true, nightBrightness: 0})}});
  await f.scheduler.tick(true);
  assert.equal(f.writes.length, 0);
  assert.equal(f.scheduler.status().nextChange, null);
  await f.scheduler.setManual({eyeComfortMode: 'on'});
  f.time(at(7, 0, 9)); await f.scheduler.tick(false);
  assert.equal(f.actual.eyeComfortMode, 'on');
});
test('write failures are reported, do not poison queue, and retry successfully', async () => {
  const f = fixture({now: at(23)}); f.fail(true);
  await assert.rejects(f.scheduler.tick(true), /Write rejected/);
  assert.equal(f.scheduler.status().error, 'Write rejected');
  f.fail(false); await f.scheduler.tick(false);
  assert.equal(f.actual.eyeComfortMode, 'on');
  assert.equal(f.scheduler.status().error, null);
});
test('false success from settings API fails readback verification', async () => {
  const f = fixture({now: at(23)}); f.ignore(true);
  await assert.rejects(f.scheduler.tick(true), /did not retain/);
});
test('new input uses scheduled settings instead of creating a manual override', async () => {
  const f = fixture({now: at(23), saved: {config: config({manageBrightness: true, nightBrightness: 25})}});
  await f.scheduler.tick(true);
  f.time(at(23, 1));
  f.external({eyeComfortMode: 'on', backlight: 100, dimension: {input: 'hdmi2', pictureMode: 'game'}});
  await f.scheduler.tick(false);
  assert.equal(f.actual.backlight, 25);
  assert.equal(f.scheduler.status().override, null);
});
test('saved manual override survives restart, expired override does not', async () => {
  const f = fixture({now: at(22)}); await f.scheduler.tick(true);
  await f.scheduler.setManual({eyeComfortMode: 'off'});
  const restored = fixture({now: at(23), saved: f.saved});
  await restored.scheduler.tick(true); assert.equal(restored.actual.eyeComfortMode, 'off');
  const expired = fixture({now: at(22, 0, 9), saved: f.saved});
  await expired.scheduler.tick(true); assert.equal(expired.actual.eyeComfortMode, 'on');
});
test('saving new schedule clears override and applies immediately', async () => {
  const f = fixture({now: at(20)}); await f.scheduler.tick(true);
  await f.scheduler.setManual({eyeComfortMode: 'off'});
  await f.scheduler.saveConfig(config({start: '19:00'}));
  assert.equal(f.actual.eyeComfortMode, 'on');
  assert.equal(f.scheduler.status().override, null);
});
test('invalid manual brightness never reaches hardware', async () => {
  const f = fixture();
  await assert.rejects(f.scheduler.setManual({backlight: ''}), /Brightness/);
  await assert.rejects(f.scheduler.setManual({backlight: 101}), /Brightness/);
  assert.equal(f.writes.length, 0);
});
test('simultaneous controls are serialized and retain final command', async () => {
  const f = fixture();
  await Promise.all([f.scheduler.setManual({eyeComfortMode: 'on'}), f.scheduler.setManual({eyeComfortMode: 'off'})]);
  assert.equal(f.actual.eyeComfortMode, 'off');
  assert.equal(f.scheduler.status().override.settings.eyeComfortMode, 'off');
});
test('clock moves backward safely and next boundary is always in the future', async () => {
  const f = fixture({now: at(23)}); await f.scheduler.tick(true);
  f.time(at(20)); await f.scheduler.tick(false);
  assert.equal(f.actual.eyeComfortMode, 'off');
  assert.ok(f.scheduler.status().nextChange.at > at(20).getTime());
});
