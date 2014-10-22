PouchDB Persist
=====

[![Build Status](https://travis-ci.org/redgeoff/pouchdb-persist.svg)](https://travis-ci.org/redgeoff/pouchdb-persist)

Persistent replication in PouchDB

Why?
----
The `replicate()` routines in PouchDB are not fault-tolerant and will stop replicating if there are any network disruptions. PouchDB Persist implements an exponential backoff routine that will keep retrying until your connection is restored.

Live Demo
----
[Demo](http://redgeoff.github.io/pouchdb-persist/examples/index.html)

Example 1
----

```js
var db = new PouchDB('todos');

// Instead of db.replicate()
var persist = db.persist({ url: 'http://localhost:5984/todos' });
```

This will automatically start the replication. 

Example 2
----

```js
var db = new PouchDB('todos');

var persist = db.persist({
  url: 'http://localhost:5984/todos',
  manual: true, // requires explict call to start replication
  to: {
    listeners: [{ method: 'on', event: 'uptodate', listener: function () {
      console.log('uptodate');
    }}]
  }
});

persist.on('connect', function () {
  console.log('connect');
});

persist.on('disconnect', function () {
  console.log('disconnect');
});

persist.start().then(function () {
  persist.stop().then(function () {
    persist.start();
  });
});

```

Usage
----

To use this plugin, include it after `pouchdb.js` in your HTML page:

```html
<script src="pouchdb.js"></script>
<script src="pouchdb-persist.js"></script>
```

You can install it via bower:

```
bower install pouchdb-persist
```

Or to use it in Node.js, just npm install it:

```
npm install pouchdb-persist
```

And then attach it to the `PouchDB` object:

```js
var PouchDB = require('pouchdb');
PouchDB.plugin(require('pouchdb-persist'));
```

API
----

**Create persistence**

```js
var persist = db.persist(opts);
```

where any of the options can be blank except the `url`. Here is an example:

```js
{
  url: 'http://localhost:5984/todos', // remote Couch URL
  maxTimeout: 60000, // max retry timeout, defaulted to 300000
  startingTimeout: 1000, // retry timeout, defaulted to 1000
  backoff: 1.1, // exponential backoff factor, defaulted to 1.1
  manual: false, // when true, start replication with start()
  changes: { // options for changes()
    opts: { live: true }
  },
  to: { // options for replicating to remote source
    opts: { live: true }, // replicate.to() options
    url: 'http://localhost:5984/todos', // remote URL
    onErr: function (err) { }, // error handler
    listeners: [{ method: 'once', event: 'uptodate', listener: function () { } }]
  },
  from: { // options for replicating from remote source
    opts: { live: true }, // replicate.from() options
    url: 'http://localhost:5984/todos', // remote URL
    onErr: function (err) { }, // error handler
    listeners: [{ method: 'once', event: 'uptodate', listener: function () { } }]
  }
}
```

**Start replication**

```js
persist.start([direction]);
```

where direction can be persist.BOTH, persist.TO or persist.FROM and is defaulted to persist.BOTH

**Stop replication**

```js
persist.stop([direction]);
```

where direction can be persist.BOTH, persist.TO or persist.FROM and is defaulted to persist.BOTH

**Listen for connect event**

```js
persist.on('connect', function () {
  console.log('connect');
});
```

Note: persist is also an [EventEmitter](https://www.npmjs.org/package/eventjs) and therefore has methods like `once`, `removeListener`, etc...

**Listen for disconnect event**

```js
persist.on('disconnect', function () {
  console.log('disconnect');
});
```

Running the included examples
----
Note: you must have couchdb installed and running and have Admin Party enabled

    npm install
    npm run dev

Visit the target example in your browser, e.g. http://127.0.0.1:8001/examples

Contributing
----
Interested in [contributing](CONTRIBUTING.md)?
