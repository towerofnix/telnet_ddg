'use strict';

const net = require('net');
const request = require('request');
const jsdom = require('jsdom');
const wordwrap = require('wordwrap');

const port = process.argv[2] || 9444;
console.log(`Starting server on port ${port}...`);

function getResultData(result, window) {
  const $result = window.$(result);
  const href = $result.find('.result__a').prop('href');
  const title = $result.find('.result__title').text().trim();
  const snippet = $result.find('.result__snippet').text().trim();
  return {href, title, snippet};
}

function showResults(results, window, socket) {
  results.each(function(i) {
    const {title, href} = getResultData(this, window);
    const string = `(${i}) \x1b[1m${title} \x1b[2m${href}`;
    const end = '\x1b[0m\n';
    if (string.length >= 80) {
      socket.write(string.slice(0, 77) + '...' + end);
    } else {
      socket.write(string + end);
    }
  });
  socket.write('Type a number to access one of the results.\n');
}

const server = net.createServer(function(socket) {
  const msg = ('\x1b[1mDuckDuckGo at your telnet command line\x1b[0m\n' +
               '..well, not officially, but who cares?\n\n' +
               'Use \x1b[36m.exit\x1b[0m to exit. You could also use your ' +
               'telnet escape code.\nMore commands: \x1b[36m.help\x1b[0m\n' +
               '\x1b[2m------\x1b[0m\n');
  const wrap = wordwrap(75);
  let lastResults;
  let lastResultsWindow;
  socket.write(msg);
  socket.on('data', function(data) {
    let query = data.toString().trim();

    if (query === '') {
      socket.write('\x1b[31mBut you didn\'t enter a query..\x1b[0m\n');
      return;
    }

    if (query === '.' || query === '.help') {
      socket.write('List of commands:\n' +
                   '\x1b[36m.exit\x1b[0m Exits the DuckDuckGo terminal search.\n' +
                   '\x1b[36m.ls\x1b[0m List the search results.\n' +
                   '\x1b[36m.help\x1b[0m Show this help.\x1b[0m\n');
      return;
    }

    if (query === '.ls') {
      if (!lastResults) {
        socket.write('\x1b[31mBut you haven\'t searched anything..\n');
        return;
      }
      showResults(lastResults, lastResultsWindow, socket);
    }

    if (query === '.exit' || query.indexOf(String.fromCharCode(4)) > -1 /*^D*/ ||
        query.indexOf(String.fromCharCode(65533)) > -1 /*^C*/) {
      socket.write('\x1b[32mGoodbye!\x1b[0m\n');
      socket.end();
      return;
    }

    if (!isNaN(query)) {
      if (!lastResults) {
        socket.write('\x1b[31mBut you haven\'t searched anything..\n' +
                     `Type "\\${query}" to use that as your query.\x1b[0m\n`);
        return;
      }
      const num = parseFloat(query);
      if (!lastResults.hasOwnProperty(num)) {
        socket.write('\x1b[31mBut there isn\'t such a result index...\n' +
                     `Type "\\${query}" to use that as your query.\x1b[0m\n`);
        return;
      }
      const {title, href, snippet} = getResultData(lastResults[num], lastResultsWindow);
      socket.write(`\x1b[1m${wrap(title)}\x1b[0m\n${wrap(snippet)}\n` +
                   `\x1b[36m${href}\x1b[0m\n`);
      return;
    }

    if (query[0] === '\\' && !isNaN(query.slice(1))) {
      query = query.slice(1);
    }

    socket.write(`Searching for "${query}"...\n`);

    request.post(
      'https://duckduckgo.com/html/',
      {
        form: {q: query}
      },
      function(error, response, body) {
        if (error) return console.error('Error in request:', error);
        jsdom.env(
          body,
          ['http://code.jquery.com/jquery.js'],
          function(error, window) {
            if (error) {
              return console.error('Error in jsdom:', error);
            }

            lastResultsWindow = window;
            lastResults = window.$('.result__body').slice(0, 10);
            showResults(lastResults, window, socket);
          }
        );
      }
    );
  });
});

server.listen(port);
