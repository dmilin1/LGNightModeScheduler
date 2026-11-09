'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
test('default overnight window follows Pacific daylight-saving changes', () => {
  const script = `const {defaults,nextBoundary}=require('./service/scheduler');
    const spring=new Date(2026,2,7,21), fall=new Date(2026,9,31,21);
    console.log(JSON.stringify([nextBoundary(defaults,spring).at-spring.getTime(),nextBoundary(defaults,fall).at-fall.getTime()]));`;
  const hours = JSON.parse(execFileSync(process.execPath, ['-e', script], {
    cwd: require('node:path').resolve(__dirname,'..'), env: {...process.env, TZ: 'America/Los_Angeles'}, encoding:'utf8'
  })).map(ms=>ms/3600000);
  assert.deepEqual(hours, [8,10]);
});
