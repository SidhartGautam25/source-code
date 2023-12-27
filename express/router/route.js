'use strict';


var debug = require('debug')('express:router:route');
var flatten = require('array-flatten');
var Layer = require('./layer');
var methods = require('methods');

// so that next we dont have to write this whole thing
var slice = Array.prototype.slice;
var toString = Object.prototype.toString;

module.exports = Route;

function Route(path) {
  this.path = path;

  //stack stores the middleware and handlers associated with the route
  this.stack = [];

  debug('new %o', path)

  // route handlers for various http methods
  this.methods = {};
}

//adding prototype simply means that this _handle_method is available for Route instances
//also so each instance can call it
Route.prototype._handles_method = function _handles_method(method) {
    //this function simply return a boolean value,it returns true when the method 
    //if the current route instance is configured to handle the current
    //http method
    //if the route instance method is found in methods array,then it returns true
    //otherwise it return false

    /*
    app.all('/example', (req, res) => {
        res.send('This route handles all HTTP methods.');
      });
      when a route is called using all method,this means that this route should get
      handles for every method
      */
     //when we call app.all() express internally sets the _all flag of methods object 
     // to true
      
  if (this.methods._all) {
    return true;
  }

  // normalize name
  var name = typeof method === 'string'
    ? method.toLowerCase()
    : method


    //head is considered to be a get method in express
  if (name === 'head' && !this.methods['head']) {
    name = 'get';
  }

  //just checking the name is found in methods array or object or not
  return Boolean(this.methods[name]);
};



//The _options method in the Route class is responsible for determining the allowed
// HTTP methods for the current route. It returns an array of HTTP methods that 
//the route can handle
Route.prototype._options = function _options() {
  var methods = Object.keys(this.methods);

  // append automatic head
  if (this.methods.get && !this.methods.head) {
    methods.push('head');
  }

  for (var i = 0; i < methods.length; i++) {
    // make upper case
    methods[i] = methods[i].toUpperCase();
  }

  return methods;
};



Route.prototype.dispatch = function dispatch(req, res, done) {
  var idx = 0;
  var stack = this.stack;
  var sync = 0

  if (stack.length === 0) {
    return done();
  }
  var method = typeof req.method === 'string'
    ? req.method.toLowerCase()
    : req.method

  if (method === 'head' && !this.methods['head']) {
    method = 'get';
  }

  req.route = this;

  next();

  function next(err) {
    // signal to exit route
    if (err && err === 'route') {
      return done();
    }

    // signal to exit router
    if (err && err === 'router') {
      return done(err)
    }

    // max sync stack
    if (++sync > 100) {
      return setImmediate(next, err)
    }

    var layer = stack[idx++]

    // end of layers
    if (!layer) {
      return done(err)
    }

    if (layer.method && layer.method !== method) {
      next(err)
    } else if (err) {
      layer.handle_error(err, req, res, next);
    } else {
      layer.handle_request(req, res, next);
    }

    sync = 0
  }
};







/*
const express = require('express');
const app = express();

const myMiddleware = (req, res, next) => {
  console.log('This middleware will be executed for all routes and HTTP methods.');
  next();
};

// Create a route that applies myMiddleware to all HTTP methods for the path '/'
app.route('/').all(myMiddleware);

// Define a route handler for the path '/'
app.get('/', (req, res) => {
  res.send('Hello, World!');
});

app.listen(3000, () => {
  console.log('Server is listening on port 3000');
});


*/

/**
 * 
 * from above example we can see what all method is doing.
 * 
 * Route.prototype.all is a method added to the prototype of the Route class in Express.
 * It is used to associate middleware functions with a route.

The method takes any number of middleware functions as arguments and flattens them into an array using flatten(slice.call(arguments)).
This allows you to pass multiple middleware functions as separate arguments or as an array.

It then iterates over each middleware function in the handles array and checks if each one is a function. 
If not, it throws a TypeError indicating that Route.all() requires a callback function.

For each valid middleware function, it creates a new Layer with the specified path ('/'),
 an empty options object ({}), and the middleware function.

The layer.method is set to undefined, indicating that
 this middleware should be executed for all HTTP methods.

this.methods._all is set to true, indicating that this route handles all HTTP methods.

The layer is then pushed onto the route's stack. The stack is an array of layers
representing the middleware and handlers associated with the route.

Finally, the method returns this, allowing for method chaining.
 */






Route.prototype.all = function all() {

  var handles = flatten(slice.call(arguments));
  //The line var handles = flatten(slice.call(arguments)); is used to gather all the middleware functions
  //passed as arguments to the all method into a single array. This allows the all method to handle multiple middleware
  //functions provided in different ways: either as separate arguments or as an array.
/**
 * const express = require('express');
const app = express();

const middleware1 = (req, res, next) => {
  console.log('Middleware 1');
  next();
};

const middleware2 = (req, res, next) => {
  console.log('Middleware 2');
  next();
};

const middleware3 = (req, res, next) => {
  console.log('Middleware 3');
  next();
};

// Using the all method with separate arguments
app.all('/path1', middleware1, middleware2);

// Using the all method with an array of middleware functions
app.all('/path2', [middleware2, middleware3]);

app.listen(3000, () => {
  console.log('Server is listening on port 3000');
});

For the /path1 route, middleware1 and middleware2 are passed as separate arguments to app.all
 */
  for (var i = 0; i < handles.length; i++) {
    var handle = handles[i];

    if (typeof handle !== 'function') {//type should be a function as middleware are always a function in express
      var type = toString.call(handle);
      var msg = 'Route.all() requires a callback function but got a ' + type
      throw new TypeError(msg);//so throw an array if it is not an function
    }

    var layer = Layer('/', {}, handle);
    layer.method = undefined;

    this.methods._all = true;
    this.stack.push(layer);
  }

  return this;
};





methods.forEach(function(method){
  Route.prototype[method] = function(){
    var handles = flatten(slice.call(arguments));

    for (var i = 0; i < handles.length; i++) {
      var handle = handles[i];

      if (typeof handle !== 'function') {
        var type = toString.call(handle);
        var msg = 'Route.' + method + '() requires a callback function but got a ' + type
        throw new Error(msg);
      }

      debug('%s %o', method, this.path)

      var layer = Layer('/', {}, handle);
      layer.method = method;

      this.methods[method] = true;
      this.stack.push(layer);
    }

    return this;
  };
});