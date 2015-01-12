#!/usr/bin/env node

var Jetty = require('jetty');
var through = require('through');
var split = require('split');
var fs = require('fs');
var fuzmatch = require('fuzzy-matcher');
var TtyReader = require('tty').ReadStream;
var TtyWriter = require('tty').WriteStream;

function filterAll(key, lines) {
    var res = [];
    for (var k = 0; k < lines.length; ++k) {
        var l = lines[k], s = fuzmatch(key, l);
        if (s > 0) res.push({line:l, score: s});
    }
    return res.sort(byScoreReversed);
}
function byScoreReversed(item1, item2) {
    return item2.score - item1.score;
}


lines = [];
process.stdin.pipe(split()).pipe(through(function(l) {
    lines.push(l);
}, main));

function trim(txt) {
    return txt.substr(0, process.stdout.columns - 1);
}


function parseAnsi(d) {
    var args = d.slice(2).toString().split(';');
    var last = args[args.length - 1];
    var code = last[last.length - 1];
    last = last.slice(0, last.length - 1);
    args[args.length - 1] = last;
    return {args: args, code: code}
}

function main() {
    var search = '';

    var fd = fs.openSync('/dev/tty', 'r+');
    var ttyStream = new TtyReader(fd, {});
    var ttyout = new TtyWriter(fd, {});
    ttyStream.setRawMode(true);
    ttyStream.on('data', onInput);
    var draw = new Jetty(ttyStream);
    draw.getCursor()
    var selected = 0;
    var results = [];
    function onInput(d) {
        process.stdout.columns = ttyout.columns;
        process.stdout.rows = ttyout.rows;
        // this totally needs refactoring
        if (d[0] === 0x1b && d[1] === 0x5b) {
            var cmd = parseAnsi(d);
            if (cmd.code === 'R') {
                var scrollAmount = cmd.args[0] - process.stdout.rows + 20;
                draw.scrollDown(scrollAmount)
                    .lineUp(scrollAmount)
                    .clearLine(2).column(1)
            } else if (cmd.code == 'A') { // up
                selected -= 1;
                if (selected < 0)
                    selected = results.length - 1;
            } else if (cmd.code == 'B') { // down
                selected += 1;
                if (selected >= results.length)
                    selected = 0;
            }
        }
        else if (d[0] === 0x0D) { // CR
            if (results[selected]) {
                console.log(results[selected].line)
                process.exit();
            } else {
                process.exit(1)
            }
        }
        else if (d[0] === 3 || d[0] === 0x1b) // esc/^C
            process.exit(1);
        else {
            if (d[0] === 0x7F) //backspace
                search = search.slice(0, search.length - 1);
            else
                search += d;
            selected = 0;
            results = filterAll(search, lines).slice(0, 20);
        }
        for (var k = 0; k < 20; ++k) {
            draw.reset().lineDown(1);
            if (k === selected) draw.imageNegative();
            draw.clearLine(2)
            draw.text(k < results.length ? trim(results[k].line) : '');
        }
        draw.reset()
            .lineUp(20)
            .clearLine(2)
            .text(search);
    }
}

//main();
