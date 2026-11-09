'use strict';
// Invoked by Homebrew Channel's root exec API before the UI calls our service.
var fs = require('fs');
var execFile = require('child_process').execFile;
var ID = 'io.github.dmilin1.nightmodescheduler.service';
var HELPER = '/media/developer/apps/usr/palm/services/org.webosbrew.hbchannel.service/elevate-service';

if (process.getuid() !== 0) {
  console.error('Service preparation needs Homebrew Channel root access.');
  process.exit(1);
} else {
  execFile(HELPER, [ID], {timeout: 20000}, function (error, stdout, stderr) {
    if (stdout) process.stdout.write(stdout);
    if (error) {
      console.error(stderr || error.message);
      process.exit(1);
      return;
    }
    // webOS can relaunch an old keep-alive service during installation, before
    // elevation. Its existing connection keeps its old jailed identity.
    // Stop ONLY this exact service title and ONLY if its effective UID is not 0.
    try {
      var stopped = false;
      fs.readdirSync('/proc').forEach(function (pid) {
        if (!/^\d+$/.test(pid) || Number(pid) === process.pid) return;
        try {
          var title = fs.readFileSync('/proc/' + pid + '/cmdline', 'utf8').split('\0')[0];
          if (title !== ID) return;
          var status = fs.readFileSync('/proc/' + pid + '/status', 'utf8');
          var uid = /^Uid:\s+\d+\s+(\d+)/m.exec(status);
          if (!uid || Number(uid[1]) === 0) return;
          process.kill(Number(pid), 'SIGTERM');
          stopped = true;
          console.log('Restarting the unelevated Night Mode Scheduler service.');
        } catch (err) {
          if (err.code !== 'ENOENT' && err.code !== 'ESRCH') throw err;
        }
      });
      // Let the old service release its bus name before the UI starts it again.
      if (stopped) setTimeout(function () { process.exit(0); }, 500);
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
  });
}
