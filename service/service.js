'use strict';
var fs = require('fs');
var path = require('path');
var execFile = require('child_process').execFile;
var Service = require('webos-service');
var Scheduler = require('./scheduler').Scheduler;
var ID = 'io.github.dmilin1.nightmodescheduler.service';
var ROOT = '/home/root/.config/lgnightmodescheduler';
var FILE = ROOT + '/state.json';
var HOOK = '/var/lib/webosbrew/init.d/90-night-mode-scheduler';
var STARTUP_PREF = ROOT + '/startup-configured';
var service = new Service(ID);

function mkdir(dir) {
  if (fs.existsSync(dir)) return;
  mkdir(path.dirname(dir));
  try { fs.mkdirSync(dir, 448); } catch (err) { if (err.code !== 'EEXIST') throw err; }
}
function luna(uri, payload) {
  return new Promise(function (resolve, reject) {
    // On webOS 6 the picture API rejects the JS service's bus identity even
    // after elevation. The root-only luna-send client is supported on this TV.
    // execFile passes JSON as one literal argument; no shell is involved.
    execFile('/usr/bin/luna-send', ['-n', '1', '-w', '5000', uri, JSON.stringify(payload)], {timeout: 7000, maxBuffer: 65536}, function (error, stdout, stderr) {
      if (error) { reject(new Error('Picture request failed: ' + (stderr.trim() || error.message))); return; }
      try {
        var result = JSON.parse(stdout);
        if (result.returnValue !== true) throw new Error(result.errorText || 'Picture service rejected the request.');
        resolve(result);
      } catch (err) { reject(err); }
    });
  });
}
var store = {
  load: function () {
    if (!fs.existsSync(FILE)) return null;
    // Never replace a damaged settings file with silent defaults.
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  },
  save: function (data) {
    mkdir(ROOT);
    var temp = FILE + '.tmp';
    fs.writeFileSync(temp, JSON.stringify(data, null, 2) + '\n', {mode: 384});
    fs.renameSync(temp, FILE);
  }
};
var scheduler, startupError;
try {
  scheduler = new Scheduler({store: store, driver: {
    read: function () {
      return luna('luna://com.webos.settingsservice/getSystemSettings', {category: 'picture', keys: ['backlight', 'eyeComfortMode']}).then(function (result) {
        var settings = result.settings || {};
        if (settings.eyeComfortMode !== 'on' && settings.eyeComfortMode !== 'off') throw new Error('The TV did not return its blue light setting.');
        return {backlight: settings.backlight, eyeComfortMode: settings.eyeComfortMode, dimension: result.dimension};
      });
    },
    write: function (settings) {
      return luna('luna://com.webos.settingsservice/setSystemSettings', {category: 'picture', settings: settings});
    }
  }});
} catch (err) { startupError = err.message; }

function status(result) {
  try { fs.accessSync(HOOK, fs.constants.X_OK); result.autostartEnabled = true; }
  catch (err) { result.autostartEnabled = false; }
  result.autostartConfigured = fs.existsSync(STARTUP_PREF);
  result.version = require('./package.json').version;
  return result;
}
function register(name, callback) {
  service.register(name, function (message) {
    if (!scheduler) { message.respond({returnValue: false, errorText: startupError}); return; }
    Promise.resolve().then(function () { return callback(message.payload || {}); }).then(function (result) {
      message.respond({returnValue: true, status: status(result || scheduler.status())});
    }).catch(function (err) {
      console.error(name + ': ' + err.message);
      message.respond({returnValue: false, errorText: err.message});
    });
  });
}
register('start', function () { return scheduler.tick(true); });
register('getStatus', function () {
  return scheduler.tick(false).catch(function () { return scheduler.status(); });
});
register('saveConfig', function (payload) { return scheduler.saveConfig(payload.config); });
register('setManual', function (payload) { return scheduler.setManual(payload.settings); });
register('resumeSchedule', function () { return scheduler.resume(); });
register('setAutostart', function (payload) {
  if (typeof payload.enabled !== 'boolean') throw new Error('Choose whether to start at boot.');
  if (payload.enabled) {
    mkdir(path.dirname(HOOK));
    var target = path.join(__dirname, 'startup.sh');
    fs.chmodSync(target, 493);
    if (fs.existsSync(HOOK) || (function () { try { fs.lstatSync(HOOK); return true; } catch (e) { return false; } }())) fs.unlinkSync(HOOK);
    fs.symlinkSync(target, HOOK);
  } else if (fs.existsSync(HOOK)) fs.unlinkSync(HOOK);
  mkdir(ROOT);
  fs.writeFileSync(STARTUP_PREF, '1\n', {mode: 384});
  return scheduler.status();
});
// Keep the service alive after the settings app closes, as Homebrew Channel does.
service.activityManager.create('keepAlive', function () {});
if (scheduler) {
  scheduler.tick(true).catch(function (err) { console.error('Startup: ' + err.message); });
  setInterval(function () {
    scheduler.tick(false).catch(function (err) { console.error('Schedule: ' + err.message); });
  }, 10000);
}
