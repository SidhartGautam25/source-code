
'use strict';

var Route = require('./route');
var Layer = require('./layer');
var methods = require('methods');
var mixin = require('utils-merge');
var debug = require('debug')('express:router');
var deprecate = require('depd')('express');
var flatten = require('array-flatten');
var parseUrl = require('parseurl');
var setPrototypeOf = require('setprototypeof')

var objectRegExp = /^\[object (\S+)\]$/;
var slice = Array.prototype.slice;
var toString = Object.prototype.toString;


var proto = module.exports = function(options) {
    //provided option
  var opts = options || {};
 
  //main router function which just call router.handle() 
  function router(req, res, next) {
    router.handle(req, res, next);
  }

  // mixin Router class functions
  setPrototypeOf(router, proto)//mixing proto methods to router 


  //variables which we need ahead
  router.params = {};
  router._params = [];
  router.caseSensitive = opts.caseSensitive;
  router.mergeParams = opts.mergeParams;
  router.strict = opts.strict;
  router.stack = [];


  //returning a function that is extended with methods from a prototype provides a flexible
  // and organized way to create and manage instances of a router with shared functionality.
  // It aligns with principles of modularity, extensibility, and code organization.
  return router;
};


//The proto.param method in the Express router is responsible for handling route parameters. 
//It allows you to define middleware functions that will be executed when certain parameters are present in the route
/**
 * 
 * // Define a param middleware function for 'userId'
app.param('userId', function (req, res, next, userId) {
  // Custom logic for handling 'userId'
  req.user = getUserById(userId);
  next();
});

// Route with the 'userId' parameter
app.get('/users/:userId', function (req, res) {
  // Access the 'user' property set by the param middleware
  res.send(`User details: ${JSON.stringify(req.user)}`);
});
 */
//from the above example you can see what is the use of of this method in express app
//also from the example we can see that this param method takes two parameters,
//first is parameter name and then a function which do something when that parameter is used in a call
proto.param = function param(name, fn) {
  // param logic
  if (typeof name === 'function') {
    //name should not be a function because that it deprecated
    deprecate('router.param(fn): Refactor to use path params');
    this._params.push(name);
    return;
  }

  // apply param functions
  var params = this._params;
  //this._params is an array that holds the existing param functions for the router. 
  //These functions are associated with specific parameter names and are executed when a route contains those parameters.
  var len = params.length;
  var ret;
  // ret is a variable that will be used to store the return value of param functions during the iteration.
  // If a param function returns a value (which is used to modify the middleware function), that value will be stored in ret.

  if (name[0] === ':') {
    //initializing parameters with : is deprecated
    deprecate('router.param(' + JSON.stringify(name) + ', fn): Use router.param(' + JSON.stringify(name.slice(1)) + ', fn) instead')
    //remove that : from the parameters
    name = name.slice(1)
  }

  for (var i = 0; i < len; ++i) {
    // in this if condition,first a function is called and it is params[i](name,fn) and its return type is stored
    // in ret and then if is checking it is true or false
    if (ret = params[i](name, fn)) {
      fn = ret;
    }
  }

  // ensure we end up with a
  // middleware function
  if ('function' !== typeof fn) {
    // fn should be a function
    throw new Error('invalid param() call for ' + name + ', got ' + fn);
  }

  (this.params[name] = this.params[name] || []).push(fn);
  return this;
};

//The callback function that signals the completion of the current middleware or route handler.
//simply means next function
proto.handle = function handle(req, res, out) {
    // The proto.handle() method sets up the initial state, prepares the request object, and invokes the next
    // function to start the routing process.
    // The next function iterates through the middleware and routes, allowing each to handle the request or pass control to the next.

  var self = this;
  // The line var self = this; is a common JavaScript pattern used to capture the reference to the current
  // object (this) in a variable named self
  // This pattern is often used to avoid issues related to the changing context of this within nested functions or callbacks.

  debug('dispatching %s %s', req.method, req.url);

  var idx = 0; // This variable is used as an index to keep track of the current layer in the stack that is being processed.
  var protohost = getProtohost(req.url) || ''//protohost is a string representing the protocol and host of the URL.
  // The getProtohost function is used to extract this information from the req.url.
  // If getProtohost returns null or undefined, an empty string is assigned to protohost.

  var removed = ''; //This variable is used to store a portion of the URL that may be removed during processing.
  // It is initially an empty string.

  var slashAdded = false;// This boolean variable is used to track whether a leading slash has been added
  // to the URL during processing.

  var sync = 0//sync is there so that calls to next dont go infinite

  var paramcalled = {};// This object is used to keep track of parameters that have been called during the
  // processing of layers. It helps in handling parameters efficiently and avoids redundant processing.

  // store options for OPTIONS request
  // only used if OPTIONS request
  var options = [];

  // middleware and routes
  var stack = self.stack;

  // manage inter-router variables
  var parentParams = req.params;
  var parentUrl = req.baseUrl || '';

  // handling the restoration of certain properties on the req (request) object 
  // we are passing baseurl,next,params to restore these parameters of req object
  // out is the function which will get executed,actually it is a middleware,
  // subapp middleware 
  var done = restore(out, req, 'baseUrl', 'next', 'params');
  // here done is a function which when called restore the provided parameters of req object
  /**
   * By restoring 'baseUrl' after the middleware or router completes its processing, it ensures 
   * that subsequent middleware or routers in the stack receive the correct baseUrl
   */

  /**
   * 'next':

             req.next is a reference to the next function in the middleware stack. Middleware functions 
             can modify or replace this function to control the flow of execution.

             Restoring 'next' ensures that the original next function is available for subsequent middleware 
             or routers. This is crucial for maintaining the correct flow of control through the middleware stack.
   */
  /**
   * 'params':

             req.params holds the route parameters extracted from the URL. In the context of routers, 
             these parameters may be modified during the handling of a request.

             Restoring 'params' is necessary to ensure that subsequent middleware or routers 
             receive the original route parameters.
   */

  // setup next layer
  req.next = next;

  // for options requests, respond with a default if nothing else responds
  if (req.method === 'OPTIONS') {
    done = wrap(done, function(old, err) {
      if (err || options.length === 0) return old(err);
      sendOptionsResponse(res, options, old);
    });
  }

  // setup basic req values
  // if it a next route,then parent url become base for this route
  req.baseUrl = parentUrl;
 
  // This line ensures that req.originalUrl retains its original value, even if subsequent middleware 
  // functions modify req.url. It prevents modifications to req.url from affecting the original URL.
  req.originalUrl = req.originalUrl || req.url;

  next();

  // the next function is responsible for managing the flow of control through the middleware stack, 
  // handling errors, and ensuring the proper restoration of the request object's state after each layer's processing
  function next(err) {

    // it suggests that if an error of type 'route' is encountered, 
    // layerError is set to null to indicate that there is no specific error related to a route
    var layerError = err === 'route'
      ? null
      : err;

    // remove added slash
    // if there is a slash in the req.url,so remove it
    if (slashAdded) {
      req.url = req.url.slice(1)
      slashAdded = false;
    }

    // restore altered req.url
    // The purpose of this block is to handle cases where a portion of the URL path was temporarily removed 
    // for processing within the middleware or routing logic. After the processing is done, it restores 
    // the URL to its original state. 
    if (removed.length !== 0) {

        // restoring the baseUrl from parentUrl
      req.baseUrl = parentUrl;
      req.url = protohost + removed + req.url.slice(protohost.length)
      removed = '';
    }

    // signal to exit router
    // This condition checks whether the layerError variable is set to the string value 'router'. 
    // This typically indicates that the current layer encountered an error related to routing, and the router should exit.
    if (layerError === 'router') {
 
        // If the condition is true, it calls the done function asynchronously using setImmediate. 
        // The done function is typically a callback that signals the completion of the router's handling. 
        // Passing null as an argument to done implies that there was no error in the router.
       setImmediate(done, null)
      return
    }

    // no more matching layers
    if (idx >= stack.length) {
        // it means all middleware got executed and the array is traversed completely
      setImmediate(done, layerError);
      return;
    }

    // max sync stack
    if (++sync > 100) {

     // If the condition is true (meaning there have been more than 100 synchronous calls), 
     // it schedules the next function to be called asynchronously using setImmediate. This helps break
     // the synchronous execution chain and allows the event loop to handle other tasks 
     // before resuming the function execution.
      return setImmediate(next, err)
    }

    // get pathname of request
    var path = getPathname(req);

    if (path == null) {
        // the done function is called with the layerError, signaling that there's an error in processing the request.
      return done(layerError);
    }

    // find next matching layer
    var layer;
    var match;
    var route;

    // The loop is a fundamental part of Express routing, determining which layer (middleware or route) 
    // should handle the incoming request.
    while (match !== true && idx < stack.length) {
      layer = stack[idx++]; // current layer
      match = matchLayer(layer, path); // match value will be true if path is equal to this layer regular expression
      // indication that this layer should get executed 

      route = layer.route;

      if (typeof match !== 'boolean') {
        // hold on to layerError
        layerError = layerError || match;
      }

      if (match !== true) {
        // if not matched,just go to next layer
        continue;
      }

      if (!route) {
        // process non-route handlers normally
        continue;
      }

      if (layerError) {
        // routes do not match with a pending error
        match = false;
        continue;
      }

      var method = req.method;
      var has_method = route._handles_method(method); // this method return true or false
      // returns true if given arg(method here) can be handled by this route 

      // build up automatic options response
      if (!has_method && method === 'OPTIONS') {
        // appendMethods simply append the given method to the list
        // route._options() returns an array of HTTP methods that the route supports
        appendMethods(options, route._options());
      }

      // don't even bother matching route
      if (!has_method && method !== 'HEAD') {
        match = false;
      }
    }

    // no match
    if (match !== true) {
      return done(layerError);
    }

    // store route for dispatch on change
    if (route) {
        // simply assigning route to req.route 
      req.route = route;
    }

    // Capture one-time layer values
    // mergeParams is a function which simply add first arg object parameters to second obj
    req.params = self.mergeParams
      ? mergeParams(layer.params, parentParams)
      : layer.params;
    var layerPath = layer.path;

    // this should be done for the layer
    self.process_params(layer, paramcalled, req, res, function (err) {
      if (err) {
        next(layerError || err)
      } else if (route) {
        layer.handle_request(req, res, next)
      } else {
        trim_prefix(layer, layerError, layerPath, path)
      }

      sync = 0
    });
  }

  function trim_prefix(layer, layerError, layerPath, path) {
    if (layerPath.length !== 0) {
      // Validate path is a prefix match
      if (layerPath !== path.slice(0, layerPath.length)) {
        next(layerError)
        return
      }

      // Validate path breaks on a path separator
      var c = path[layerPath.length]
      if (c && c !== '/' && c !== '.') return next(layerError)

      // Trim off the part of the url that matches the route
      // middleware (.use stuff) needs to have the path stripped
      debug('trim prefix (%s) from url %s', layerPath, req.url);
      removed = layerPath;
      req.url = protohost + req.url.slice(protohost.length + removed.length)

      // Ensure leading slash
      if (!protohost && req.url[0] !== '/') {
        req.url = '/' + req.url;
        slashAdded = true;
      }

      // Setup base URL (no trailing slash)
      req.baseUrl = parentUrl + (removed[removed.length - 1] === '/'
        ? removed.substring(0, removed.length - 1)
        : removed);
    }

    debug('%s %s : %s', layer.name, layerPath, req.originalUrl);

    if (layerError) {
      layer.handle_error(layerError, req, res, next);
    } else {
      layer.handle_request(req, res, next);
    }
  }
};


proto.process_params = function process_params(layer, called, req, res, done) {
  var params = this.params;

  // captured parameters from the layer, keys and values
  var keys = layer.keys;

  // fast track
  if (!keys || keys.length === 0) {
    return done();
  }

  var i = 0;
  var name;
  var paramIndex = 0;
  var key;
  var paramVal;
  var paramCallbacks;
  var paramCalled;

  // process params in order
  // param callbacks can be async
  function param(err) {
    if (err) {
      return done(err);
    }

    if (i >= keys.length ) {
      return done();
    }

    paramIndex = 0;
    key = keys[i++];
    name = key.name;
    paramVal = req.params[name];
    paramCallbacks = params[name];
    paramCalled = called[name];

    if (paramVal === undefined || !paramCallbacks) {
      return param();
    }

    // param previously called with same value or error occurred
    if (paramCalled && (paramCalled.match === paramVal
      || (paramCalled.error && paramCalled.error !== 'route'))) {
      // restore value
      req.params[name] = paramCalled.value;

      // next param
      return param(paramCalled.error);
    }

    called[name] = paramCalled = {
      error: null,
      match: paramVal,
      value: paramVal
    };

    paramCallback();
  }

  // single param callbacks
  function paramCallback(err) {
    var fn = paramCallbacks[paramIndex++];

    // store updated value
    paramCalled.value = req.params[key.name];

    if (err) {
      // store error
      paramCalled.error = err;
      param(err);
      return;
    }

    if (!fn) return param();

    try {
      fn(req, res, paramCallback, paramVal, key.name);
    } catch (e) {
      paramCallback(e);
    }
  }

  param();
};

// This function is used to add middleware functions to the router stack
proto.use = function use(fn) {
  var offset = 0;

  var path = '/';//  The default path for the middleware is set to '/'. This path will be used if a 
  // specific path is not provided when adding middleware.

  // default path to '/'
  // disambiguate router.use([fn])
  if (typeof fn !== 'function') {
    // responsible for handling cases where the first argument might be a path instead of a middleware function.
    // It checks if the first argument is not a function and then tries to determine if it's a path or an array of paths.
    /**
     * 
        // Example 1: Use middleware with a specific path
           app.use('/special', middlewareFunction);

        // Example 2: Use middleware with an array of paths
           app.use(['/path1', '/path2'], middlewareFunction);

     */
    var arg = fn;
    //This is done to handle the case where an array of paths is mistakenly provided as the first argument.
    while (Array.isArray(arg) && arg.length !== 0) {
      arg = arg[0];
    }

    // first arg is the path
    if (typeof arg !== 'function') {
      offset = 1;
      // The offset variable is used to determine where the middleware functions start in the arguments. It is initially set to 0.
      path = fn;
    }
  }

  var callbacks = flatten(slice.call(arguments, offset));//It slices the arguments starting from the offset index
  // In JavaScript, the arguments object is an array-like object available in all functions,
  // representing the arguments passed to that function.
  
  
  // The slice.call() method is used to convert the arguments object into an array. The slice method is a generic
  // method in JavaScript that can be applied to arrays or array-like objects

  //   The flatten function is used to transform nested arrays into a flat array. 
  // It's a utility function that ensures that middleware functions provided to the proto.use method are all 
  // collected into a single flat array, regardless of whether they are provided as individual arguments, as an array, 
  // or within nested arrays.

  // The callbacks array, in this context, will contain all the middleware functions in a flat structure,
  // making it easier to iterate over them and process them uniformly.


  if (callbacks.length === 0) {
    //when there is no middleware given
    throw new TypeError('Router.use() requires a middleware function')
  }

  for (var i = 0; i < callbacks.length; i++) {
    var fn = callbacks[i]; //middleware function

    if (typeof fn !== 'function') {
        // middleware should be a function 
      throw new TypeError('Router.use() requires a middleware function but got a ' + gettype(fn))
    }

    // add the middleware
    debug('use %o %s', path, fn.name || '<anonymous>')

    //creating a layer according to given path and given middleware function
    var layer = new Layer(path, {
      sensitive: this.caseSensitive,
      strict: false,
      end: false
    }, fn);

    layer.route = undefined;
    // layer.route: This line sets the route property of the layer to undefined. The route property is used to reference
    // a route when the layer is part of a route. However, since this layer is a standalone middleware (not part of a route),
    // the route property is not applicable and is set to undefined.

    this.stack.push(layer); //now push this layer into the stack of app
  }

  return this;
  // this one simple line is very important and serve a very important purpose 
  // we know that we can write app.use(middileware1).use(middleware2)
  // this is called chaining
  // and we are able to do that just because of this line
  // since this function is returning this means it is returning app
  // so we can replace app.use() with app
  // hence app.use(mid1).use(mid2) is equal to app.use(mid2)

};


proto.route = function route(path) {
    // creating a Route instance according to path provided
  var route = new Route(path);

  var layer = new Layer(path, {
    sensitive: this.caseSensitive,
    strict: this.strict,
    end: true
  }, route.dispatch.bind(route));

  layer.route = route;
  // This line explicitly associates the created layer with a specific route. This association is crucial
  // because it allows Express to recognize that this layer is part of a route, and it helps in handling 
  // route-specific behavior when processing requests.

  // a "route-specific middleware" refers to middleware functions or handlers that are associated with a 
  // specific route. This means that these middleware functions will only be executed when a 
  // request matches the defined route.

  // pussing this layer to the stack
  this.stack.push(layer);

  // chaining purpose
  return route;
};

// create Router#VERB functions
// first add(concat) all method to methods array
// then for every method
// 
methods.concat('all').forEach(function(method){
    // router.get
  proto[method] = function(path){
    // route function returns a instance of Route and also this method add a layer related to this 
    // path to the stack
    var route = this.route(path)
    // route.get() or route.post()
    //  It uses apply to set the context (route) and pass the remaining arguments 
    // (starting from the second argument, skipping the path). 
    // This is a way of dynamically calling the method based on the HTTP verb.
    // simply speaking,route.get or post just push the layer into the stack
    route[method].apply(route, slice.call(arguments, 1));
    return this;
  };
});

// append methods to a list of methods
function appendMethods(list, addition) {
  for (var i = 0; i < addition.length; i++) {
    var method = addition[i];
    if (list.indexOf(method) === -1) {
      list.push(method);
    }
  }
}

// get pathname of request
function getPathname(req) {
  try {
    // This line attempts to parse the URL from the provided req object using the parseUrl function 
    // and then retrieves the pathname property from the parsed URL
    return parseUrl(req).pathname;
  } catch (err) {
    return undefined;
  }
}

// Get get protocol + host for a URL
function getProtohost(url) {
  if (typeof url !== 'string' || url.length === 0 || url[0] === '/') {
    return undefined
  }

  var searchIndex = url.indexOf('?')
  var pathLength = searchIndex !== -1
    ? searchIndex
    : url.length
  var fqdnIndex = url.slice(0, pathLength).indexOf('://')

  return fqdnIndex !== -1
    ? url.substring(0, url.indexOf('/', 3 + fqdnIndex))
    : undefined
}

// get type for error message
function gettype(obj) {
  var type = typeof obj;

  if (type !== 'object') {
    return type;
  }

  // inspect [[Class]] for objects
  return toString.call(obj)
    .replace(objectRegExp, '$1');
}


function matchLayer(layer, path) {
  try {
    return layer.match(path);
  } catch (err) {
    return err;
  }
}

// merge params with parent params
// this function simply add param to the parent object provided in the arg
function mergeParams(params, parent) {
  if (typeof parent !== 'object' || !parent) {
    return params;
  }

  // make copy of parent for base
  var obj = mixin({}, parent);

  // simple non-numeric merging
  if (!(0 in params) || !(0 in parent)) {
    return mixin(obj, params);
  }

  var i = 0;
  var o = 0;

  // determine numeric gaps
  while (i in params) {
    i++;
  }

  while (o in parent) {
    o++;
  }

  // offset numeric indices in params before merge
  for (i--; i >= 0; i--) {
    params[i + o] = params[i];

    // create holes for the merge when necessary
    if (i < o) {
      delete params[i];
    }
  }

  return mixin(obj, params);
}

// restore obj props after function
function restore(fn, obj) {

 // The restore function creates arrays (props and vals) to store the property names and their
 // original values.
 // length - 2 because fn and obj are function and object to be restore,exept these two,other
 // arguments are props which need to be restore 
  var props = new Array(arguments.length - 2);
  var vals = new Array(arguments.length - 2);

  for (var i = 0; i < props.length; i++) {
    // this loop just store the key value pair of original object
    props[i] = arguments[i + 2];
    vals[i] = obj[props[i]];
  }

  return function () {
    // restore vals
    for (var i = 0; i < props.length; i++) {
      obj[props[i]] = vals[i];
    }
    

    // The purpose of this code is to invoke the original function (fn) within the correct context 
    // (this) and with the same arguments that were initially passed to the enclosing function.
    // It ensures that the original behavior of the function is preserved even though the 
    // function might have been wrapped or modified in some way.
    return fn.apply(this, arguments);
  };
}

// send an OPTIONS response
function sendOptionsResponse(res, options, next) {
  try {
    var body = options.join(',');
    res.set('Allow', body);
    res.send(body);
  } catch (err) {
    next(err);
  }
}

// wrap a function
function wrap(old, fn) {
  return function proxy() {
    var args = new Array(arguments.length + 1);

    args[0] = old;
    for (var i = 0, len = arguments.length; i < len; i++) {
      args[i + 1] = arguments[i];
    }

    fn.apply(this, args);
  };
}