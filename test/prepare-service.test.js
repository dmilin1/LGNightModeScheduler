'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const script = fs.readFileSync(path.join(__dirname, '../service/prepare-service.js'), 'utf8');
const ID = 'io.github.dmilin1.nightmodescheduler.service';

function run(options = {}) {
  const signals = [], exits = [], calls = [];
  const entries = options.entries || {};
  const context = {
    require(name) {
      if (name === 'child_process') return {execFile(helper, args, settings, callback) {
        calls.push({helper,args}); callback(options.elevationError || null, '', '');
      }};
      if (name === 'fs') return {
        readdirSync() { return Object.keys(entries); },
        readFileSync(file) {
          const [, pid, kind] = /^\/proc\/(\d+)\/(cmdline|status)$/.exec(file);
          const entry = entries[pid];
          if (entry.disappeared) throw Object.assign(new Error('exited'), {code:'ENOENT'});
          return kind === 'cmdline' ? entry.title + '\0' : 'Uid:\t' + entry.uid + '\t' + entry.euid + '\t' + entry.euid + '\t' + entry.euid;
        }
      };
      throw Error(name);
    },
    process: {pid:101, getuid:()=>options.uid === undefined ? 0 : options.uid,
      kill:(pid,signal)=>signals.push({pid,signal}), exit:code=>exits.push(code), stdout:{write(){}}},
    console: {log(){},error(){}},
    setTimeout(callback) {callback();}
  };
  vm.runInNewContext(script, context);
  return {signals, exits, calls};
}
test('upgrade preparation stops only this exact service with a non-root effective UID', () => {
  const result = run({entries:{
    101:{title:ID,uid:1000,euid:1000}, // never stop this helper
    102:{title:ID,uid:0,euid:0}, // healthy root service
    103:{title:ID,uid:6549,euid:6549}, // stale jailed service
    104:{title:'lginput2',uid:1000,euid:1000}, // unrelated TV input process
    105:{title:ID+'.other',uid:1000,euid:1000}, // prefix matching is unsafe
    106:{disappeared:true},
    107:{title:ID,uid:0,euid:6549} // effective UID governs access
  }});
  assert.deepEqual(result.signals,[{pid:103,signal:'SIGTERM'},{pid:107,signal:'SIGTERM'}]);
  assert.deepEqual(result.exits,[0]);
  assert.equal(result.calls.length,1);
  assert.equal(result.calls[0].args[0],ID);
});
test('elevation failure never stops a running service', () => {
  const result=run({elevationError:Error('denied'),entries:{103:{title:ID,uid:6549,euid:6549}}});
  assert.deepEqual(result.signals,[]);assert.deepEqual(result.exits,[1]);
});
test('preparation refuses to run without root', () => {
  const result=run({uid:6549});
  assert.deepEqual(result.signals,[]);assert.deepEqual(result.calls,[]);assert.deepEqual(result.exits,[1]);
});
