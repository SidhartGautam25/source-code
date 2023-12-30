
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

    // In Express.js, the mergeParams property is a configuration option for a router. 
    // It determines whether the router should merge route parameters from its parent 
    // router. The self in self.mergeParams typically refers to the router instance itself.

    //  By default, the mergeParams property is set to true. This means that a 
    // router inherits and merges the route parameters from its parent router.

    /**
     * const parentRouter = express.Router();
       const childRouter = express.Router();

       parentRouter.param('id', (req, res, next, id) => {
           console.log('Parent router parameter:', id);
           next();
       });

        childRouter.get('/:id', (req, res) => {
            console.log('Child router parameter:', req.params.id);
            res.send('Nested Route');
        });

        // Enable mergeParams for the childRouter
        childRouter.mergeParams = true;

        app.use('/parent', parentRouter);
        parentRouter.use('/child', childRouter);
     */
    // In this example, a request to /parent/child/123 will trigger both the parent 
    // and child router handlers. The child router can access the id parameter set 
    // by the parent router because mergeParams is enabled.

    //merging is done
    req.params = self.mergeParams
      ? mergeParams(layer.params, parentParams)
      : layer.params;
    // finally layerpath get accessed
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

  // The trim_prefix function is responsible for trimming the matched portion of the 
  // URL from the request URL, adjusting the req.url, req.baseUrl, and other related 
  // properties.
  /**
   * 
   * ex:
   *   app.use('/example', function(req, res, next) {
            // Route handler logic
       });

       Now, suppose you make a request to your server with the URL path 
       /example/some/route. When this request matches the /example route, 
       the trim_prefix function is invoked.

       Here's what happens step by step:

       Matching:

          The route path is /example.
          The current request path is /example/some/route.

       Prefix Check:

          The function checks if the route path (/example) is a prefix match for the 
          request path (/example/some/route), which is true.

       Trimming:

            The function trims off the matched part (/example) from the request URL.
            The modified req.url becomes /some/route.

       Base URL Adjustment:

            The function adjusts the req.baseUrl to /example.
            If there's a trailing slash in the trimmed part, 
            it removes it from req.baseUrl.
            So, after this process, the request is effectively transformed, 
            and the Express router handles it as if the request path were /some/route. 
            The req.baseUrl is adjusted to reflect the matched route.
   */
  function trim_prefix(layer, layerError, layerPath, path) {
    if (layerPath.length !== 0) {
      // Validate path is a prefix match
      
      if (layerPath !== path.slice(0, layerPath.length)) {
        /**
       * Suppose you have a middleware associated with the path /example. 
       * If the current request path is /another/example, this condition will be 
       * true because /example is not a prefix of /another/example. As a result, 
       * the function will call next(layerError), passing control to the next 
       * middleware or route in the stack.
       */
      /**
       * layerPath is the path associated with the current layer in the Express router.
         path is the remaining path from the request.

        Prefix Check:

             path.slice(0, layerPath.length) extracts a substring of the path with a 
             length equal to the length of layerPath.
             The condition layerPath !== path.slice(0, layerPath.length) checks if the 
             layerPath is not equal to this extracted prefix.

        Next Middleware/Route:

             If the condition is true, it means that the layerPath is not a prefix of 
             the path.
             In this case, the next(layerError) is called, passing along the error to 
             the next middleware or route.
             The return; statement ensures that the function exits early.
       */
        next(layerError)
        return
      }

      // Validate path breaks on a path separator
      // c is a variable that represents the character in the path string at the position 
      // immediately following the matched layerPath. Let's break it down:
      /**
       * layerPath: /users
         path: /users/123
         In this case, layerPath.length is 6, and path[6] is / (the character immediately 
         following the end of layerPath). So, c would be / in this example.
       */
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
      // finally handling the request
      layer.handle_request(req, res, next);
    }
  }
};

// responsible for processing route parameters for a given layer
proto.process_params = function process_params(layer, called, req, res, done) {

  // getting the params of this Router instance  
  var params = this.params;

  // captured parameters from the layer, keys and values
  // layer.keys contain the parameter variables
  var keys = layer.keys;

  // fast track
  if (!keys || keys.length === 0) {
    // since there are no keys,there is no need to process or do anything
    // done means job is over of processing parameters
    return done();
  }

  
  var i = 0; // This variable is used as a counter to keep track of the index while iterating 
  // over the keys array. It helps in traversing the array of keys associated with
  // route parameters.

  var name; // : This variable is used to store the name of the current route parameter.
  // During the iteration over keys, name holds the name of the parameter associated 
  // with the current iteration.

  var paramIndex = 0; // current index of the callback function in paramCallbacks array

  var key; // This variable holds the current key object during the iteration over the 
  // keys array. A key object typically contains information about a route parameter, 
  // such as its name.

  var paramVal; //  This variable is an object that keeps track of whether a specific 
  // route parameter has been called before and, if so, with what values. It helps 
  // in determining whether to execute the parameter callbacks or skip them based on 
  // previous calls.

  var paramCallbacks; // This variable holds an array of callback functions 
  // associated with a specific route parameter. These callbacks are functions that 
  // will be executed in sequence for the processing of the route parameter.
  var paramCalled;

  // process params in order
  // param callbacks can be async
  function param(err) {
    if (err) {
      // if error just call done()
      return done(err);
    }

    if (i >= keys.length ) {
      // iteration is finally over
      return done();
    }
    
    // The outer loop (i loop) iterates through each route parameter.
    // For each route parameter, there is an inner loop (paramIndex loop) that iterates 
    // through the callbacks associated with that specific parameter.
    // At the start of processing a new route parameter, we want to reset paramIndex 
    // to 0 because we are about to process its callbacks from the beginning.
    // This ensures that when we encounter a new route parameter, we start with 
    // the first callback associated with that parameter.
    paramIndex = 0;
    /**
     * The key variable represents an object that describes a route parameter. It is an instance of the path-to-regexp library's Token class.
       This object contains information about the route parameter, such as its name (name property) and whether it is a wildcard (wild property).
       key.name holds the name of the route parameter.
       ex:
         key = { name: 'userId',
          prefix: '/', 
          delimiter: '/',
           optional: false, 
           repeat: false, 
           partial: false, 
           asterisk: false, 
           pattern: '[^\\/]+?' }
     */
    key = keys[i++];
    name = key.name;// The name variable holds the name of the current route parameter 
    // being processed.
    paramVal = req.params[name];
    paramCallbacks = params[name]; 
    // paramCallbacks is assigned the array of callback functions associated with the
    // current route parameter.
    // The params object holds route parameter names as keys, and the associated 
    // values are arrays of middleware functions/callbacks.

    paramCalled = called[name];
    // paramCalled is assigned the object from the called object,
    // which tracks whether a parameter has been processed before and its associated
    // information.
    // The called object is used to store information about whether a parameter has 
    // been called before, its value, and any errors associated with it.

    if (paramVal === undefined || !paramCallbacks) {
      // checks whether the current route parameter has a defined value (paramVal)
      // or if there are associated middleware functions/callbacks (paramCallbacks). 
      // If either condition is true, it means there are no further middleware 
      // functions to process for the current parameter, and the param function is 
      // immediately invoked, moving on to the next parameter or completing the 
      // parameter processing.
      return param();
    }

    // param previously called with same value or error occurred
    if (paramCalled && (paramCalled.match === paramVal
      || (paramCalled.error && paramCalled.error !== 'route'))) {
        // checks whether the current route parameter (paramVal) has been previously
        // called with the same value or if an error occurred during its processing. 
        // If either condition is true, it restores the original value of the parameter 
        // (paramCalled.value) and moves on to the next parameter by invoking the param 
        // function.
      

      // Restores the original value of the parameter (paramCalled.value) in the 
      // req.params object.
      req.params[name] = paramCalled.value;

      // next param
      // Invokes the param function with the error type from the previous call 
      // (paramCalled.error). This effectively skips the middleware functions associated 
      // with the current parameter and moves on to the next parameter.
      return param(paramCalled.error);
    }


    /**
     * Creates an object ({ error: null, match: paramVal, value: paramVal }) representing 
     * the state of the parameter during its processing.
     * 
       Assigns this object to both called[name] and paramCalled. This means that 
       called[name] and paramCalled now reference the same object.

       called: This object is used to keep track of the state of all route parameters. 
              It is an associative array where the keys are parameter names, and the 
              values are objects representing the parameter state.

       paramCalled: This variable is a reference to the object representing the state 
               of the current parameter.
     */
    called[name] = paramCalled = {
      error: null,
      match: paramVal,
      value: paramVal
    };
    
    // Invokes the paramCallback function, initiating the processing of the next 
    // middleware function associated with the parameter.
    paramCallback();
  }


  // This function is responsible for executing the individual middleware functions 
  // associated with the parameter. It will be called iteratively until all middleware 
  // functions have been processed.
  function paramCallback(err) {
    // Get the middleware function associated with the parameter
    var fn = paramCallbacks[paramIndex++];

    // store updated value
    // Store the updated value of the parameter
    paramCalled.value = req.params[key.name];


    // If an error occurred during middleware processing
    if (err) {
      // store error
      // Store the error in the parameter's state
      paramCalled.error = err;
      // Invoke the next middleware function in the error state
      param(err);
      return;
    }

    // If there are no more middleware functions for the parameter, exit
    if (!fn) return param();

    try {
      // Invoke the middleware function with required parameters
      fn(req, res, paramCallback, paramVal, key.name);
    } catch (e) {
       // If an exception occurs during middleware execution, handle it
      paramCallback(e);
    }
  }

  // The param() function is invoked at the end to continue the processing of the 
  // next middleware function or parameter in the chain.
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