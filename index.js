'use strict';

var utils = require('./pouch-utils');
var events = require('events');

// Note: using retry ideas similar to npm-browser (https://github.com/pouchdb/npm-browser)
var STARTING_RETRY_TIMEOUT = 1000;
var MAX_TIMEOUT = 300000; // 5 mins
var BACKOFF = 1.1;

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function merge(obj1, obj2) {
  var merged = {}, i;
  /* istanbul ignore next */
  if (obj1) {
    for (i in obj1) {
      merged[i] = obj1[i];
    }
  }
  /* istanbul ignore next */
  if (obj2) {
    for (i in obj2) {
      merged[i] = obj2[i];
    }
  }
  return merged;
}

// Supported options:
//  url, startingTimeout, maxTimeout, backoff, manual
//  changes.opts
//  to.url, to.onErr, to.listeners, to.opts
//  from.url, from.onErr, from.listeners, from.opts

exports.persist = function (opts) {
  var db = this;

  var per = new events.EventEmitter();

  per.TO = 1;
  per.FROM = 2;
  per.BOTH = 3;

  per.opts = { changes: {}, to: {}, from: {} }; // init to prevent undefined errors
  per.config = function (opts) {
    for (var i in opts) {
      per.opts[i] = opts[i];
    }
  };
  if (opts) {
    per.config(opts);
  }

  per.startingTimeout = opts && opts.startingTimeout ? opts.startingTimeout: STARTING_RETRY_TIMEOUT;
  per.maxTimeout = opts && opts.maxTimeout ? opts.maxTimeout: MAX_TIMEOUT;
  per.backoff = opts && opts.backoff ? opts.backoff : BACKOFF;
  per.connected = false;

  var vars = {
    retryTimeout: per.startingTimeout,
    replicating: false,
    connected: false
  };

  var state = {}, replicating = false;
  state[per.TO] = vars;
  state[per.FROM] = clone(vars);

  function setup() {
    return db.info().then(function (info) {
      var d = per.opts.changes,
          opts = { since: info.update_seq, live: true };
      if (d.opts) {
        opts = merge(opts, d.opts);
      }
      per.changes = db.changes(opts);
    });
  }

  function addListeners(emitter, listeners) {
    listeners.forEach(function (listener) {
      var fn = emitter[listener['method']];
      fn.call(emitter, listener['event'], listener['listener']);
    });
  }

  // TODO: override window.XMLHttpRequest to test the following
  /* istanbul ignore next */
  function backoff(retryTimeout) {
    return Math.min(per.maxTimeout, Math.floor(retryTimeout * per.backoff)); // exponential backoff
  }

  function disconnect() {
    per.connected = false;
    per.emit('disconnect');
  }

  // TODO: override window.XMLHttpRequest to test the following
  /* istanbul ignore next */
  function onError(err, direction) {
    if (err.status === 405) { // unknown error
      var s = state[direction];
      s.connected = false;
      s.retryTimeout = backoff(s.retryTimeout);
      setTimeout(direction === per.TO ? replicateTo : replicateFrom, s.retryTimeout);
      if (per.connected) {
        disconnect();
      }
    }
  }

  function connect() {
    per.connected = true;
    per.emit('connect');
  }

  function onConnect(direction) {
    var s = state[direction];
    s.connected = true;
    s.retryTimeout = per.startingTimeout;
    removeConnectListeners(direction);
    if (state[per.TO].connected && state[per.FROM].connected) {
      connect();
    }
  }

  function removeConnectListeners(direction) {
    var emitter = direction === per.TO ? per.to : per.from;
    var connectListener = state[direction].connectListener;
    emitter.removeListener('change', connectListener);
    emitter.removeListener('complete', connectListener);
    emitter.removeListener('uptodate', connectListener);
  }

  function registerListeners(emitter, direction, listeners) {

    // TODO: override window.XMLHttpRequest to test the following
    /* istanbul ignore next */
    emitter.on('error', function (err) {
      onError(err, direction);
    });

    state[direction].connectListener = function () {
      onConnect(direction);
    };
    var connectListener = state[direction].connectListener;
    emitter.once('change', connectListener)
           .once('complete', connectListener)
           .once('uptodate', connectListener);

    if (listeners) {
      addListeners(emitter, listeners);
    }
  }

  function replicate(direction) {
    var d = direction === per.TO ? per.opts.to : per.opts.from,
        method = direction === per.TO ? db.replicate.to : db.replicate.from;

    var opts = { live: true }, url = d.url ? d.url : per.opts.url;

    if (d.opts) {
      opts = merge(opts, d.opts);
    }

    if (direction === per.TO) {
      cancelTo();
    } else {
      cancelFrom();
    }

    var emitter = method(url, opts, d.onErr);

    if (direction === per.TO) {
      per.to = emitter;
    } else {
      per.from = emitter;
    }

    registerListeners(emitter, direction, d.listeners);
  }

  function replicateTo() {
    replicate(per.TO);
  }

  function replicateFrom() {
    replicate(per.FROM);
  }

  function startReplication(direction) {
    if (!state[per.TO].replicating && (direction === per.BOTH || direction === per.TO)) {
      state[per.TO].replicating = true;
      replicateTo();
    }
    if (!state[per.FROM].replicating && (direction === per.BOTH || direction === per.FROM)) {
      state[per.FROM].replicating = true;
      replicateFrom();
    }
  }

  per.start = function (direction) {
    direction = direction ? direction : per.BOTH;
    if (!replicating) {
      return setup().then(function () {
        replicating = true;
        startReplication(direction);
      });
    } else {
      return new utils.Promise(function () {
        startReplication(direction);
      });
    }
  };

  function cancelChanges() {
    if (per.changes) {
      per.changes.cancel();
    }
  }

  function cancelTo() {
    if (per.to) {
      per.to.cancel();
    }
  }

  function cancelFrom() {
    if (per.from) {
      per.from.cancel();
    }
  }

  per.cancel = function () {
    cancelChanges();
    cancelTo();
    cancelFrom();
  };

  per.stop = function (direction) {
    direction = direction ? direction : per.BOTH;
    if (direction === per.BOTH || direction === per.TO) {
      state[per.TO].replicating = false;
      state[per.TO].connected = false;
      cancelTo();
    }
    if (direction === per.BOTH || direction === per.FROM) {
      state[per.FROM].replicating = false;
      state[per.FROM].connected = false;
      cancelFrom();
    }
    if (!state[per.TO].replicating && !state[per.FROM].replicating) {
      cancelChanges();
    }
    disconnect();
  };

  if (opts && !opts.manual) {
    per.start();
  }

  return per;
};

/* istanbul ignore next */
if (typeof window !== 'undefined' && window.PouchDB) {
  window.PouchDB.plugin(exports);
}
