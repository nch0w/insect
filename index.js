#!/usr/bin/env node

var os = require("os");
var path = require("path");
var Insect = require('./output/Insect/index.js');

var insectEnv = Insect.initialEnvironment;

function usage() {
  console.log("Usage:  insect [EXPR]");
  process.exit(1);
}

function runInsect(fmt, line) {
  var lineTrimmed = line.trim();
  if (lineTrimmed === "" || lineTrimmed[0] === "#") {
    return undefined;
  }

  // Run insect
  var res = Insect.repl(fmt)(insectEnv)(line);

  // Update environment
  insectEnv = res.newEnv;

  return res;
}

// Handle command line arguments
if (process.argv.length >= 4) {
  usage();
} else if (process.argv.length == 3) {
  var arg = process.argv[2];
  if (arg === "-h" || arg === "--help") {
    usage();
  } else {
    // Execute a single command
    var res = runInsect(Insect.fmtPlain, arg);
    if (res.msgType === "value" || res.msgType === "info") {
      console.log(res.msg);
    } else if (res.msgType === "error") {
      console.error(res.msg);
    }
    process.exit(0);
  }
}

if (process.env.INSECT_NO_RC !== "true") {
  var lineReader = require("line-reader");
  var rcFile = path.join(os.homedir(), ".insectrc");
  lineReader.eachLine(rcFile, function (line) {
    var res = runInsect(Insect.fmtPlain, line);
    // We really only care when it breaks
    if (res && res.msgType === "error") {
      console.error(res.msg);
      process.exit(1);
    }
  }, function (err) {
    // If the file doesn't exist, that's fine
    if (err && err.code !== "ENOENT") {
      throw err;
    } else {
      startInsect();
    }
  });
} else {
  startInsect();
}

function startInsect() {
  var interactive = process.stdin.isTTY;

  if (interactive) {
    var readline = require('historic-readline');
    var xdgBasedir = require('xdg-basedir');
    var path = require('path');
    var clipboardy = require('clipboardy');

    // Set up REPL
    var rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      path: path.join(xdgBasedir.data, "insect-history"),
      completer: function(line) {
        var identifiers = Insect.identifiers(insectEnv);

        var keywords =
          identifiers.concat(Insect.functions(insectEnv))
                     .concat(Insect.supportedUnits)
                     .concat(Insect.commands);

        var lastWord = line;
        if (line.trim() !== "") {
          var words = line.split(/\b/);
          lastWord = words[words.length - 1];
          keywords = keywords.filter(function(kw) {
            return kw.indexOf(lastWord) === 0;
          });
        }

        return [keywords, lastWord];
      },
      next: function(rl) {
        var prompt = '\x1b[01m>>>\x1b[0m ';

        // The visual length of the prompt (4) needs to be set explicitly for
        // older versions of node:
        rl.setPrompt(prompt, 4);

        rl.prompt();

        rl.on('line', function(line) {
          var res = runInsect(Insect.fmtConsole, line);

          if (res) {
            if (res.msgType == "quit") {
              process.exit(0);
            } else if (res.msgType == "clear") {
              process.stdout.write('\x1Bc');
            } else if (res.msgType == "copy") {
              if (res.msg == "") {
                console.log("\nNo result to copy.\n");
              } else {
                clipboardy.writeSync(res.msg);
                console.log("\nCopied result '" + res.msg + "' to clipboard.\n");
              }
            } else {
              console.log(res.msg + "\n");
            }
          }

          rl.prompt();
        }).on('close', function() {
          process.exit(0);
        });
      }
    });
  } else {
    // Read from non-interactive stream (shell pipe)

    if (typeof lineReader === "undefined") {
      var lineReader = require("line-reader");
    }
    lineReader.eachLine(process.stdin, function(line) {
      var res = runInsect(Insect.fmtPlain, line);
      if (res) {
        // Only output values and halt on errors. Ignore 'info' and 'value-set'
        // message types.
        if (res.msgType === "value") {
          console.log(res.msg);
        } else if (res.msgType == "error") {
          console.error(res.msg);
          process.exit(1);
        } else if (res.msgType == "quit") {
          process.exit(0);
        }
      }
    });
  }
}
